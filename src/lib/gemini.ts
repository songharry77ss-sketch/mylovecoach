/**
 * Google Gemini 프로바이더 (REST, generateContent).
 * 앱 직접 호출 모드와 서버(api/coach.ts) 양쪽에서 사용합니다. 순수 TS 만 사용.
 */
import { COACH_SYSTEM_PROMPT, buildContextText, buildTaskBlock, coachOutputJsonSchema, type CoachRequest } from './coach-schema';

export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash';
/** 기본 모델이 과부하(503)·한도 초과(429)일 때 순서대로 시도하는 대체 모델 */
export const GEMINI_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

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

export function buildGeminiBody(req: CoachRequest) {
  const parts: ({ inlineData: { mimeType: string; data: string } } | { text: string })[] = [];
  // 순서: 고정 맥락 텍스트 → 캡처 → 이번 요청 (암시적 캐시 프리픽스 극대화)
  parts.push({ text: buildContextText(req) });
  if (req.image) parts.push({ inlineData: { mimeType: req.image.mediaType, data: req.image.base64 } });
  parts.push({ text: buildTaskBlock(req) });
  return {
    systemInstruction: { parts: [{ text: COACH_SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.8,
      // 실제 출력은 500~700토큰. 상한을 낮춰 폭주 비용 방지
      maxOutputTokens: 2048,
      mediaResolution: GEMINI_MEDIA_RESOLUTION,
      // 답장 생성엔 긴 추론이 필요 없어 낮은 생각 수준으로 응답 속도를 줄입니다 (측정: 17초 → 10초)
      thinkingConfig: { thinkingLevel: 'low' },
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(coachOutputJsonSchema() as JsonSchema),
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };
}

export interface GeminiResult {
  ok: true;
  text: string;
  /** 실제로 응답한 모델 */
  model?: string;
  usage?: { input?: number; output?: number };
}
export interface GeminiFailure {
  ok: false;
  status: number;
  code: 'auth' | 'rate_limit' | 'refused' | 'server' | 'parse';
  message: string;
}

export interface CallGeminiOptions {
  model?: string;
  /** 기본 모델 실패 시 시도할 모델들 (기본: GEMINI_FALLBACK_MODELS) */
  fallbackModels?: string[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** 재시도 대기 (테스트에서 0으로) */
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gemini generateContent 호출. 과부하(503)/한도(429)면 같은 모델을 한 번 더 시도한 뒤 대체 모델로 넘어갑니다.
 * 결과 텍스트(JSON 문자열)를 돌려줍니다.
 */
export async function callGemini(req: CoachRequest, apiKey: string, options: CallGeminiOptions = {}): Promise<GeminiResult | GeminiFailure> {
  const primary = options.model || GEMINI_DEFAULT_MODEL;
  const chain = [primary, ...(options.fallbackModels ?? GEMINI_FALLBACK_MODELS).filter((m) => m !== primary)];
  const delay = options.retryDelayMs ?? 800;
  let last: GeminiFailure | null = null;
  for (const model of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await callGeminiOnce(req, apiKey, model, options);
      if (result.ok) return { ...result, model };
      last = result;
      const transient = result.status === 503 || result.status === 429;
      if (!transient) return result;
      if (attempt === 0) await sleep(delay);
    }
  }
  return last ?? { ok: false, status: 503, code: 'server', message: 'AI 서버가 혼잡해요. 잠시 후 다시 시도해주세요.' };
}

async function callGeminiOnce(
  req: CoachRequest,
  apiKey: string,
  model: string,
  options: CallGeminiOptions,
): Promise<GeminiResult | GeminiFailure> {
  const f = options.fetchImpl ?? fetch;
  const res = await f(`${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(buildGeminiBody(req)),
    signal: options.signal,
  });
  let body: GeminiResponse | null = null;
  try {
    body = (await res.json()) as GeminiResponse;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = body?.error?.message ?? `Gemini API 오류 (${res.status})`;
    if (res.status === 400 && /API key/i.test(message)) return { ok: false, status: res.status, code: 'auth', message: 'Gemini API 키가 올바르지 않아요.' };
    if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, code: 'auth', message: 'Gemini API 키가 올바르지 않아요.' };
    if (res.status === 429) return { ok: false, status: res.status, code: 'rate_limit', message: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' };
    if (res.status === 503) return { ok: false, status: res.status, code: 'server', message: 'AI 서버가 혼잡해요. 잠시 후 다시 시도해주세요.' };
    return { ok: false, status: res.status, code: 'server', message };
  }
  const candidate = body?.candidates?.[0];
  if (!candidate || body?.promptFeedback?.blockReason) {
    return { ok: false, status: 422, code: 'refused', message: '이 대화는 코칭해드리기 어려워요. 다른 내용으로 시도해주세요.' };
  }
  if (candidate.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
    return { ok: false, status: 422, code: 'refused', message: '이 대화는 코칭해드리기 어려워요. 다른 내용으로 시도해주세요.' };
  }
  const text = candidate.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) return { ok: false, status: 502, code: 'parse', message: '응답을 이해하지 못했어요. 다시 시도해주세요.' };
  return {
    ok: true,
    text,
    usage: { input: body?.usageMetadata?.promptTokenCount, output: body?.usageMetadata?.candidatesTokenCount },
  };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string; status?: string };
}
