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
import { analyticsEnabled, currentConsentVersion, currentSessionId } from '@/lib/analytics';
import { COACH_MODEL, CoachAnalysisReadSchema, CoachRequestSchema, normalizeAnalysis, type CoachRequestInput } from '@/lib/coach-schema';
import { APP_CONFIG } from '@/lib/config';
import { demoAnalysis, demoMind, demoPractice, demoReport, isDemoMode } from '@/lib/demo';
import { callGeminiTask } from '@/lib/gemini';
import type { CoachAnalysis } from '@/lib/types';

export class CoachError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'network' | 'auth' | 'rate_limit' | 'refused' | 'server' | 'parse',
  ) {
    super(message);
    this.name = 'CoachError';
  }
}

/**
 * 이용 기록 수집에 동의한 경우에만 기기·세션 ID 와 동의 판을 헤더로 보냅니다.
 * 서버는 이 헤더가 있고 직접 체크해 받은 동의(판 2 이상)일 때만 코칭 내용을 기록합니다.
 */
function consentHeaders(deviceId?: string): Record<string, string> {
  if (!analyticsEnabled() || !deviceId) return {};
  const version = currentConsentVersion();
  return { 'x-device-id': deviceId, 'x-session-id': currentSessionId(), ...(version != null ? { 'x-consent-version': String(version) } : {}) };
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
 * 코치 분석 요청. 프록시 서버가 설정돼 있으면 서버를, 아니면 개인 키로 AI 를 직접 호출합니다.
 */
export async function requestCoaching(input: CoachRequestInput, options: CoachClientOptions = {}): Promise<CoachAnalysis> {
  const req = CoachRequestSchema.parse(input);
  if (isDemoMode) return demoAnalysis(req);
  if (viaServer()) {
    const body = await postToServer(req, { ...consentHeaders(options.deviceId) }, options.signal);
    return parseCoach((body as { analysis?: unknown })?.analysis);
  }
  const text = await runDirect(buildCoachTask(req) as AiTask, options);
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
  const raw = viaServer() ? ((await postToServer(parsed.req, {}, options.signal)) as { result?: unknown })?.result : parseJson(await runDirect(task, options));
  const checked = task.schema.safeParse(raw);
  if (!checked.success) throw new CoachError('응답 형식이 올바르지 않아요. 다시 시도해주세요.', 'parse');
  return task.normalize(checked.data) as ModeIO[M]['output'];
}

async function postToServer(body: unknown, extraHeaders: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${APP_CONFIG.apiUrl}/api/coach`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {}),
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
    const code = res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate_limit' : res.status === 422 ? 'refused' : 'server';
    throw new CoachError((json as { error?: string })?.error ?? `서버 오류 (${res.status})`, code);
  }
  return json;
}

/** 개인 키 직접 호출 — 결과 JSON 문자열을 돌려준다 */
async function runDirect(task: AiTask, options: CoachClientOptions): Promise<string> {
  const key = options.directApiKey?.trim();
  if (!key) throw new CoachError('AI 코치 서버가 아직 연결되지 않았어요. 설정에서 API 키를 등록해주세요.', 'not_configured');
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
