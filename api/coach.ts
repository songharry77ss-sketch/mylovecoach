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
import { analyticsEnabled, insert } from './_supabase';

export const config = { maxDuration: 120 };

/**
 * 무단 대량 호출 억제용 간이 제한 (IP 당 10분에 60회).
 * 연애 연습은 한 마디마다 요청이 가서 예전(30회)보다 넉넉하게 둔다.
 * 서버리스 인스턴스별 메모리에만 있으므로 완벽하지 않지만, 한 인스턴스로 몰리는 반복 호출은 걸러 준다.
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 60;
const hits = new Map<string, number[]>();

function rateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return recent.length > RATE_MAX;
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
 * 코칭 기록 저장 — 이용 기록 수집에 동의한 앱만 x-device-id 헤더를 보냅니다.
 * 동의 헤더가 없으면 아무것도 기록하지 않습니다. 캡처 이미지는 저장하지 않습니다.
 */
async function logCoach(
  req: VercelRequest,
  coachReq: { crush: Record<string, unknown>; tone?: string; text?: string; image?: unknown },
  result: { analysis?: Record<string, unknown>; provider?: string; error?: string },
  startedAt: number,
): Promise<void> {
  const deviceId = req.headers['x-device-id'];
  if (typeof deviceId !== 'string' || !deviceId || !analyticsEnabled()) return;
  const sessionId = typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'] : undefined;
  const a = result.analysis;
  await insert('coach_log', {
    device_id: deviceId.slice(0, 64),
    session_id: sessionId ? toUuid(sessionId) : null,
    crush_alias: (coachReq.crush?.name as string) ?? null,
    crush_gender: (coachReq.crush?.gender as string) ?? null,
    crush_age: (coachReq.crush?.age as number) ?? null,
    crush_mbti: (coachReq.crush?.mbti as string) ?? null,
    relationship: (coachReq.crush?.relationship as string) ?? null,
    tone: coachReq.tone ?? null,
    question: coachReq.text ?? null,
    has_image: Boolean(coachReq.image),
    temperature: (a?.temperature as string) ?? null,
    interest_score: (a?.interestScore as number) ?? null,
    summary: (a?.summary as string) ?? null,
    reply_texts: Array.isArray(a?.replies) ? (a.replies as { text: string }[]).map((r) => r.text) : null,
    next_step: (a?.nextStep as string) ?? null,
    provider: result.provider ?? null,
    latency_ms: Date.now() - startedAt,
    error: result.error ?? null,
  });
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

  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) {
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
