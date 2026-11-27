/**
 * 비즈라우터(국내 AI 중계)를 붙인 AI 순서 — 동의한 회사의 모델만, 키가 있을 때만 (src/lib/ai-backup.ts)
 */
import { aiOrder, bizrouterCompany, callBizRouterTask } from '../lib/ai-backup';
import type { AiTask } from '../lib/ai-tasks';
import { z } from 'zod';

const names = (order: { provider: string }[]) => order.map((o) => o.provider);

describe('aiOrder + 비즈라우터', () => {
  const env = { GEMINI_API_KEY: 'g', BIZROUTER_API_KEY: 'b' };

  it('Google 에만 동의한 예전 앱도 Google 모델을 부르는 비즈라우터로 넘어간다', () => {
    expect(names(aiOrder(['google'], env))).toEqual(['gemini', 'bizrouter']);
  });

  it('새 동의(Claude 먼저)에서도 비즈라우터는 맨 뒤 예비', () => {
    expect(names(aiOrder(['anthropic', 'openai', 'google'], { ...env, ANTHROPIC_API_KEY: 'a' }))).toEqual(['anthropic', 'gemini', 'bizrouter']);
  });

  it('BIZROUTER_FIRST=1 이면 맨 앞', () => {
    expect(names(aiOrder(['google', 'anthropic', 'openai'], { ...env, BIZROUTER_FIRST: '1' }))).toEqual(['bizrouter', 'gemini']);
  });

  it('키가 없으면 빠진다', () => {
    expect(names(aiOrder(['google'], { GEMINI_API_KEY: 'g' }))).toEqual(['gemini']);
  });

  it('비즈라우터 모델 회사에 동의하지 않았으면 쓰지 않는다', () => {
    expect(names(aiOrder(['google'], { ...env, BIZROUTER_MODEL: 'anthropic/claude-haiku-4.5' }))).toEqual(['gemini']);
    expect(names(aiOrder(['google'], { ...env, BIZROUTER_MODEL: 'upstage/solar-pro' }))).toEqual(['gemini']);
  });

  it('모델 이름 앞 회사', () => {
    expect(bizrouterCompany(undefined)).toBe('google');
    expect(bizrouterCompany('openai/gpt-5.5')).toBe('openai');
    expect(bizrouterCompany('upstage/solar-pro')).toBeNull();
  });
});

describe('callBizRouterTask', () => {
  const task = { mode: 'coach', system: 'sys', context: 'ctx', task: 'do', schema: z.object({ a: z.string() }), normalize: (x: unknown) => x } as unknown as AiTask;
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('OpenAI 방식 주소로 JSON 스키마 출력을 요청하고 답 글을 돌려준다', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"a":"x"}' } }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const r = await callBizRouterTask(task, 'key');
    expect(r).toMatchObject({ ok: true, provider: 'bizrouter', model: 'google/gemini-3.5-flash', text: '{"a":"x"}', usage: { input: 3, output: 2, total: 5 } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe('https://api.bizrouter.ai/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer key');
    const sent = JSON.parse(init.body);
    expect(sent.response_format.type).toBe('json_schema');
    expect(sent.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('크레딧 소진(402)은 서버 문제로 — 다음 회사로 넘긴다', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 402, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await callBizRouterTask(task, 'key')).toMatchObject({ ok: false, code: 'server', status: 402 });
  });

  it('잘린 답(length)은 MAX_TOKENS 로 알린다', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{"a":' } }] }) })) as unknown as typeof fetch;
    expect(await callBizRouterTask(task, 'key')).toMatchObject({ ok: true, finishReason: 'MAX_TOKENS' });
  });
});
