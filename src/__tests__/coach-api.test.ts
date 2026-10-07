import type { VercelRequest, VercelResponse } from '@vercel/node';

import handler from '../../api/coach';
import { callGeminiTask } from '@/lib/gemini';

// 실제 Gemini 는 부르지 않는다 — 불렸는지만 본다 (실패로 돌려 응답은 502)
jest.mock('@/lib/gemini', () => ({ callGeminiTask: jest.fn(async () => ({ ok: false, code: 'server', message: 'AI 오류' })) }));
// 이용 기록은 여기서 볼 것이 아니다
jest.mock('../../api/_supabase', () => ({ analyticsEnabled: () => false, insert: jest.fn() }));

const gemini = jest.mocked(callGeminiTask);
const BODY = {
  crush: { name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' },
  user: { name: '지훈', gender: 'male', style: [] },
  tone: 'natural',
  text: '첫 메시지 뭐라고 보낼까?',
  history: [],
};

/** 서버리스 함수를 요청 하나로 불러 응답 코드·본문을 돌려준다 */
async function post(headers: Record<string, string> = {}) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader: jest.fn(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const req = { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.1', ...headers }, body: BODY, socket: {} };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

const ENV = { ...process.env };
beforeEach(() => {
  gemini.mockClear();
  process.env = { ...ENV, GEMINI_API_KEY: 'test-gemini-key' };
  delete process.env.COACH_APP_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AI_PROVIDER;
});
afterAll(() => {
  process.env = ENV;
});

describe('중계 서버는 사용자가 동의한 회사(Google)로만 보낸다', () => {
  it('Google 에 동의한 앱의 요청은 Gemini 로 보낸다', async () => {
    await post({ 'x-ai-consent': 'google' });
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(gemini.mock.calls[0][1]).toBe('test-gemini-key');
  });

  it('동의한 회사와 서버가 보낼 회사가 다르면 AI 를 부르지 않고 점검 중으로 거절한다', async () => {
    const res = await post({ 'x-ai-consent': 'anthropic' });
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: '지금은 AI 연결을 점검 중이에요. 잠시 후 다시 시도해주세요.' });
    expect(gemini).not.toHaveBeenCalled();
  });

  it('헤더가 없는 예전 앱의 요청은 그대로 받는다', async () => {
    await post();
    expect(gemini).toHaveBeenCalledTimes(1);
  });

  it('Gemini 키가 없으면 Anthropic 키·설정이 있어도 그쪽으로 보내지 않고 500', async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.AI_PROVIDER = 'anthropic';
    const res = await post({ 'x-ai-consent': 'google' });
    expect(res.statusCode).toBe(500);
    expect(gemini).not.toHaveBeenCalled();
  });

  it('AI_PROVIDER 가 anthropic 으로 남아 있어도 Gemini 로 보낸다', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.AI_PROVIDER = 'anthropic';
    await post({ 'x-ai-consent': 'google' });
    expect(gemini).toHaveBeenCalledTimes(1);
  });
});
