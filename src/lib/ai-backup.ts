/**
 * 중계 서버(api/coach.ts)가 답을 맡기는 AI 회사와 순서 (2026-11-26 사용자 결정: Claude → GPT → Gemini).
 * 앱이 x-ai-consent 헤더에 동의한 회사를 「동의한 순서대로」 알려 준다 (src/lib/ai-consent.ts):
 * - 새 동의 anthropic,openai,google (2026-11-26~): Anthropic(Claude Haiku 5.5) → OpenAI(GPT-6 Luna) → Google(Gemini).
 *   이 순서는 환경변수 AI_PROVIDER_ORDER 로 바꿀 수 있다.
 * - 예전 동의 google,anthropic,openai (11-20 판): 동의한 대로 Gemini 먼저, 막힐 때만 Claude → GPT.
 * - Google 에만 동의한 예전 앱(헤더 google·없음)은 Gemini 로만.
 * 앞이 답하지 못하면 다음으로 넘긴다.
 * 서버 전용: 키는 환경변수에서만 받는다.
 *
 * 돌려주는 모양은 callGeminiTask 와 맞춘다 — 성공이면 JSON 글(text), 실패면 code·message.
 * 원문 오류(영어)는 로그에 상태 코드만 남기고 화면에는 우리 문구를 쓴다.
 */
import Anthropic from '@anthropic-ai/sdk';

import { jsonSchemaOf, type AiTask } from './ai-tasks';

export type BackupProvider = 'anthropic' | 'openai';

export interface BackupUsage {
  input?: number;
  output?: number;
  cached?: number;
  total?: number;
}

export type BackupResult =
  | { ok: true; provider: BackupProvider; model: string; text: string; finishReason?: string; usage?: BackupUsage }
  | { ok: false; provider: BackupProvider; model: string; code: 'auth' | 'rate_limit' | 'refused' | 'server' | 'parse'; status?: number; message: string };

/** 기본 모델 (2026-11-26 사용자 결정 — 코칭 1회 약 1원대) — 환경변수 ANTHROPIC_MODEL · OPENAI_MODEL 로 바꿀 수 있다 */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-haiku-5-5';
export const OPENAI_DEFAULT_MODEL = 'gpt-6-luna';

/**
 * 안전 분류기가 거절하면 Anthropic 서버가 다른 모델로 다시 돌리는 기능(fallbacks)을 받는 모델.
 * Claude Haiku 5.5 에는 이 기능이 없다 — 보내면 400 이라 이 모델들에만 붙인다
 */
const SERVER_FALLBACK_MODELS = /^claude-(fable-5-[12]|mythos-5-[12]|opus-5|opus-5-5|sonnet-5-5)$/;

const fail = (provider: BackupProvider, model: string, status: number | undefined, code: Exclude<BackupResult, { ok: true }>['code']): BackupResult => ({
  ok: false,
  provider,
  model,
  code,
  status,
  message:
    code === 'rate_limit'
      ? '요청이 너무 많아요. 잠시 후 다시 시도해주세요.'
      : code === 'refused'
        ? '이 대화는 코칭해드리기 어려워요. 다른 내용으로 시도해주세요.'
        : code === 'parse'
          ? '응답을 이해하지 못했어요. 다시 시도해주세요.'
          : 'AI 서버와 통신하지 못했어요. 잠시 후 다시 시도해주세요.',
});

/** 401·403 키 문제, 429 한도, 그 밖(402 크레딧 소진·5xx 등)은 서버 문제 — 셋 다 다음 회사로 넘긴다 */
const codeOfStatus = (status: number): Exclude<BackupResult, { ok: true }>['code'] =>
  status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate_limit' : 'server';

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Anthropic Messages API — 공식 SDK 로 부른다. 다시 시도는 하지 않는다(실패하면 다음 회사로 넘기는 게 더 빠르다) */
export async function callAnthropicTask(task: AiTask, apiKey: string, options: { model?: string; effort?: string; signal?: AbortSignal } = {}): Promise<BackupResult> {
  const model = options.model || ANTHROPIC_DEFAULT_MODEL;
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const content: Anthropic.ContentBlockParam[] = [{ type: 'text', text: task.context }];
  if (task.image) content.push({ type: 'image', source: { type: 'base64', media_type: task.image.mediaType, data: task.image.base64 } });
  content.push({ type: 'text', text: task.task });
  const effort = (options.effort || 'low') as 'low' | 'medium' | 'high';
  const params = {
    model,
    max_tokens: 16000,
    // 지시문은 요청마다 같아 캐시해 둔다 (Haiku 5.5 는 512토큰부터 캐시됨)
    system: [{ type: 'text' as const, text: task.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content }],
    output_config: { effort, format: { type: 'json_schema' as const, schema: jsonSchemaOf(task.schema) } },
  };
  let body: Anthropic.Message;
  try {
    body = SERVER_FALLBACK_MODELS.test(model)
      ? ((await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming, { signal: options.signal })) as unknown as Anthropic.Message)
      : await client.messages.create(params as Anthropic.MessageCreateParamsNonStreaming, { signal: options.signal });
  } catch (e) {
    // 앱이 끊었으면 그대로 끊는다 (중계 서버가 처리)
    if (options.signal?.aborted) throw e;
    if (e instanceof Anthropic.APIError && typeof e.status === 'number') return fail('anthropic', model, e.status, codeOfStatus(e.status));
    return fail('anthropic', model, undefined, 'server');
  }
  if (body.stop_reason === 'refusal') return fail('anthropic', model, 200, 'refused');
  // 생각(thinking) 블록이 먼저 올 수 있어 종류로 고른다
  const text = body.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').pop()?.text;
  if (!text) return fail('anthropic', model, 200, 'parse');
  const u = body.usage;
  return {
    ok: true,
    provider: 'anthropic',
    model,
    text,
    // Gemini 와 같은 이름으로 — 잘린 코칭 JSON 살리기(api/coach.ts)가 이 값을 본다
    finishReason: body.stop_reason === 'max_tokens' ? 'MAX_TOKENS' : (body.stop_reason ?? undefined),
    usage: { input: u.input_tokens, output: u.output_tokens, cached: u.cache_read_input_tokens ?? undefined, total: u.input_tokens + u.output_tokens },
  };
}

/** OpenAI Responses API — JSON 스키마 출력 (strict 는 끈다: 우리 스키마에 선택 칸이 있어서) */
export async function callOpenAITask(task: AiTask, apiKey: string, options: { model?: string; signal?: AbortSignal } = {}): Promise<BackupResult> {
  const model = options.model || OPENAI_DEFAULT_MODEL;
  const content: ({ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string })[] = [{ type: 'input_text', text: task.context }];
  if (task.image) content.push({ type: 'input_image', image_url: `data:${task.image.mediaType};base64,${task.image.base64}` });
  content.push({ type: 'input_text', text: task.task });
  const payload = {
    model,
    instructions: task.system,
    input: [{ role: 'user', content }],
    max_output_tokens: 16000,
    text: { format: { type: 'json_schema', name: `sendit_${task.mode}`, strict: false, schema: jsonSchemaOf(task.schema) } },
  };
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  const body = (await readJson(res)) as {
    status?: string;
    incomplete_details?: { reason?: string } | null;
    output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  } | null;
  if (!res.ok) return fail('openai', model, res.status, codeOfStatus(res.status));
  const parts = (body?.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
  if (parts.some((p) => p.type === 'refusal')) return fail('openai', model, res.status, 'refused');
  const text = parts.filter((p) => p.type === 'output_text').map((p) => p.text ?? '').join('');
  if (!text) return fail('openai', model, res.status, 'parse');
  const u = body?.usage;
  return {
    ok: true,
    provider: 'openai',
    model,
    text,
    finishReason: body?.incomplete_details?.reason === 'max_output_tokens' ? 'MAX_TOKENS' : body?.status,
    usage: u ? { input: u.input_tokens, output: u.output_tokens, cached: u.input_tokens_details?.cached_tokens, total: u.total_tokens } : undefined,
  };
}

/** x-ai-consent 헤더 → 동의한 회사 목록, 동의한 순서 그대로 ('google' · 'google,anthropic,openai' · 'anthropic,openai,google') */
export function consentList(header: string | string[] | undefined): string[] {
  const raw = Array.isArray(header) ? header.join(',') : (header ?? '');
  return [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

/** x-ai-consent 헤더 → 동의한 회사 모음 */
export function consentedCompanies(header: string | string[] | undefined): Set<string> {
  return new Set(consentList(header));
}

/** Gemini 실패 뒤 예비로 넘어갈지 — 거절(내용 문제)·요청 형식 문제가 아니면 넘어간다 */
export const shouldFallBack = (code: string): boolean => code === 'rate_limit' || code === 'server' || code === 'auth';

/** 답을 맡기는 AI (Gemini 포함) */
export type AiProviderName = BackupProvider | 'gemini';
/** 새 동의(Claude 먼저)의 기본 순서 (2026-11-26 사용자 결정) — 환경변수 AI_PROVIDER_ORDER(쉼표, 예: openai,anthropic,gemini)로 바꾼다 */
export const DEFAULT_AI_ORDER: readonly AiProviderName[] = ['anthropic', 'openai', 'gemini'];
/** 예전 동의(google 먼저, 11-20 처리방침)의 순서 — 동의받은 그대로라 환경변수로 바꾸지 않는다 */
export const LEGACY_AI_ORDER: readonly AiProviderName[] = ['gemini', 'anthropic', 'openai'];
/** 동의 헤더에 쓰는 회사 이름 */
const COMPANY_OF: Record<AiProviderName, string> = { anthropic: 'anthropic', openai: 'openai', gemini: 'google' };

/**
 * 이번 요청을 맡길 AI 순서 — 사용자가 동의한 회사이고 키가 있는 것만.
 * 동의 목록 맨 앞이 google 이면(예전 동의) Gemini 먼저, 아니면(새 동의) Claude 먼저.
 * Google 에만 동의한 예전 앱이면 Gemini 하나만 남는다.
 */
export function aiOrder(consent: readonly string[], env: Record<string, string | undefined> = process.env): { provider: AiProviderName; key: string }[] {
  const consented = new Set(consent);
  const wanted = (env.AI_PROVIDER_ORDER ?? '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is AiProviderName => p === 'anthropic' || p === 'openai' || p === 'gemini');
  const claudeFirst = consent.length > 0 && consent[0] !== 'google';
  const order = !claudeFirst ? LEGACY_AI_ORDER : wanted.length ? [...new Set(wanted)] : DEFAULT_AI_ORDER;
  const keyOf: Record<AiProviderName, string | undefined> = { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY, gemini: env.GEMINI_API_KEY };
  return order.filter((p) => consented.has(COMPANY_OF[p]) && keyOf[p]).map((p) => ({ provider: p, key: keyOf[p] as string }));
}
