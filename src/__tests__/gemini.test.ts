import { buildCoachTask, type AiTask } from '@/lib/ai-tasks';
import { CoachRequestSchema, coachOutputJsonSchema } from '@/lib/coach-schema';
import { buildGeminiBody, buildGeminiTaskBody, callGemini, retryAfterMsOf, toGeminiSchema } from '@/lib/gemini';
import { detectProvider } from '@/lib/coach-client';

const req = CoachRequestSchema.parse({
  crush: { name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' },
  user: { name: '지훈', gender: 'male', style: [] },
  tone: 'natural',
  text: '첫 메시지 뭐라고 보낼까?',
  image: { base64: 'QUJD', mediaType: 'image/jpeg' },
});

const OK_BODY = { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }] };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

/** 부른 모델 이름을 순서대로 남기는 가짜 fetch. respond 가 모델·몇 번째 호출에 맞는 응답을 정한다 */
function fakeFetch(respond: (model: string, call: number) => Response) {
  const models: string[] = [];
  const inits: RequestInit[] = [];
  const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
    const model = decodeURIComponent(/\/models\/([^:]+):generateContent/.exec(url)?.[1] ?? '');
    models.push(model);
    inits.push(init);
    return respond(model, models.length);
  }) as unknown as typeof fetch;
  return { fetchImpl, models, inits };
}

describe('toGeminiSchema', () => {
  it('converts nullable unions and strips unsupported keywords', () => {
    const s = toGeminiSchema(coachOutputJsonSchema() as Record<string, unknown>) as {
      type: string;
      additionalProperties?: unknown;
      properties: Record<string, { type?: string; nullable?: boolean; enum?: string[]; items?: { type: string } }>;
      propertyOrdering: string[];
    };
    expect(s.type).toBe('object');
    expect(s.additionalProperties).toBeUndefined();
    expect(s.properties.interestScore).toEqual(expect.objectContaining({ type: 'number', nullable: true }));
    expect(s.properties.temperature.enum).toContain('warm');
    expect(s.properties.replies.items?.type).toBe('object');
    // 호칭·말투를 먼저 읽게 해야 답장에서도 같은 호칭·말투를 쓴다
    expect(s.propertyOrdering.slice(0, 3)).toEqual(['callName', 'speechLevel', 'summary']);
    expect(s.properties.callName).toEqual(expect.objectContaining({ type: 'string', nullable: true }));
  });
});

describe('buildGeminiBody', () => {
  it('orders parts as context → image → task and requests JSON output', () => {
    const body = buildGeminiBody(req);
    expect('text' in body.contents[0].parts[0]).toBe(true);
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } });
    expect('text' in body.contents[0].parts[2]).toBe(true);
    expect(body.generationConfig.mediaResolution).toBe('MEDIA_RESOLUTION_MEDIUM');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction.parts[0].text).toContain('연애코치');
  });

  it('기본은 지금 그대로 (생각 low · 모드별 temperature), 스위치를 주면 바뀐다', () => {
    const task = buildCoachTask(req) as AiTask;
    const base = buildGeminiTaskBody(task);
    expect(base.generationConfig).toEqual(expect.objectContaining({ temperature: 0.8, thinkingConfig: { thinkingLevel: 'low' }, maxOutputTokens: 2560 }));
    const tuned = buildGeminiTaskBody(task, { thinkingLevel: 'minimal', omitTemperature: true });
    expect(tuned.generationConfig).not.toHaveProperty('temperature');
    expect(tuned.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    // 나머지(출력 상한·이미지 해상도·응답 형식)는 그대로
    expect(tuned.generationConfig.maxOutputTokens).toBe(2560);
    expect(tuned.generationConfig.responseSchema).toEqual(base.generationConfig.responseSchema);
  });
});

describe('callGemini — 사용량', () => {
  it('글·모델·토큰 수(입력·출력·생각·캐시·전체)·종료 이유·시도 횟수를 돌려준다', async () => {
    const fetchImpl = jest.fn(async () =>
      json({
        candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 2386, candidatesTokenCount: 663, thoughtsTokenCount: 412, cachedContentTokenCount: 1024, totalTokenCount: 3461 },
      }),
    ) as unknown as typeof fetch;
    const result = await callGemini(req, 'AIza-test', { fetchImpl });
    expect(result).toEqual({
      ok: true,
      text: '{"a":1}',
      model: 'gemini-3.5-flash',
      usage: { input: 2386, output: 663, thoughts: 412, cached: 1024, total: 3461 },
      finishReason: 'STOP',
      attempts: 1,
    });
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/gemini-3.5-flash:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
  });

  it('토큰 수가 없거나 숫자가 아니면 비워 둔다', async () => {
    const { fetchImpl } = fakeFetch(() => json({ ...OK_BODY, usageMetadata: { promptTokenCount: '12', candidatesTokenCount: -1 } }));
    const result = await callGemini(req, 'k', { fetchImpl });
    expect(result.usage).toEqual({});
  });

  it('출력 상한에 걸려 잘린 응답(MAX_TOKENS)은 다시 부르지 않고 그대로 돌려준다 (종료 이유로 알 수 있게)', async () => {
    const { fetchImpl, models } = fakeFetch(() => json({ candidates: [{ content: { parts: [{ text: '{"summary":"잘' }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { thoughtsTokenCount: 2000 } }));
    const result = await callGemini(req, 'k', { fetchImpl, retryDelayMs: 0 });
    expect(result).toEqual(expect.objectContaining({ ok: true, finishReason: 'MAX_TOKENS', attempts: 1, usage: expect.objectContaining({ thoughts: 2000 }) }));
    expect(models).toHaveLength(1);
  });
});

describe('callGemini — 다시 부르기', () => {
  it('503 이면 같은 모델을 한 번 더 부른 뒤 가벼운 모델로 한 번 (최대 3번)', async () => {
    const { fetchImpl, models } = fakeFetch((model) => (model === 'gemini-3.5-flash' ? json({ error: { message: 'high demand' } }, 503) : json(OK_BODY)));
    const result = await callGemini(req, 'AIza-test', { fetchImpl, retryDelayMs: 0 });
    expect(result).toEqual(expect.objectContaining({ ok: true, model: 'gemini-3.5-flash-lite', attempts: 3 }));
    expect(models).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  });

  it('계속 혼잡하면 3번에서 멈추고, 같은 모델을 가리키는 gemini-flash-latest 는 부르지 않는다', async () => {
    const { fetchImpl, models } = fakeFetch(() => json({ error: { message: 'quota' } }, 429));
    const result = await callGemini(req, 'k', { fetchImpl, retryDelayMs: 0 });
    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'rate_limit', status: 429, attempts: 3, model: 'gemini-3.5-flash-lite' }));
    expect(models).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']);
    expect(models).not.toContain('gemini-flash-latest');
  });

  it('기본 모델이 이미 가벼운 모델이면 gemini-3.5-flash 로 넘어간다', async () => {
    const { fetchImpl, models } = fakeFetch((model) => (model === 'gemini-3.5-flash-lite' ? json({}, 503) : json(OK_BODY)));
    const result = await callGemini(req, 'k', { fetchImpl, retryDelayMs: 0, model: 'gemini-3.5-flash-lite' });
    expect(result).toEqual(expect.objectContaining({ ok: true, model: 'gemini-3.5-flash' }));
    expect(models).toEqual(['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash']);
  });

  it('대체 모델을 [] 로 주면 같은 모델만 두 번 (A/B 비교처럼 모델을 바꾸면 안 될 때)', async () => {
    const { fetchImpl, models } = fakeFetch(() => json({}, 503));
    await callGemini(req, 'k', { fetchImpl, retryDelayMs: 0, model: 'gemini-3.6-flash', fallbackModels: [] });
    expect(models).toEqual(['gemini-3.6-flash', 'gemini-3.6-flash']);
  });

  it.each([
    ['키 오류 400', 400, { error: { message: 'API key not valid' } }, 'auth'],
    ['권한 403', 403, { error: { message: 'denied' } }, 'auth'],
    ['잘못된 요청 400', 400, { error: { message: 'thinking level not supported' } }, 'server'],
    ['없는 모델 404', 404, { error: { message: 'not found' } }, 'server'],
    ['서버 오류 500', 500, { error: { message: 'internal' } }, 'server'],
  ])('%s 는 다시 부르지 않는다', async (_label, status, body, code) => {
    const { fetchImpl, models } = fakeFetch(() => json(body, status));
    const result = await callGemini(req, 'k', { fetchImpl, retryDelayMs: 0 });
    expect(result).toEqual(expect.objectContaining({ ok: false, code, attempts: 1 }));
    expect(models).toHaveLength(1);
  });

  it('안전 거절도 다시 부르지 않는다', async () => {
    const { fetchImpl, models } = fakeFetch(() => json({ promptFeedback: { blockReason: 'SAFETY' } }));
    expect(await callGemini(req, 'x', { fetchImpl })).toEqual(expect.objectContaining({ ok: false, code: 'refused' }));
    expect(models).toHaveLength(1);
  });

  describe('Retry-After', () => {
    beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] }));
    afterEach(() => jest.useRealTimers());

    it('헤더가 알려 준 만큼 기다렸다가 같은 모델을 다시 부른다', async () => {
      const { fetchImpl, models } = fakeFetch((_m, call) => (call === 1 ? json({}, 429, { 'retry-after': '2' }) : json(OK_BODY)));
      const done = callGemini(req, 'k', { fetchImpl });
      await jest.advanceTimersByTimeAsync(1999);
      expect(models).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(done).resolves.toEqual(expect.objectContaining({ ok: true, model: 'gemini-3.5-flash', attempts: 2 }));
      expect(models).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash']);
    });

    it('오류 본문의 RetryInfo 도 본다', async () => {
      const { fetchImpl, models } = fakeFetch((_m, call) =>
        call === 1 ? json({ error: { message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1.5s' }] } }, 429) : json(OK_BODY),
      );
      const done = callGemini(req, 'k', { fetchImpl });
      await jest.advanceTimersByTimeAsync(1499);
      expect(models).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(done).resolves.toEqual(expect.objectContaining({ ok: true, attempts: 2 }));
    });

    it('기다리라는 시간이 너무 길면(5초 넘게) 같은 모델은 건너뛰고 바로 대체 모델로', async () => {
      const { fetchImpl, models } = fakeFetch((model) => (model === 'gemini-3.5-flash' ? json({}, 429, { 'retry-after': '30' }) : json(OK_BODY)));
      const result = await callGemini(req, 'k', { fetchImpl });
      expect(result).toEqual(expect.objectContaining({ ok: true, model: 'gemini-3.5-flash-lite', attempts: 2 }));
      expect(models).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
    });

    it('헤더가 없으면 잠깐(0.8초)만 기다린다', async () => {
      const { fetchImpl, models } = fakeFetch((_m, call) => (call === 1 ? json({}, 503) : json(OK_BODY)));
      const done = callGemini(req, 'k', { fetchImpl });
      await jest.advanceTimersByTimeAsync(799);
      expect(models).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(done).resolves.toEqual(expect.objectContaining({ ok: true, attempts: 2 }));
    });
  });

  it('retryAfterMsOf: 초·날짜·RetryInfo 를 읽고, 모르는 값은 버린다', () => {
    const now = Date.parse('2026-10-07T00:00:00Z');
    expect(retryAfterMsOf('3', null, now)).toBe(3000);
    expect(retryAfterMsOf('Wed, 07 Oct 2026 00:00:04 GMT', null, now)).toBe(4000);
    expect(retryAfterMsOf(null, { error: { details: [{ retryDelay: '12s' }] } }, now)).toBe(12000);
    expect(retryAfterMsOf('soon', { error: { details: [{ retryDelay: 'later' }] } }, now)).toBeUndefined();
    expect(retryAfterMsOf(undefined, null, now)).toBeUndefined();
  });
});

describe('callGemini — 끊기면 멈춘다', () => {
  it('받은 신호를 fetch 에 그대로 넘긴다', async () => {
    const { fetchImpl, inits } = fakeFetch(() => json(OK_BODY));
    const controller = new AbortController();
    await callGemini(req, 'k', { fetchImpl, signal: controller.signal });
    expect(inits[0].signal).toBe(controller.signal);
  });

  it('이미 끊긴 요청은 부르지 않는다', async () => {
    const { fetchImpl, models } = fakeFetch(() => json(OK_BODY));
    const controller = new AbortController();
    controller.abort();
    await expect(callGemini(req, 'k', { fetchImpl, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(models).toHaveLength(0);
  });

  it('다시 부르려고 기다리는 중에 끊기면 더 부르지 않는다', async () => {
    const controller = new AbortController();
    const { fetchImpl, models } = fakeFetch(() => {
      // 첫 응답이 혼잡이고, 기다리는 사이에 앱이 끊고 나간다
      setTimeout(() => controller.abort(), 10);
      return json({}, 503);
    });
    await expect(callGemini(req, 'k', { fetchImpl, signal: controller.signal, retryDelayMs: 1000 })).rejects.toMatchObject({ name: 'AbortError' });
    expect(models).toEqual(['gemini-3.5-flash']);
  });
});

describe('detectProvider', () => {
  it('detects by key prefix', () => {
    expect(detectProvider('sk-ant-abc')).toBe('anthropic');
    expect(detectProvider('AIzaSyabc')).toBe('gemini');
    expect(detectProvider('AQ.example123')).toBe('gemini');
    expect(detectProvider('nope')).toBeNull();
  });
});
