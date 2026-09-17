import { CoachRequestSchema, coachOutputJsonSchema } from '@/lib/coach-schema';
import { buildGeminiBody, callGemini, toGeminiSchema } from '@/lib/gemini';
import { detectProvider } from '@/lib/coach-client';

const req = CoachRequestSchema.parse({
  crush: { name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' },
  user: { name: '지훈', gender: 'male', style: [] },
  tone: 'natural',
  text: '첫 메시지 뭐라고 보낼까?',
  image: { base64: 'QUJD', mediaType: 'image/jpeg' },
});

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
    expect(s.propertyOrdering[0]).toBe('summary');
  });
});

describe('buildGeminiBody', () => {
  it('places the image before the text and requests JSON output', () => {
    const body = buildGeminiBody(req);
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } });
    expect('text' in body.contents[0].parts[1]).toBe(true);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction.parts[0].text).toContain('연애코치');
  });
});

describe('callGemini', () => {
  it('extracts text and usage from a successful response', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }), { status: 200 }),
    ) as unknown as typeof fetch;
    const result = await callGemini(req, 'AIza-test', { fetchImpl });
    expect(result).toEqual({ ok: true, text: '{"a":1}', model: 'gemini-3.5-flash', usage: { input: 10, output: 5 } });
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/gemini-3.5-flash:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
  });

  it('retries on 503 and falls back to the next model', async () => {
    const calls: string[] = [];
    const fetchImpl = jest.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('gemini-3.5-flash:')) return new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await callGemini(req, 'AIza-test', { fetchImpl, retryDelayMs: 0 });
    expect(result).toEqual(expect.objectContaining({ ok: true, model: 'gemini-3.5-flash-lite' }));
    expect(calls.filter((u) => u.includes('gemini-3.5-flash:'))).toHaveLength(2);
    expect(calls.filter((u) => u.includes('gemini-3.5-flash-lite:'))).toHaveLength(1);
  });

  it('maps auth and safety failures', async () => {
    const bad = jest.fn(async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 })) as unknown as typeof fetch;
    expect(await callGemini(req, 'x', { fetchImpl: bad })).toEqual(expect.objectContaining({ ok: false, code: 'auth' }));
    const blocked = jest.fn(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 })) as unknown as typeof fetch;
    expect(await callGemini(req, 'x', { fetchImpl: blocked })).toEqual(expect.objectContaining({ ok: false, code: 'refused' }));
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
