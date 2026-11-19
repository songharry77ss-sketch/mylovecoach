/**
 * 예비 AI — Gemini 가 한도·혼잡·오류로 답하지 못할 때 중계 서버(api/coach.ts)가 차례로 부른다.
 * Anthropic(Claude) → OpenAI(GPT). 사용자가 세 회사(Google·Anthropic·OpenAI)로 보내는 데 동의한 요청에만 쓴다
 * (앱 x-ai-consent: google,anthropic,openai — src/lib/ai-consent.ts). 서버 전용: 키는 환경변수에서만 받는다.
 *
 * 돌려주는 모양은 callGeminiTask 와 맞춘다 — 성공이면 JSON 글(text), 실패면 code·message.
 * 원문 오류(영어)는 로그에 상태 코드만 남기고 화면에는 우리 문구를 쓴다.
 */
import { jsonSchemaOf, type AiTask } from '@/lib/ai-tasks';

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

/** 기본 모델 — 환경변수 ANTHROPIC_MODEL · OPENAI_MODEL 로 바꿀 수 있다 */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';
export const OPENAI_DEFAULT_MODEL = 'gpt-6.2-astra';

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

const codeOfStatus = (status: number): Exclude<BackupResult, { ok: true }>['code'] =>
  status === 401 || status === 403 ? 'auth' : status === 429 ? 'rate_limit' : 'server';

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Anthropic Messages API — 기기 개인 키 모드(coach-client viaAnthropic)와 같은 요청 모양, 서버에서 키로 부른다 */
export async function callAnthropicTask(task: AiTask, apiKey: string, options: { model?: string; effort?: string; signal?: AbortSignal } = {}): Promise<BackupResult> {
  const model = options.model || ANTHROPIC_DEFAULT_MODEL;
  const content: ({ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } })[] = [{ type: 'text', text: task.context }];
  if (task.image) content.push({ type: 'image', source: { type: 'base64', media_type: task.image.mediaType, data: task.image.base64 } });
  content.push({ type: 'text', text: task.task });
  const payload = {
    model,
    max_tokens: 16000,
    // 안전 분류기가 거절하면 서버가 권장 대체 모델로 다시 돌린다
    fallbacks: 'default',
    system: [{ type: 'text', text: task.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    output_config: { effort: options.effort || 'low', format: { type: 'json_schema', schema: jsonSchemaOf(task.schema) } },
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  const body = (await readJson(res)) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
  } | null;
  if (!res.ok) return fail('anthropic', model, res.status, codeOfStatus(res.status));
  if (body?.stop_reason === 'refusal') return fail('anthropic', model, res.status, 'refused');
  const text = body?.content?.filter((b) => b.type === 'text').pop()?.text;
  if (!text) return fail('anthropic', model, res.status, 'parse');
  const u = body?.usage;
  return {
    ok: true,
    provider: 'anthropic',
    model,
    text,
    // Gemini 와 같은 이름으로 — 잘린 코칭 JSON 살리기(api/coach.ts)가 이 값을 본다
    finishReason: body?.stop_reason === 'max_tokens' ? 'MAX_TOKENS' : body?.stop_reason,
    usage: u ? { input: u.input_tokens, output: u.output_tokens, cached: u.cache_read_input_tokens, total: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) } : undefined,
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

/** x-ai-consent 헤더 → 동의한 회사 목록 ('google' · 'google,anthropic,openai') */
export function consentedCompanies(header: string | string[] | undefined): Set<string> {
  const raw = Array.isArray(header) ? header.join(',') : (header ?? '');
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/** Gemini 실패 뒤 예비로 넘어갈지 — 거절(내용 문제)·요청 형식 문제가 아니면 넘어간다 */
export const shouldFallBack = (code: string): boolean => code === 'rate_limit' || code === 'server' || code === 'auth';

/** 동의·키가 있는 예비 회사 순서 (Claude → GPT) */
export function backupOrder(consented: Set<string>, env: Record<string, string | undefined> = process.env): { provider: BackupProvider; key: string }[] {
  const out: { provider: BackupProvider; key: string }[] = [];
  if (consented.has('anthropic') && env.ANTHROPIC_API_KEY) out.push({ provider: 'anthropic', key: env.ANTHROPIC_API_KEY });
  if (consented.has('openai') && env.OPENAI_API_KEY) out.push({ provider: 'openai', key: env.OPENAI_API_KEY });
  return out;
}
