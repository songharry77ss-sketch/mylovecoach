/**
 * Google Gemini 프로바이더 (REST, generateContent).
 * 앱 직접 호출 모드와 서버(api/coach.ts) 양쪽에서 사용합니다. 순수 TS 만 사용.
 */
import { buildCoachTask, jsonSchemaOf, type AiTask } from './ai-tasks';
import type { CoachRequest } from './coach-schema';

export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash';
/**
 * 기본 모델이 과부하(503)·한도 초과(429)일 때 한 번 넘어가 보는 모델. 앞에서부터 기본 모델과 다른 첫 번째 하나만 쓴다
 * (보통은 가벼운 gemini-3.5-flash-lite, 기본 모델이 이미 그것이면 gemini-3.5-flash).
 * 서버는 비용 스위치에 맞춘 후보를 따로 넘긴다 (api/_ai-flags.ts — 가벼운 모델 다음은 GEMINI_MODEL).
 * gemini-flash-latest 는 2026-05 부터 gemini-3.5-flash 를 가리켜 같은 모델을 한 번 더 부르는 셈이라 뺐다
 */
export const GEMINI_FALLBACK_MODELS = ['gemini-3.5-flash-lite', GEMINI_DEFAULT_MODEL];
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Retry-After 가 없을 때 같은 모델을 다시 부르기 전 기다리는 시간 */
const RETRY_BACKOFF_MS = 800;
/** Retry-After 가 이보다 길면 같은 모델은 기다리지 않고 바로 대체 모델로 넘어간다 (앱은 90초에 포기한다) */
const MAX_RETRY_WAIT_MS = 5_000;

/**
 * 생각 수준. Gemini 3.x 는 생각을 완전히 끌 수 없고 minimal 이 가장 낮다 (3.7·3.8 Flash 는 minimal 이 없어 400).
 * 생각 토큰은 출력 단가로 과금된다
 */
export const GEMINI_THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;
export type GeminiThinkingLevel = (typeof GEMINI_THINKING_LEVELS)[number];
/** 답장 생성엔 긴 추론이 필요 없어 낮은 생각 수준으로 응답 속도를 줄입니다 (측정: 17초 → 10초) */
export const GEMINI_DEFAULT_THINKING: GeminiThinkingLevel = 'low';

type JsonSchema = Record<string, unknown>;

/**
 * zod → JSON Schema 결과를 Gemini responseSchema(OpenAPI 서브셋)로 변환.
 * - additionalProperties / $schema 제거
 * - type: ["number","null"] → type: "number", nullable: true
 * - propertyOrdering 을 넣어 출력 순서를 고정
 */
export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  let type = schema.type;
  if (Array.isArray(type)) {
    const nonNull = (type as string[]).filter((t) => t !== 'null');
    if (nonNull.length !== type.length) out.nullable = true;
    type = nonNull[0] ?? 'string';
  }
  if (type) out.type = type;
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.properties && typeof schema.properties === 'object') {
    const props = schema.properties as Record<string, JsonSchema>;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toGeminiSchema(v)]));
    out.propertyOrdering = Object.keys(props);
  }
  if (Array.isArray(schema.required)) out.required = schema.required;
  if (schema.items && typeof schema.items === 'object') out.items = toGeminiSchema(schema.items as JsonSchema);
  return out;
}

/**
 * 이미지 토큰 해상도. 측정(카톡 캡처 기준): 기본 ≈1,120토큰, MEDIUM ≈580, LOW ≈300.
 * MEDIUM 에서도 캡처 글자 판독과 답장 품질이 유지되어 기본값으로 사용. 환경변수로 조정 가능.
 */
export const GEMINI_MEDIA_RESOLUTION = process.env.GEMINI_MEDIA_RESOLUTION ?? process.env.EXPO_PUBLIC_GEMINI_MEDIA_RESOLUTION ?? 'MEDIA_RESOLUTION_MEDIUM';

/** 요청 본문에서 바꿀 수 있는 것 — 비우면 지금 동작 그대로 (서버는 api/_ai-flags.ts 의 환경변수로 정한다) */
export interface GeminiBodyOptions {
  /** 생각 수준 (기본 low) */
  thinkingLevel?: GeminiThinkingLevel;
  /** true 면 temperature 를 보내지 않고 모델 기본값을 쓴다 (기본: 작업마다 정한 값을 보냄) */
  omitTemperature?: boolean;
}

/** 어떤 모드의 작업이든 Gemini generateContent 본문으로 */
export function buildGeminiTaskBody(task: AiTask, options: GeminiBodyOptions = {}) {
  const parts: ({ inlineData: { mimeType: string; data: string } } | { text: string })[] = [];
  // 순서: 고정 맥락 텍스트 → 캡처 → 이번 요청 (암시적 캐시 프리픽스 극대화)
  parts.push({ text: task.context });
  if (task.image) parts.push({ inlineData: { mimeType: task.image.mediaType, data: task.image.base64 } });
  parts.push({ text: task.task });
  return {
    systemInstruction: { parts: [{ text: task.system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      ...(options.omitTemperature ? {} : { temperature: task.temperature }),
      // 상한을 낮춰 폭주 비용 방지 (생각 토큰까지 포함한 상한)
      maxOutputTokens: task.maxOutputTokens,
      mediaResolution: GEMINI_MEDIA_RESOLUTION,
      thinkingConfig: { thinkingLevel: options.thinkingLevel ?? GEMINI_DEFAULT_THINKING },
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(jsonSchemaOf(task.schema)),
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };
}

/** 코칭 요청용 본문 (예전 호출부 호환) */
export function buildGeminiBody(req: CoachRequest) {
  return buildGeminiTaskBody(buildCoachTask(req) as AiTask);
}

/** 한 번 부르는 데 쓴 토큰 (Gemini usageMetadata). 과금은 입력(캐시 포함) + 보이는 출력 + 생각 */
export interface GeminiUsage {
  /** 입력 토큰 — promptTokenCount (캐시에서 처리된 것 포함) */
  input?: number;
  /** 보이는 출력 토큰 — candidatesTokenCount */
  output?: number;
  /** 생각 토큰 — thoughtsTokenCount (출력 단가로 과금) */
  thoughts?: number;
  /** 암시적 캐시에서 처리된 입력 토큰 — cachedContentTokenCount */
  cached?: number;
  /** 전체 — totalTokenCount */
  total?: number;
}

export interface GeminiResult {
  ok: true;
  text: string;
  /** 실제로 응답한 모델 */
  model?: string;
  usage?: GeminiUsage;
  /** STOP · MAX_TOKENS(출력 상한에 걸려 잘림) 등 */
  finishReason?: string;
  /** 이 결과를 얻기까지 부른 횟수 */
  attempts?: number;
}
export interface GeminiFailure {
  ok: false;
  status: number;
  code: 'auth' | 'rate_limit' | 'refused' | 'server' | 'parse';
  /** 화면에 보일 안내. code 가 server 이고 503 이 아니면 Google 의 원문(영어)이라, 중계 서버는 대신 고정 안내를 보낸다 */
  message: string;
  /** Google 이 돌려준 HTTP 상태 (HTTP 오류일 때만 — 거절·형식 오류는 없음) */
  upstreamStatus?: number;
  /** Google 오류 본문의 상태 이름 (예: INVALID_ARGUMENT · NOT_FOUND). 원문 메시지는 담지 않는다 — 로그용 */
  upstreamError?: string;
  /** 마지막으로 부른 모델 */
  model?: string;
  usage?: GeminiUsage;
  finishReason?: string;
  attempts?: number;
  /** 과부하·한도 응답이 알려 준 다시 시도해도 되는 시간 (ms) */
  retryAfterMs?: number;
}

export interface CallGeminiOptions extends GeminiBodyOptions {
  model?: string;
  /** 기본 모델이 과부하·한도일 때 넘어갈 모델 후보 — 기본 모델과 다른 첫 번째 하나만 쓴다 (기본: GEMINI_FALLBACK_MODELS, [] 면 404 때도 넘어가지 않음) */
  fallbackModels?: string[];
  /** 끊기면 기다리던 응답과 남은 재시도를 그만둔다 */
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Retry-After 가 없을 때 같은 모델을 다시 부르기 전 대기 (테스트에서 0으로) */
  retryDelayMs?: number;
  /** 부를 때마다 (모델, 몇 번째) — 서버 로그용 */
  onAttempt?: (model: string, attempt: number) => void;
}

/** 끊긴 요청 — fetch 가 신호로 멈출 때와 같은 이름(AbortError)으로 던진다 */
function abortError(): Error {
  const e = new Error('요청을 멈췄어요.');
  e.name = 'AbortError';
  return e;
}

/** 기다리는 중에 끊기면 바로 멈춘다 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * Gemini generateContent 호출 (코칭 요청). 결과 텍스트(JSON 문자열)를 돌려줍니다.
 */
export async function callGemini(req: CoachRequest, apiKey: string, options: CallGeminiOptions = {}): Promise<GeminiResult | GeminiFailure> {
  return callGeminiTask(buildCoachTask(req) as AiTask, apiKey, options);
}

const isTransient = (f: GeminiFailure) => f.status === 503 || f.status === 429;

/**
 * 모드에 상관없이 작업 하나를 Gemini 로 보낸다. 최대 3번 부른다.
 * 과부하(503)·한도(429)면 같은 모델을 한 번 더 부르고 — Retry-After 가 있으면 그만큼 기다리고(5초보다 길면 건너뜀), 없으면 잠깐 —
 * 그래도 안 되면 대체 모델로 한 번 넘어간다.
 * 기본 모델이 아닌 모델(서버 스위치)이 없다고(404) 하면 이름 오타·지원 종료로 보고 기본 모델로 한 번만 넘어간다 — 오타 하나로 모든 요청이 실패하지 않게.
 * 그 밖의 실패(키 오류·400·거절)와 출력 상한에 걸린 응답(MAX_TOKENS)은 다시 부르지 않는다 — 다시 불러도 같은 결과에 비용만 든다
 */
export async function callGeminiTask(task: AiTask, apiKey: string, options: CallGeminiOptions = {}): Promise<GeminiResult | GeminiFailure> {
  const body = buildGeminiTaskBody(task, options);
  const primary = options.model || GEMINI_DEFAULT_MODEL;
  const fallback = (options.fallbackModels ?? GEMINI_FALLBACK_MODELS).find((m) => m && m !== primary);
  let attempts = 0;
  const attempt = async (model: string): Promise<GeminiResult | GeminiFailure> => {
    if (options.signal?.aborted) throw abortError();
    attempts += 1;
    options.onAttempt?.(model, attempts);
    const result = await callGeminiOnce(body, apiKey, model, options);
    return { ...result, model, attempts };
  };

  let result = await attempt(primary);
  // 대체 모델을 [] 로 주면(A/B 비교처럼 모델을 바꾸면 안 될 때) 넘어가지 않는다. 스위치가 없으면 primary 가 기본 모델이라 지금 그대로
  if (!result.ok && result.upstreamStatus === 404 && primary !== GEMINI_DEFAULT_MODEL && options.fallbackModels?.length !== 0) return attempt(GEMINI_DEFAULT_MODEL);
  if (result.ok || !isTransient(result)) return result;
  const wait = result.retryAfterMs ?? options.retryDelayMs ?? RETRY_BACKOFF_MS;
  if (wait <= MAX_RETRY_WAIT_MS) {
    await sleep(wait, options.signal);
    result = await attempt(primary);
    if (result.ok || !isTransient(result)) return result;
  }
  return fallback ? attempt(fallback) : result;
}

/** usageMetadata → 토큰 수. 숫자가 아닌 값은 버린다 */
export function usageOf(meta: GeminiResponse['usageMetadata']): GeminiUsage {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  return {
    input: n(meta?.promptTokenCount),
    output: n(meta?.candidatesTokenCount),
    thoughts: n(meta?.thoughtsTokenCount),
    cached: n(meta?.cachedContentTokenCount),
    total: n(meta?.totalTokenCount),
  };
}

/**
 * 다시 시도해도 되는 시간(ms). Retry-After 헤더(초 또는 날짜)를 먼저 보고,
 * 없으면 오류 본문의 RetryInfo.retryDelay("12s") 를 본다. 둘 다 없으면 undefined
 */
export function retryAfterMsOf(header: string | null | undefined, body?: GeminiResponse | null, now = Date.now()): number | undefined {
  const value = header?.trim();
  if (value) {
    if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value) * 1000);
    const at = Date.parse(value);
    if (Number.isFinite(at)) return Math.max(0, at - now);
  }
  const delay = body?.error?.details?.find((d) => typeof d?.retryDelay === 'string')?.retryDelay;
  const m = delay ? /^(\d+(?:\.\d+)?)s$/.exec(delay.trim()) : null;
  return m ? Math.round(Number(m[1]) * 1000) : undefined;
}

async function callGeminiOnce(
  requestBody: ReturnType<typeof buildGeminiTaskBody>,
  apiKey: string,
  model: string,
  options: CallGeminiOptions,
): Promise<GeminiResult | GeminiFailure> {
  const f = options.fetchImpl ?? fetch;
  const res = await f(`${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(requestBody),
    signal: options.signal,
  });
  let body: GeminiResponse | null = null;
  try {
    body = (await res.json()) as GeminiResponse;
  } catch {
    // 응답 머리를 받은 뒤 본문을 읽다가 끊기면(서버 시한·앱이 끊음) 끊김 그대로 던진다 — 본문이 없다고 보고 「거절」로 바꾸지 않게
    if (options.signal?.aborted) throw abortError();
    body = null;
  }
  if (!res.ok) {
    const message = body?.error?.message ?? `Gemini API 오류 (${res.status})`;
    // 로그에는 상태 코드와 상태 이름(INVALID_ARGUMENT 같은 대문자 이름표)만 — 원문 메시지는 남기지 않는다
    const name = body?.error?.status;
    const upstream = { upstreamStatus: res.status, upstreamError: typeof name === 'string' && /^[A-Z_]{1,40}$/.test(name) ? name : undefined };
    if (res.status === 400 && /API key/i.test(message)) return { ok: false, status: res.status, code: 'auth', message: 'Gemini API 키가 올바르지 않아요.', ...upstream };
    if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, code: 'auth', message: 'Gemini API 키가 올바르지 않아요.', ...upstream };
    const retryAfterMs = res.status === 429 || res.status === 503 ? retryAfterMsOf(res.headers?.get?.('retry-after'), body) : undefined;
    if (res.status === 429) return { ok: false, status: res.status, code: 'rate_limit', message: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.', retryAfterMs, ...upstream };
    if (res.status === 503) return { ok: false, status: res.status, code: 'server', message: 'AI 서버가 혼잡해요. 잠시 후 다시 시도해주세요.', retryAfterMs, ...upstream };
    return { ok: false, status: res.status, code: 'server', message, ...upstream };
  }
  const usage = usageOf(body?.usageMetadata);
  const candidate = body?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (!candidate || body?.promptFeedback?.blockReason) {
    return { ok: false, status: 422, code: 'refused', message: '이 대화는 코칭해드리기 어려워요. 다른 내용으로 시도해주세요.', usage, finishReason };
  }
  if (finishReason && !['STOP', 'MAX_TOKENS'].includes(finishReason)) {
    return { ok: false, status: 422, code: 'refused', message: '이 대화는 코칭해드리기 어려워요. 다른 내용으로 시도해주세요.', usage, finishReason };
  }
  const text = candidate.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) return { ok: false, status: 502, code: 'parse', message: '응답을 이해하지 못했어요. 다시 시도해주세요.', usage, finishReason };
  return { ok: true, text, usage, finishReason };
}

export interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string; status?: string; details?: { '@type'?: string; retryDelay?: string }[] };
}
