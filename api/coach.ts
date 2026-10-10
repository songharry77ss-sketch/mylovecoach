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
 *   비용 스위치 GEMINI_MODEL_LIGHT · GEMINI_THINKING_* · GEMINI_OMIT_TEMPERATURE (선택, 비우면 지금 동작 그대로 — api/_ai-flags.ts)
 * 요청마다 로그 한 줄(JSON)을 남깁니다: 모드·모델·토큰 수·종료 이유·시도 횟수·걸린 시간. Gemini 를 부르기 직전마다 시작 줄도 남깁니다.
 * 대화 내용·이름·IP 는 남기지 않습니다.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { buildTask, parseAiRequest, type AiMode, type AiTask } from '../src/lib/ai-tasks';
import { IMAGE_TOO_LARGE_MESSAGE, MAX_IMAGE_BASE64_LENGTH, isImageTooLarge } from '../src/lib/coach-schema';
import { callGeminiTask, type GeminiUsage } from '../src/lib/gemini';
import { aiFlagsFor } from './_ai-flags';
import { clientIp, rateLimited, storedKb } from './_limits';
import { analyticsEnabled, consentVersionOk, DEVICE_ID, insert, rpc } from './_supabase';

export const config = { maxDuration: 120 };

/** 이 서버가 내용을 보내는 AI 회사 — 앱이 x-ai-consent 헤더로 알려 주는 「사용자가 동의한 회사」와 같아야 보낸다 */
const RELAY_COMPANY = 'google';
/** x-ai-consent 헤더가 없는 예전 앱(동의 시트 이전 판)이 처리방침으로 안내받은 회사 */
const LEGACY_APP_COMPANY = 'google';

/**
 * 본문 크기 상한 (content-length). 캡처 상한에 다른 칸(한글 UTF-8 로 0.15MB 안쪽)을 넉넉히 더한 값 — 넘으면 JSON 을 읽지도 않고 413.
 * 이것만으로는 부족하다: 작은 본문에도 원소 수십만 개짜리 배열이 들어갈 수 있어서 배열 길이는 parseAiRequest 가 따로 본다
 */
export const MAX_BODY_BYTES = MAX_IMAGE_BASE64_LENGTH + 300_000;

/** Google 원문 오류(영어·내부 안내) 대신 화면에 보일 안내 */
const UPSTREAM_ERROR_MESSAGE = 'AI 서버와 통신하지 못했어요. 잠시 후 다시 시도해주세요.';

/**
 * 한 요청에 쓰는 최대 시간. 앱은 90초에 포기하므로(src/lib/coach-client.ts) 그 뒤의 답은 아무도 받지 않는다.
 * 그 전에 기다림을 멈추고 「늦어요」 안내를 돌려준다. vercel.json 의 maxDuration(120초)보다 짧아야 함수가 끊기기 전에 응답할 수 있다
 */
export const SERVER_DEADLINE_MS = 85_000;

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

/**
 * 요청마다 남기는 로그 한 줄 (Vercel 로그에서 "log":"coach_api" 로 찾는다).
 * 비용을 보려고 남기는 것이라 숫자·이름표만 넣는다 — 대화 글·캡처·프로필·IP 는 넣지 않는다.
 * 본문을 읽기 전에 끝난 요청(인증·호출 제한 등)의 mode 는 coach 로 남는다
 */
export interface UsageLine {
  log: 'coach_api';
  mode: AiMode;
  /** 돌려준 응답 코드 (앱이 먼저 끊고 나가면 499) */
  status: number;
  /** 실패 이유 (예: rate_limit · parse · deadline · client_closed) */
  error?: string;
  /** Google 이 돌려준 HTTP 상태와 상태 이름 (예: 404 · NOT_FOUND) — 원문 메시지는 남기지 않는다 */
  upstreamStatus?: number;
  upstreamError?: string;
  /** 마지막으로 부른 모델 */
  model?: string;
  /** Gemini 를 부른 횟수 */
  attempts: number;
  finishReason?: string;
  promptTokens?: number;
  candidatesTokens?: number;
  thoughtsTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  /** 캡처를 붙인 코칭인지 (이미지 토큰이 더해진다) */
  image: boolean;
  ms: number;
  /** Flex(반값)를 먼저 불렀을 때: served(flex 가 답함 — 반값) 또는 fallback:<이유>(timeout·http 503 등 → 일반 등급으로 다시) */
  flex?: string;
  /** Flex 를 기다린 시간 (ms) */
  flexMs?: number;
}

/** 본문의 mode — 아는 값만 (모르는 글자를 로그에 그대로 남기지 않는다) */
function modeOf(body: unknown): AiMode {
  const mode = (body as { mode?: unknown } | null)?.mode;
  return mode === 'report' || mode === 'mind' || mode === 'practice' ? mode : 'coach';
}

function usageFields(usage?: GeminiUsage): Partial<UsageLine> {
  return { promptTokens: usage?.input, candidatesTokens: usage?.output, thoughtsTokens: usage?.thoughts, cachedTokens: usage?.cached, totalTokens: usage?.total };
}

/**
 * 앱이 끊고 나가거나(시간 초과·새 요청으로 끊기) 서버 시한이 지나면 Gemini 응답 기다리기를 멈추는 신호.
 * 기다림을 멈추고 함수를 일찍 끝낼 뿐이고, Google 쪽에서 이미 시작된 처리의 과금이 멈추는지는 알 수 없다.
 * 앱이 끊었는지는 응답을 다 쓰기 전에 연결이 닫혔는지로 본다. 다만 vercel.json 의 supportsCancellation 이 켜져 있어
 * 취소된 요청은 함수가 그 자리에서 끝날 수 있다 — 그러면 여기도, 끝 줄 로그도 못 가므로 Gemini 를 부를 때마다 시작 줄을 먼저 남긴다
 */
function watchRequest(req: VercelRequest, res: VercelResponse, deadlineMs: number) {
  const controller = new AbortController();
  let reason: 'deadline' | 'client' | null = null;
  const stop = (why: 'deadline' | 'client') => {
    if (controller.signal.aborted) return;
    reason = why;
    controller.abort();
  };
  const timer = setTimeout(() => stop('deadline'), deadlineMs);
  const onClose = () => {
    if (!res.writableEnded) stop('client');
  };
  // Vercel의 Node 요청 취소는 요청 객체의 aborted 오류로도 전달된다.
  const onError = (error: Error) => {
    if (error.message === 'aborted') stop('client');
  };
  const onAborted = () => stop('client');
  if (typeof res.on === 'function') res.on('close', onClose);
  if (typeof req.on === 'function') {
    req.on('error', onError);
    req.on('aborted', onAborted);
  }
  return {
    signal: controller.signal,
    reason: () => reason,
    done: () => {
      clearTimeout(timer);
      if (typeof res.off === 'function') res.off('close', onClose);
      if (typeof req.off === 'function') {
        req.off('error', onError);
        req.off('aborted', onAborted);
      }
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  // req.body 는 읽는 순간 JSON 을 파싱하고 깨져 있으면 던진다 — 인증·호출 제한을 지난 뒤에 handle 안에서 읽는다
  const line: UsageLine = { log: 'coach_api', mode: 'coach', status: 0, attempts: 0, image: false, ms: 0 };
  const send = (status: number, body: unknown, error?: string) => {
    line.status = status;
    if (error) line.error = error;
    res.status(status).json(body);
  };
  try {
    await handle(req, res, send, line, startedAt);
  } finally {
    line.ms = Date.now() - startedAt;
    console.log(JSON.stringify(line));
  }
}

async function handle(req: VercelRequest, res: VercelResponse, send: (status: number, body: unknown, error?: string) => void, line: UsageLine, startedAt: number) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    send(405, { error: 'POST만 지원합니다.' }, 'method');
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    send(500, { error: '서버에 GEMINI_API_KEY가 설정되지 않았어요.' }, 'no_key');
    return;
  }
  const provider = 'gemini';
  const expectedToken = process.env.COACH_APP_TOKEN;
  if (expectedToken && req.headers['x-app-token'] !== expectedToken) {
    send(401, { error: '앱 인증에 실패했어요.' }, 'app_token');
    return;
  }
  // 앱은 사용자가 보내도 된다고 동의한 AI 회사를 알려 준다. 이 서버가 보낼 회사와 다르면 동의받지 않은 곳으로 가게 되므로 AI 를 부르지 않는다.
  // 헤더가 없는 예전 앱(AI 분석 동의 전 빌드, 심사 중인 1.0 등)은 동의를 묻지 않고 보낸다 — 새 빌드가 퍼진 뒤 AI_CONSENT_REQUIRED=1 을 켜면 업데이트를 안내하고 막는다
  const consentHeader = req.headers['x-ai-consent'];
  if (consentHeader === undefined && process.env.AI_CONSENT_REQUIRED === '1') {
    send(426, { error: '앱을 최신 버전으로 업데이트해 주세요. AI 분석 동의를 받는 새 버전에서 AI 코칭을 쓸 수 있어요.' }, 'consent_required');
    return;
  }
  // 스위치가 꺼져 있을 때 헤더 없는 예전 앱은 그 판 처리방침이 안내한 Google 로 본다 — 지금은 그대로 받고,
  // 나중에 보낼 회사(RELAY_COMPANY)를 바꾸면 예전 앱도 새 회사로 조용히 보내지 않고 같이 거절된다
  const consented = consentHeader ?? LEGACY_APP_COMPANY;
  if (consented !== RELAY_COMPANY) {
    send(503, { error: '지금은 AI 연결을 점검 중이에요. 잠시 후 다시 시도해주세요.' }, 'consent');
    return;
  }

  if (rateLimited('coach', clientIp(req), RATE_MAX, RATE_WINDOW_MS)) {
    send(429, { error: '요청이 많아요. 잠시 후 다시 시도해주세요.' }, 'rate_limited');
    return;
  }

  // 본문이 너무 크면 JSON 을 읽지도 않는다 (이만큼 큰 본문은 캡처 때문이라 같은 안내)
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
    send(413, { error: IMAGE_TOO_LARGE_MESSAGE }, 'body_too_large');
    return;
  }
  let body: unknown;
  try {
    body = req.body;
  } catch {
    send(400, { error: '요청 형식이 올바르지 않아요.' }, 'invalid_json');
    return;
  }
  line.mode = modeOf(body);
  const parsed = parseAiRequest(body);
  if (!parsed.ok) {
    // 길이 상한(src/lib/coach-schema.ts 의 REQUEST_LIMITS)을 넘으면 AI 를 부르지 않는다. 캡처만 너무 크면 413 과 안내 문구
    if (isImageTooLarge(parsed.issues)) send(413, { error: IMAGE_TOO_LARGE_MESSAGE }, 'image_too_large');
    else send(400, { error: '요청 형식이 올바르지 않아요.', issues: parsed.issues.slice(0, 3) }, 'invalid');
    return;
  }
  line.image = parsed.mode === 'coach' && Boolean(parsed.req.image);
  const task: AiTask = buildTask(parsed);
  // 코칭만 (이용 기록에 동의한 앱에 한해) 기록한다. 보고서·속마음·연습 내용은 저장하지 않는다
  const log = (result: { analysis?: Record<string, unknown>; provider?: string; error?: string }) =>
    parsed.mode === 'coach' ? logCoach(req, parsed.req, result, startedAt) : Promise.resolve();
  const reply = (output: unknown, usage: unknown) =>
    send(200, parsed.mode === 'coach' ? { analysis: output, usage, provider } : { mode: parsed.mode, result: output, usage, provider });

  const watch = watchRequest(req, res, SERVER_DEADLINE_MS);
  try {
    const result = await callGeminiTask(task, apiKey, {
      ...aiFlagsFor(parsed.mode),
      signal: watch.signal,
      onFlex: ({ served, ms, reason }) => {
        line.flex = served ? 'served' : `fallback:${reason ?? '?'}`;
        line.flexMs = ms;
      },
      onAttempt: (model, attempt) => {
        line.model = model;
        line.attempts = attempt;
        // 끝 줄이 없는(함수가 취소로 끝난) 호출도 셀 수 있게 부르기 직전에 남긴다 — 이 줄 수가 실제로 부른 횟수
        console.log(JSON.stringify({ log: 'coach_api_start', mode: parsed.mode, model, attempt }));
      },
    });
    Object.assign(line, usageFields(result.usage), { finishReason: result.finishReason });
    if (!result.ok) {
      Object.assign(line, { upstreamStatus: result.upstreamStatus, upstreamError: result.upstreamError });
      await log({ provider, error: result.code });
      // Google 원문 오류(예: 없는 모델 404 의 영어 안내)는 화면에 그대로 보이지 않게 고정 안내로 바꾼다. 혼잡(503)·한도·키·거절은 원래 우리 문구
      const message = result.code === 'server' && result.status !== 503 ? UPSTREAM_ERROR_MESSAGE : result.message;
      send(result.code === 'auth' ? 500 : result.code === 'rate_limit' ? 429 : result.code === 'refused' ? 422 : 502, { error: message }, result.code);
      return;
    }
    // 출력 상한(MAX_TOKENS)에 걸려 잘린 JSON 도 여기서 걸러진다 (로그의 finishReason 으로 구분)
    let raw: unknown;
    try {
      raw = JSON.parse(result.text);
    } catch {
      raw = undefined;
    }
    const json = raw === undefined ? null : task.schema.safeParse(raw);
    if (!json?.success) {
      await log({ provider, error: 'parse' });
      send(502, { error: '응답 형식이 올바르지 않아요. 다시 시도해주세요.' }, 'parse');
      return;
    }
    const output = task.normalize(json.data);
    await log({ analysis: output as Record<string, unknown>, provider });
    reply(output, result.usage);
  } catch {
    const why = watch.reason();
    if (why === 'client') {
      // 받을 사람은 없지만 응답을 닫아 함수가 바로 끝나게 한다 (끊긴 연결에 쓰는 건 무시된다)
      try {
        send(499, { error: '요청이 취소됐어요.' }, 'client_closed');
      } catch {
        // 이미 닫힌 연결
      }
      return;
    }
    if (why === 'deadline') {
      send(504, { error: '답을 만드는 데 너무 오래 걸려요. 잠시 후 다시 시도해주세요.' }, 'deadline');
      return;
    }
    send(502, { error: 'AI 서버와 통신하지 못했어요.' }, 'network');
  } finally {
    watch.done();
  }
}
