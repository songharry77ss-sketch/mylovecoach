import { ensureAiConsent, type AiRoute } from '@/lib/ai-consent';
import type { CrushReport, MindReading, PracticeReply } from '@/lib/ai-schemas';
import {
  buildCoachTask,
  buildTask,
  jsonSchemaOf,
  parseAiRequest,
  type AiTask,
  type MindRequestInput,
  type PracticeRequestInput,
  type ReportRequestInput,
} from '@/lib/ai-tasks';
import { analyticsEnabled, currentSessionId } from '@/lib/analytics';
import { COACH_MODEL, CoachAnalysisReadSchema, CoachRequestSchema, IMAGE_TOO_LARGE_MESSAGE, isImageTooLarge, normalizeAnalysis, type CoachRequestInput } from '@/lib/coach-schema';
import { APP_CONFIG } from '@/lib/config';
import { demoAnalysis, demoMind, demoPractice, demoReport, isDemoMode } from '@/lib/demo';
import { callGeminiTask } from '@/lib/gemini';
import type { CoachAnalysis } from '@/lib/types';

export class CoachError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'network' | 'auth' | 'rate_limit' | 'refused' | 'server' | 'parse' | 'consent' | 'too_large',
  ) {
    super(message);
    this.name = 'CoachError';
  }
}

/**
 * 이용 기록 수집에 동의한 경우에만 기기·세션 ID 를 헤더로 보냅니다.
 * 서버는 이 헤더가 있을 때만 코칭 내용을 기록합니다 (동의 = 헤더 전송).
 */
function consentHeaders(deviceId?: string): Record<string, string> {
  if (!analyticsEnabled() || !deviceId) return {};
  return { 'x-device-id': deviceId, 'x-session-id': currentSessionId() };
}

export interface CoachClientOptions {
  /** 설정 화면에서 입력한 개인 API 키 (직접 호출 모드) */
  directApiKey?: string | null;
  /** 이용 기록 수집에 동의한 경우에만 전달하는 기기 ID. 비밀 상담이면 넘기지 않는다 */
  deviceId?: string;
  signal?: AbortSignal;
}

const REQUEST_TIMEOUT_MS = 90_000;

function withTimeout(signal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort());
  controller.signal.addEventListener('abort', () => clearTimeout(timer));
  return controller.signal;
}

export type DirectProvider = 'anthropic' | 'gemini';

/** 키 형식으로 프로바이더를 판별합니다. sk-ant-… → Anthropic(Claude), AIza… / AQ.… → Google Gemini */
export function detectProvider(apiKey: string): DirectProvider | null {
  const k = apiKey.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('AIza') || k.startsWith('AQ.')) return 'gemini';
  return null;
}

export function isCoachConfigured(directApiKey?: string | null): boolean {
  return isDemoMode || APP_CONFIG.apiSameOrigin || Boolean(APP_CONFIG.apiUrl) || Boolean(directApiKey?.trim());
}

const viaServer = () => Boolean(APP_CONFIG.apiUrl || APP_CONFIG.apiSameOrigin);

/**
 * 서버를 거치는 요청은 Google(Gemini)로 간다 — api/coach.ts 는 Gemini 로만 보내고, 동의 시트·개인정보 처리방침 2번도 Google 로 안내한다.
 * 받는 곳을 바꾸려면 이 값·서버·동의 시트 문구·처리방침을 같이 고칠 것 (서버는 x-ai-consent 헤더의 회사와 자기가 보낼 회사가 다르면 거절한다)
 */
const RELAY_ROUTE: AiRoute = { provider: 'google', via: 'relay' };

/** 개인 키로 직접 보낼 회사 — runDirect 와 같은 판별 (Gemini 키가 아니면 Anthropic 으로 보낸다) */
const directRoute = (apiKey: string): AiRoute => ({ provider: detectProvider(apiKey) === 'gemini' ? 'google' : 'anthropic', via: 'direct' });

/** 지금 설정에서 AI 요청이 가는 곳. 데모이거나 서버·개인 키가 모두 없으면 null (아무 데도 보내지 않음) */
export function aiRouteOf(directApiKey?: string | null): AiRoute | null {
  if (isDemoMode) return null;
  if (viaServer()) return RELAY_ROUTE;
  const key = directApiKey?.trim();
  return key ? directRoute(key) : null;
}

export type AiFeature = 'coach' | keyof ModeIO;

/** AI 분석에 동의하지 않았을 때 화면에 그대로 보이는 안내 */
const CONSENT_NEEDED: Record<AiFeature, string> = {
  coach: 'AI 분석에 동의해야 답장을 만들 수 있어요.',
  report: 'AI 분석에 동의해야 보고서를 만들 수 있어요.',
  mind: 'AI 분석에 동의해야 속마음을 풀어 드릴 수 있어요.',
  practice: 'AI 분석에 동의해야 연습 상대가 답장할 수 있어요.',
};

/** 실제로 보내기 바로 앞의 관문. 동의를 받지 못하면 아무것도 보내지 않고 끝낸다 (횟수도 차감되지 않음) */
async function requireConsent(feature: AiFeature, route: AiRoute): Promise<void> {
  if (!(await ensureAiConsent(route))) throw new CoachError(CONSENT_NEEDED[feature], 'consent');
}

/**
 * 화면이 「분석 중」을 띄우기 전에 먼저 동의를 받는다 — 동의 시트가 떠 있는 동안 분석이 시작된 것처럼 보이지 않게.
 * 보낼 곳이 없으면(데모·연결 안 됨) 묻지 않는다. 동의하지 않으면 CoachError('consent').
 * 보내기 바로 앞의 관문(requireConsent)은 마지막 안전장치로 그대로 남는다
 */
export async function requireAiConsent(feature: AiFeature, directApiKey?: string | null): Promise<void> {
  const route = aiRouteOf(directApiKey);
  if (route) await requireConsent(feature, route);
}

/**
 * 코치 분석 요청. 프록시 서버가 설정돼 있으면 서버를, 아니면 개인 키로 AI 를 직접 호출합니다.
 */
export async function requestCoaching(input: CoachRequestInput, options: CoachClientOptions = {}): Promise<CoachAnalysis> {
  // 서버와 같은 길이 상한으로 먼저 검사한다 — 캡처가 너무 크면 보내지 않고 서버(413)와 같은 안내를 보여 준다
  const parsed = CoachRequestSchema.safeParse(input);
  if (!parsed.success) {
    if (isImageTooLarge(parsed.error.issues)) throw new CoachError(IMAGE_TOO_LARGE_MESSAGE, 'too_large');
    throw new CoachError('요청 형식이 올바르지 않아요.', 'parse');
  }
  const req = parsed.data;
  if (isDemoMode) return demoAnalysis(req);
  if (viaServer()) {
    const body = await postToServer('coach', req, { ...consentHeaders(options.deviceId) }, options.signal);
    return parseCoach((body as { analysis?: unknown })?.analysis);
  }
  const text = await runDirect('coach', buildCoachTask(req) as AiTask, options);
  return parseCoach(parseJson(text));
}

interface ModeIO {
  report: { input: Omit<ReportRequestInput, 'mode'>; output: CrushReport };
  mind: { input: Omit<MindRequestInput, 'mode'>; output: MindReading };
  practice: { input: Omit<PracticeRequestInput, 'mode'>; output: PracticeReply };
}

/** 보고서·속마음·연습 요청. 결과는 모드별 스키마로 검증해 돌려준다 */
export async function requestAi<M extends keyof ModeIO>(mode: M, input: ModeIO[M]['input'], options: CoachClientOptions = {}): Promise<ModeIO[M]['output']> {
  const parsed = parseAiRequest({ ...input, mode });
  if (!parsed.ok || parsed.mode === 'coach') throw new CoachError('요청 형식이 올바르지 않아요.', 'parse');
  if (isDemoMode) {
    if (parsed.mode === 'report') return (await demoReport(parsed.req)) as ModeIO[M]['output'];
    if (parsed.mode === 'mind') return (await demoMind(parsed.req)) as ModeIO[M]['output'];
    return (await demoPractice(parsed.req)) as ModeIO[M]['output'];
  }
  const task = buildTask(parsed);
  const raw = viaServer() ? ((await postToServer(mode, parsed.req, {}, options.signal)) as { result?: unknown })?.result : parseJson(await runDirect(mode, task, options));
  const checked = task.schema.safeParse(raw);
  if (!checked.success) throw new CoachError('응답 형식이 올바르지 않아요. 다시 시도해주세요.', 'parse');
  return task.normalize(checked.data) as ModeIO[M]['output'];
}

async function postToServer(feature: AiFeature, body: unknown, extraHeaders: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  await requireConsent(feature, RELAY_ROUTE);
  let res: Response;
  try {
    res = await fetch(`${APP_CONFIG.apiUrl}/api/coach`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {}),
        // 사용자가 보내도 된다고 동의한 AI 회사 — 서버가 실제로 보낼 회사와 다르면 보내지 않고 거절한다
        'x-ai-consent': RELAY_ROUTE.provider,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: withTimeout(signal),
    });
  } catch {
    throw new CoachError('네트워크 연결을 확인해주세요.', 'network');
  }
  const json = await safeJson(res);
  if (!res.ok) {
    const code = res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate_limit' : res.status === 422 ? 'refused' : res.status === 413 ? 'too_large' : 'server';
    throw new CoachError((json as { error?: string })?.error ?? `서버 오류 (${res.status})`, code);
  }
  return json;
}

/** 개인 키 직접 호출 — 결과 JSON 문자열을 돌려준다 */
async function runDirect(feature: AiFeature, task: AiTask, options: CoachClientOptions): Promise<string> {
  const key = options.directApiKey?.trim();
  if (!key) throw new CoachError('AI 코치 서버가 아직 연결되지 않았어요. 설정에서 API 키를 등록해주세요.', 'not_configured');
  await requireConsent(feature, directRoute(key));
  if (detectProvider(key) === 'gemini') {
    let result: Awaited<ReturnType<typeof callGeminiTask>>;
    try {
      result = await callGeminiTask(task, key, { signal: withTimeout(options.signal) });
    } catch {
      throw new CoachError('네트워크 연결을 확인해주세요.', 'network');
    }
    if (!result.ok) throw new CoachError(result.message, result.code);
    return result.text;
  }
  return viaAnthropic(task, key, options);
}

async function viaAnthropic(task: AiTask, apiKey: string, options: CoachClientOptions): Promise<string> {
  const content: ({ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } })[] = [{ type: 'text', text: task.context }];
  if (task.image) content.push({ type: 'image', source: { type: 'base64', media_type: task.image.mediaType, data: task.image.base64 } });
  content.push({ type: 'text', text: task.task });
  const payload = {
    model: COACH_MODEL,
    max_tokens: 16000,
    // 안전 분류기가 거절하면 서버가 권장 대체 모델로 다시 돌린다
    fallbacks: 'default',
    system: [{ type: 'text', text: task.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: jsonSchemaOf(task.schema) },
    },
  };
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(payload),
      signal: withTimeout(options.signal),
    });
  } catch {
    throw new CoachError('네트워크 연결을 확인해주세요.', 'network');
  }
  const body = (await safeJson(res)) as {
    error?: { message?: string };
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };
  if (!res.ok) {
    if (res.status === 401) throw new CoachError('API 키가 올바르지 않아요. 설정에서 다시 확인해주세요.', 'auth');
    if (res.status === 429) throw new CoachError('요청이 너무 많아요. 잠시 후 다시 시도해주세요.', 'rate_limit');
    throw new CoachError(body?.error?.message ?? `API 오류 (${res.status})`, 'server');
  }
  if (body.stop_reason === 'refusal') {
    throw new CoachError('이 대화는 코칭해드리기 어려워요. 다른 내용으로 시도해주세요.', 'refused');
  }
  const text = body.content?.filter((b) => b.type === 'text').pop()?.text;
  if (!text) throw new CoachError('응답을 이해하지 못했어요. 다시 시도해주세요.', 'parse');
  return text;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new CoachError('응답을 이해하지 못했어요. 다시 시도해주세요.', 'parse');
  }
}

function parseCoach(json: unknown): CoachAnalysis {
  const parsed = CoachAnalysisReadSchema.safeParse(json);
  if (!parsed.success) throw new CoachError('응답 형식이 올바르지 않아요. 다시 시도해주세요.', 'parse');
  return normalizeAnalysis(parsed.data);
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
