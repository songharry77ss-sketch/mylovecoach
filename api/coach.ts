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
import { clientIp, rateLimited, storedKb } from './_limits';
import { analyticsEnabled, consentVersionOk, DEVICE_ID, insert, rpc } from './_supabase';

export const config = { maxDuration: 120 };

/** 이 서버가 내용을 보내는 AI 회사 — 앱이 x-ai-consent 헤더로 알려 주는 「사용자가 동의한 회사」와 같아야 보낸다 */
const RELAY_COMPANY = 'google';
/** x-ai-consent 헤더가 없는 예전 앱(동의 시트 이전 판)이 처리방침으로 안내받은 회사 */
const LEGACY_APP_COMPANY = 'google';

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
  // 헤더가 없는 예전 앱(AI 분석 동의 전 빌드, 심사 중인 1.0 등)은 동의를 묻지 않고 보낸다 — 새 빌드가 퍼진 뒤 AI_CONSENT_REQUIRED=1 을 켜면 업데이트를 안내하고 막는다
  const consentHeader = req.headers['x-ai-consent'];
  if (consentHeader === undefined && process.env.AI_CONSENT_REQUIRED === '1') {
    res.status(426).json({ error: '앱을 최신 버전으로 업데이트해 주세요. AI 분석 동의를 받는 새 버전에서 AI 코칭을 쓸 수 있어요.' });
    return;
  }
  // 스위치가 꺼져 있을 때 헤더 없는 예전 앱은 그 판 처리방침이 안내한 Google 로 본다 — 지금은 그대로 받고,
  // 나중에 보낼 회사(RELAY_COMPANY)를 바꾸면 예전 앱도 새 회사로 조용히 보내지 않고 같이 거절된다
  const consented = consentHeader ?? LEGACY_APP_COMPANY;
  if (consented !== RELAY_COMPANY) {
    res.status(503).json({ error: '지금은 AI 연결을 점검 중이에요. 잠시 후 다시 시도해주세요.' });
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
