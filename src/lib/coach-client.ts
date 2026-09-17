import {
  COACH_MODEL,
  COACH_SYSTEM_PROMPT,
  CoachAnalysisSchema,
  buildMessageContent,
  coachOutputJsonSchema,
  normalizeAnalysis,
  type CoachRequest,
  type CoachRequestInput,
  CoachRequestSchema,
} from '@/lib/coach-schema';
import { APP_CONFIG } from '@/lib/config';
import { demoAnalysis, isDemoMode } from '@/lib/demo';
import { callGemini } from '@/lib/gemini';
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

export interface CoachClientOptions {
  /** 설정 화면에서 입력한 개인 Anthropic API 키 (직접 호출 모드) */
  directApiKey?: string | null;
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

/** 키 형식으로 프로바이더를 판별합니다. sk-ant-… → Anthropic(Claude), AIza… → Google Gemini */
export function detectProvider(apiKey: string): DirectProvider | null {
  const k = apiKey.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('AIza')) return 'gemini';
  return null;
}

export function isCoachConfigured(directApiKey?: string | null): boolean {
  return isDemoMode || Boolean(APP_CONFIG.apiUrl) || Boolean(directApiKey?.trim());
}

/**
 * 코치 분석 요청. 프록시 서버가 설정돼 있으면 서버를, 아니면 개인 키로 Anthropic API를 직접 호출합니다.
 */
export async function requestCoaching(input: CoachRequestInput, options: CoachClientOptions = {}): Promise<CoachAnalysis> {
  const req = CoachRequestSchema.parse(input);
  if (isDemoMode) return demoAnalysis(req);
  if (APP_CONFIG.apiUrl) return viaProxy(req, options);
  const key = options.directApiKey?.trim();
  if (key) {
    const provider = detectProvider(key);
    if (provider === 'gemini') return viaGemini(req, key, options);
    return viaAnthropic(req, key, options);
  }
  throw new CoachError('AI 코치 서버가 아직 연결되지 않았어요. 설정에서 API 키를 등록해주세요.', 'not_configured');
}

async function viaProxy(req: CoachRequest, options: CoachClientOptions): Promise<CoachAnalysis> {
  let res: Response;
  try {
    res = await fetch(`${APP_CONFIG.apiUrl}/api/coach`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {}),
      },
      body: JSON.stringify(req),
      signal: withTimeout(options.signal),
    });
  } catch {
    throw new CoachError('네트워크 연결을 확인해주세요.', 'network');
  }
  const body = await safeJson(res);
  if (!res.ok) {
    const code = res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate_limit' : 'server';
    throw new CoachError((body as { error?: string })?.error ?? `서버 오류 (${res.status})`, code);
  }
  return parseAnalysis((body as { analysis?: unknown })?.analysis);
}

async function viaAnthropic(req: CoachRequest, apiKey: string, options: CoachClientOptions): Promise<CoachAnalysis> {
  const payload = {
    model: COACH_MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildMessageContent(req) }],
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: coachOutputJsonSchema() },
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
  const text = body.content?.find((b) => b.type === 'text')?.text;
  if (!text) throw new CoachError('응답을 이해하지 못했어요. 다시 시도해주세요.', 'parse');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new CoachError('응답을 이해하지 못했어요. 다시 시도해주세요.', 'parse');
  }
  return parseAnalysis(json);
}

async function viaGemini(req: CoachRequest, apiKey: string, options: CoachClientOptions): Promise<CoachAnalysis> {
  let result: Awaited<ReturnType<typeof callGemini>>;
  try {
    result = await callGemini(req, apiKey, { signal: withTimeout(options.signal) });
  } catch {
    throw new CoachError('네트워크 연결을 확인해주세요.', 'network');
  }
  if (!result.ok) throw new CoachError(result.message, result.code);
  let json: unknown;
  try {
    json = JSON.parse(result.text);
  } catch {
    throw new CoachError('응답을 이해하지 못했어요. 다시 시도해주세요.', 'parse');
  }
  return parseAnalysis(json);
}

function parseAnalysis(json: unknown): CoachAnalysis {
  const parsed = CoachAnalysisSchema.safeParse(json);
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
