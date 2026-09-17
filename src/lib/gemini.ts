/**
 * Google Gemini 프로바이더 (REST, generateContent).
 * 앱 직접 호출 모드와 서버(api/coach.ts) 양쪽에서 사용합니다. 순수 TS 만 사용.
 */
import { COACH_SYSTEM_PROMPT, buildUserText, coachOutputJsonSchema, type CoachRequest } from './coach-schema';

export const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash';
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

export function buildGeminiBody(req: CoachRequest) {
  const parts: ({ inlineData: { mimeType: string; data: string } } | { text: string })[] = [];
  if (req.image) parts.push({ inlineData: { mimeType: req.image.mediaType, data: req.image.base64 } });
  parts.push({ text: buildUserText(req) });
  return {
    systemInstruction: { parts: [{ text: COACH_SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 4096,
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
  usage?: { input?: number; output?: number };
}
export interface GeminiFailure {
  ok: false;
  status: number;
  code: 'auth' | 'rate_limit' | 'refused' | 'server' | 'parse';
  message: string;
}

/** fetch 로 Gemini generateContent 호출. 결과 텍스트(JSON 문자열)를 돌려줍니다. */
export async function callGemini(
  req: CoachRequest,
  apiKey: string,
  options: { model?: string; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<GeminiResult | GeminiFailure> {
  const model = options.model || GEMINI_DEFAULT_MODEL;
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
