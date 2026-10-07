/**
 * Vercel Serverless Function: POST /api/coach
 * 앱에서 받은 대화 캡처 + 프로필을 AI 에 전달하고 구조화된 코칭 결과를 돌려줍니다.
 * 요청 본문의 mode 로 다른 기능도 처리합니다 (없으면 예전 앱의 코칭 요청):
 *   coach(코칭) · report(상대 분석 보고서) · mind(속마음 풀이) · practice(연애 연습 상대역)
 * 환경변수:
 *   ANTHROPIC_API_KEY 또는 GEMINI_API_KEY (둘 중 하나 필수. 둘 다 있으면 AI_PROVIDER 로 선택, 기본 anthropic)
 *   AI_PROVIDER = anthropic | gemini (선택), GEMINI_MODEL (선택, 기본 gemini-3.5-flash)
 *   COACH_APP_TOKEN (선택, 앱 토큰 검사)
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { buildTask, parseAiRequest, type AiTask } from '../src/lib/ai-tasks';
import { COACH_MODEL } from '../src/lib/coach-schema';
import { callGeminiTask } from '../src/lib/gemini';
import { clientIp, rateLimited, storedKb } from './_limits';
import { analyticsEnabled, consentVersionOk, DEVICE_ID, insert, rpc } from './_supabase';

export const config = { maxDuration: 120 };

/**
 * 무단 대량 호출 억제용 간이 제한 (IP 당 10분에 60회).
 * 연애 연습은 한 마디마다 요청이 가서 예전(30회)보다 넉넉하게 둔다.
 * 서버리스 인스턴스별 메모리에만 있으므로 완벽하지 않지만, 한 인스턴스로 몰리는 반복 호출은 걸러 준다.
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 60;
/** 하루 전체 코칭 기록 저장량 상한 (저장할 내용의 크기 KB, 무료 DB 가 차지 않게) */
const dailyKb = () => Number(process.env.COACH_DAILY_KB) || 5_000;
const MIN_AGE = 14;

const cut = (value: unknown, max: number): string | null => (typeof value === 'string' && value ? value.slice(0, max) : null);

/**
 * 저장할 코칭 기록 한 줄 — 글은 길이를 잘라 저장한다 (한 요청이 저장소를 채우지 못하게).
 * 붙여 넣은 대화는 앱에서 700자까지 보내므로 질문은 1,000자까지 남긴다.
 */
export function coachLogRow(
  deviceId: string,
  sessionId: string | undefined,
  coachReq: { crush: Record<string, unknown>; tone?: string; text?: string; image?: unknown },
  result: { analysis?: Record<string, unknown>; provider?: string; error?: string },
  latencyMs: number,
): Record<string, unknown> {
  const a = result.analysis;
  const age = coachReq.crush?.age;
  return {
    device_id: deviceId.slice(0, 64),
    session_id: sessionId ? toUuid(sessionId) : null,
    crush_alias: cut(coachReq.crush?.name, 40),
    crush_gender: cut(coachReq.crush?.gender, 16),
    crush_age: typeof age === 'number' && Number.isFinite(age) ? Math.round(age) : null,
    crush_mbti: cut(coachReq.crush?.mbti, 8),
    relationship: cut(coachReq.crush?.relationship, 24),
    tone: cut(coachReq.tone, 24),
    question: cut(coachReq.text, 1000),
    has_image: Boolean(coachReq.image),
    temperature: cut(a?.temperature, 16),
    interest_score: typeof a?.interestScore === 'number' ? Math.round(a.interestScore) : null,
    summary: cut(a?.summary, 500),
    reply_texts: Array.isArray(a?.replies)
      ? (a.replies as { text?: unknown }[]).slice(0, 5).map((r) => cut(r?.text, 300) ?? '')
      : null,
    next_step: cut(a?.nextStep, 300),
    provider: cut(result.provider, 16),
    latency_ms: Math.max(0, Math.round(latencyMs)),
    error: cut(result.error, 200),
  };
}

function resolveProvider(): 'anthropic' | 'gemini' | null {
  const wanted = (process.env.AI_PROVIDER ?? '').toLowerCase();
  if (wanted === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  if (wanted === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return null;
}

/**
 * 코칭 기록 저장 — 이용 기록 수집에 동의한 앱만 x-device-id·x-consent-version 헤더를 보냅니다.
 * 기기 ID 가 없거나 동의 판이 2 미만(미리 체크된 예전 동의)이면 아무것도 기록하지 않습니다. 캡처 이미지는 저장하지 않습니다.
 * 만 14세 미만으로 입력한 이용자의 요청과, 하루 저장 상한을 넘은 요청도 기록하지 않습니다.
 */
async function logCoach(
  req: VercelRequest,
  coachReq: { crush: Record<string, unknown>; user?: Record<string, unknown>; tone?: string; text?: string; image?: unknown },
  result: { analysis?: Record<string, unknown>; provider?: string; error?: string },
  startedAt: number,
): Promise<void> {
  const deviceId = req.headers['x-device-id'];
  if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId) || !analyticsEnabled()) return;
  // 직접 체크해 받은 동의(판 2 이상)만 저장한다 — 판 표시가 없으면 예전 미리 체크된 동의
  if (!consentVersionOk(req.headers['x-consent-version'])) return;
  const age = coachReq.user?.age;
  if (typeof age === 'number' && age < MIN_AGE) return;
  const sessionId = typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'] : undefined;
  const row = coachLogRow(deviceId, sessionId, coachReq, result, Date.now() - startedAt);
  // 하루 저장량(크기)·DB 전체 크기 상한을 넘으면 기록하지 않는다 (상한 함수를 못 부르면 그대로 저장)
  if ((await rpc<boolean>('take_quota', { p_kind: 'coach', p_units: storedKb(row), p_limit: dailyKb() })) === false) return;
  await insert('coach_log', row);
}

function toUuid(id: string): string {
  const hex = Array.from(id)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(32, '0')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }
  const provider = resolveProvider();
  if (!provider) {
    res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY 또는 GEMINI_API_KEY가 설정되지 않았어요.' });
    return;
  }
  const expectedToken = process.env.COACH_APP_TOKEN;
  if (expectedToken && req.headers['x-app-token'] !== expectedToken) {
    res.status(401).json({ error: '앱 인증에 실패했어요.' });
    return;
  }

  if (rateLimited('coach', clientIp(req), RATE_MAX, RATE_WINDOW_MS)) {
    res.status(429).json({ error: '요청이 많아요. 잠시 후 다시 시도해주세요.' });
    return;
  }

  const parsed = parseAiRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: '요청 형식이 올바르지 않아요.', issues: parsed.issues.slice(0, 3) });
    return;
  }
  const task: AiTask = buildTask(parsed);
  // 코칭만 (이용 기록에 동의한 앱에 한해) 기록한다. 보고서·속마음·연습 내용은 저장하지 않는다
  const log = (result: { analysis?: Record<string, unknown>; provider?: string; error?: string }) =>
    parsed.mode === 'coach' ? logCoach(req, parsed.req, result, startedAt) : Promise.resolve();
  const reply = (output: unknown, usage: unknown) =>
    res.status(200).json(parsed.mode === 'coach' ? { analysis: output, usage, provider } : { mode: parsed.mode, result: output, usage, provider });

  if (provider === 'gemini') {
    try {
      const result = await callGeminiTask(task, process.env.GEMINI_API_KEY!, { model: process.env.GEMINI_MODEL });
      if (!result.ok) {
        await log({ provider, error: result.code });
        res.status(result.code === 'auth' ? 500 : result.code === 'rate_limit' ? 429 : result.code === 'refused' ? 422 : 502).json({ error: result.message });
        return;
      }
      const json = task.schema.safeParse(JSON.parse(result.text));
      if (!json.success) {
        await log({ provider, error: 'parse' });
        res.status(502).json({ error: '응답 형식이 올바르지 않아요. 다시 시도해주세요.' });
        return;
      }
      const output = task.normalize(json.data);
      await log({ analysis: output as Record<string, unknown>, provider });
      reply(output, result.usage);
    } catch {
      res.status(502).json({ error: 'AI 서버와 통신하지 못했어요.' });
    }
    return;
  }

  try {
    const client = new Anthropic();
    const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [{ type: 'text', text: task.context }];
    if (task.image) content.push({ type: 'image', source: { type: 'base64', media_type: task.image.mediaType, data: task.image.base64 } });
    content.push({ type: 'text', text: task.task });
    const response = await client.beta.messages.parse({
      model: COACH_MODEL,
      max_tokens: 16000,
      // 안전 분류기가 거절하면 서버가 권장 대체 모델로 다시 돌린다
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: task.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      output_config: { effort: 'medium', format: betaZodOutputFormat(task.schema) },
    });

    if (response.stop_reason === 'refusal') {
      res.status(422).json({ error: '이 대화는 코칭해드리기 어려워요. 다른 내용으로 시도해주세요.' });
      return;
    }
    if (!response.parsed_output) {
      res.status(502).json({ error: '응답을 이해하지 못했어요. 다시 시도해주세요.' });
      return;
    }
    const output = task.normalize(response.parsed_output);
    await log({ analysis: output as Record<string, unknown>, provider });
    reply(output, { input: response.usage.input_tokens, output: response.usage.output_tokens });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: '서버 API 키가 올바르지 않아요.' });
    } else if (error instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: '요청이 많아요. 잠시 후 다시 시도해주세요.' });
    } else if (error instanceof Anthropic.BadRequestError) {
      res.status(400).json({ error: `요청을 처리하지 못했어요: ${error.message}` });
    } else if (error instanceof Anthropic.APIError) {
      res.status(502).json({ error: `AI 서버 오류 (${error.status ?? 'unknown'})` });
    } else {
      res.status(500).json({ error: '알 수 없는 오류가 발생했어요.' });
    }
  }
}
