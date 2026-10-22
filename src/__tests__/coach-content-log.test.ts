/**
 * api/coach.ts 의 코칭 내용 저장(logCoach) — 「코칭 내용 저장」(선택)에 동의한 앱의 요청만 coach_log 에 남긴다.
 * 1.0.4 앱(판 3 = 기본 이용 기록)은 x-content-consent: 1 이 있어야 하고, 1.0.3 까지의 앱은 이용 기록 선택 동의(판 2)로 코칭 내용까지 동의받았다.
 * Supabase 는 fetch 를 가짜로 바꿔 어떤 요청이 나가는지만 본다.
 */
import { EventEmitter } from 'node:events';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import handler from '../../api/coach';

// 실제 Gemini 는 부르지 않는다 — 실패로 돌려도 오류 정보와 함께 코칭 기록은 남는다
jest.mock('@/lib/gemini', () => ({ ...jest.requireActual('@/lib/gemini'), callGeminiTask: jest.fn(async () => ({ ok: false, code: 'server', message: 'AI 오류' })) }));

const BODY = {
  crush: { name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' },
  user: { name: '지훈', gender: 'male', style: [] },
  tone: 'natural',
  text: '첫 메시지 뭐라고 보낼까?',
  history: [],
};

function fakeRes() {
  return Object.assign(new EventEmitter(), {
    statusCode: 0,
    body: undefined as unknown,
    writableEnded: false,
    setHeader: jest.fn(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      this.writableEnded = true;
      return this;
    },
  });
}

let ipSeq = 0;
async function post(headers: Record<string, string>, body: unknown = BODY) {
  const res = fakeRes();
  const req = { method: 'POST', headers: { 'x-forwarded-for': `10.7.${Math.floor(ipSeq / 200)}.${ipSeq++ % 200}`, ...headers }, body, socket: {} };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

const calls: { url: string; method: string; body?: string }[] = [];
const logged = () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/rest/v1/coach_log'));
/** 1.0.4 앱이 「코칭 내용 저장」에 동의한 기기에서 보내는 머리글 */
const CONTENT = { 'x-ai-consent': 'google', 'x-device-id': 'd_testdevice01', 'x-session-id': 's_session01', 'x-consent-version': '3', 'x-content-consent': '1' };

const ENV = { ...process.env };
beforeEach(() => {
  calls.length = 0;
  process.env = { ...ENV, GEMINI_API_KEY: 'test-gemini-key', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'service-key', ANALYTICS_ENABLED: '1' };
  delete process.env.COACH_APP_TOKEN;
  delete process.env.AI_CONSENT_REQUIRED;
  delete process.env.ANALYTICS_OPTOUT_DEVICES;
  global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
    return { ok: true, status: 201, text: async () => '', json: async () => ({}) };
  }) as unknown as typeof fetch;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  process.env = ENV;
});

describe('코칭 내용 저장 (선택 동의)', () => {
  it('1.0.4 앱(판 3)이 「코칭 내용 저장」 동의를 알리면 질문·답(여기선 오류)을 저장한다', async () => {
    await post(CONTENT);
    expect(logged()).toHaveLength(1);
    const [row] = JSON.parse(logged()[0].body!);
    expect(row).toMatchObject({ device_id: 'd_testdevice01', question: BODY.text, crush_alias: '민지', error: 'server' });
  });

  it('판 3 인데 동의 표시가 없으면 저장하지 않는다 — 기본 이용 기록만으로는 코칭 내용을 남기지 않는다', async () => {
    const { 'x-content-consent': _consent, ...withoutConsent } = CONTENT;
    await post(withoutConsent);
    await post({ ...withoutConsent, 'x-content-consent': '0' });
    expect(logged()).toHaveLength(0);
  });

  it('1.0.3 까지의 앱(판 2)은 이용 기록 선택 동의에 코칭 내용이 포함돼 있어 그대로 저장한다', async () => {
    const { 'x-content-consent': _consent, ...legacy } = CONTENT;
    await post({ ...legacy, 'x-consent-version': '2' });
    expect(logged()).toHaveLength(1);
  });

  it('판 표시가 없는 예전 미리 체크 동의와, 기기 ID 를 빼고 보내는 비밀 상담은 저장하지 않는다', async () => {
    const { 'x-consent-version': _version, ...prechecked } = CONTENT;
    await post(prechecked);
    const { 'x-device-id': _device, ...secret } = CONTENT;
    await post(secret);
    expect(logged()).toHaveLength(0);
  });

  it('만 14세 미만으로 입력한 이용자는 동의 표시가 있어도 저장하지 않는다', async () => {
    await post(CONTENT, { ...BODY, user: { ...BODY.user, age: 13 } });
    expect(logged()).toHaveLength(0);
  });

  it('메일로 처리 정지를 요청한 기기(ANALYTICS_OPTOUT_DEVICES)는 저장하지 않는다', async () => {
    process.env.ANALYTICS_OPTOUT_DEVICES = 'd_testdevice01';
    await post(CONTENT);
    expect(logged()).toHaveLength(0);
  });

  it('이용 기록 저장이 꺼져 있으면(ANALYTICS_ENABLED) 저장하지 않는다', async () => {
    process.env.ANALYTICS_ENABLED = '0';
    await post(CONTENT);
    expect(logged()).toHaveLength(0);
  });
});
