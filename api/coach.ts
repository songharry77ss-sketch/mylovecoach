/**
 * Vercel Serverless Function: POST /api/coach
 * 앱에서 받은 대화 캡처 + 프로필을 Gemini 에 전달하고 구조화된 코칭 결과를 돌려줍니다.
 * 요청 본문의 mode 로 다른 기능도 처리합니다 (없으면 예전 앱의 코칭 요청):
 *   coach(코칭) · report(상대 분석 보고서) · mind(속마음 풀이) · practice(연애 연습 상대역)
 * 중계 요청은 Google(Gemini)로만 보냅니다. 앱의 AI 분석 동의 시트(src/lib/coach-client.ts 의 RELAY_ROUTE)와
 * 개인정보 처리방침 2번이 받는 곳을 Google 로 안내하기 때문입니다 — 다른 회사로 바꾸려면 셋을 같이 고칠 것.
 * 환경변수:
 *   GEMINI_API_KEY (필수 — 없으면 500. 다른 회사 키가 있어도 그쪽으로 보내지 않음), GEMINI_MODEL (선택, 기본 gemini-3.5-flash)
 *   COACH_APP_TOKEN (선택, 앱 토큰 검사)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { buildTask, parseAiRequest, type AiTask } from '../src/lib/ai-tasks';
import { callGeminiTask } from '../src/lib/gemini';
import { analyticsEnabled, insert } from './_supabase';

export const config = { maxDuration: 120 };

/** 이 서버가 내용을 보내는 AI 회사 — 앱이 x-ai-consent 헤더로 알려 주는 「사용자가 동의한 회사」와 같아야 보낸다 */
const RELAY_COMPANY = 'google';

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았어요.' });
    return;
  }
  const provider = 'gemini';
  const expectedToken = process.env.COACH_APP_TOKEN;
  if (expectedToken && req.headers['x-app-token'] !== expectedToken) {
    res.status(401).json({ error: '앱 인증에 실패했어요.' });
    return;
  }
  // 앱은 사용자가 보내도 된다고 동의한 AI 회사를 알려 준다. 이 서버가 보낼 회사와 다르면 동의받지 않은 곳으로 가게 되므로 AI 를 부르지 않는다.
  // 헤더가 없는 예전 앱(심사 중인 1.0 등)은 그대로 받는다
  const consented = req.headers['x-ai-consent'];
  if (consented !== undefined && consented !== RELAY_COMPANY) {
    res.status(503).json({ error: '지금은 AI 연결을 점검 중이에요. 잠시 후 다시 시도해주세요.' });
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

  try {
    const result = await callGeminiTask(task, apiKey, { model: process.env.GEMINI_MODEL });
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
}
