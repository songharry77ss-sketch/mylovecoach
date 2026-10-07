/**
 * api/report.ts — AI 답변 신고. 앱 토큰·크기·빈도 제한, 형식 검사, Supabase 가 없을 때 503,
 * 그리고 누가 보냈는지(기기 ID·IP)는 저장하지 않는지가 핵심이다.
 * Supabase 는 fetch 를 가짜로 바꿔 어떤 요청이 나가는지만 본다.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import handler from '../../api/report';
import { AI_REPORT_MODES, AI_REPORT_REASONS, AiReportSchema } from '../lib/ai-report-schema';

interface FakeRes {
  statusCode: number;
  body?: { error?: string; ok?: boolean };
  setHeader: () => FakeRes;
  status: (code: number) => FakeRes;
  json: (body: FakeRes['body']) => FakeRes;
  end: () => FakeRes;
}

function fakeRes(): FakeRes {
  const res = { statusCode: 200 } as FakeRes;
  res.setHeader = () => res;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.end = () => res;
  return res;
}

let ipSeq = 0;
function fakeReq(method: string, body: unknown, headers: Record<string, string> = {}) {
  ipSeq += 1;
  return { method, body, query: {}, headers: { 'x-forwarded-for': `10.7.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`, ...headers } } as never;
}

const calls: { url: string; method: string; body?: string }[] = [];
let insertOk = true;
const goodBody = (extra: Record<string, unknown> = {}) => ({
  mode: 'practice',
  reason: 'sexual',
  note: '상대역이 갑자기 이상한 말을 했어요',
  content: '연습 상대 「민준」: (부적절한 말)',
  model: 'google/relay',
  platform: 'android',
  appVersion: '1.0.0',
  ...extra,
});

beforeEach(() => {
  calls.length = 0;
  insertOk = true;
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  delete process.env.ANALYTICS_ENABLED;
  delete process.env.COACH_APP_TOKEN;
  global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
    return { ok: insertOk, status: insertOk ? 201 : 500, text: async () => '', json: async () => ({}) };
  }) as unknown as typeof fetch;
});

const inserted = () => {
  const call = calls.find((c) => c.url.endsWith('/rest/v1/ai_report') && c.method === 'POST');
  return call ? (JSON.parse(call.body!) as Record<string, unknown>[])[0] : undefined;
};

describe('POST /api/report', () => {
  it('이용 기록 수집이 꺼져 있어도 신고는 저장하고 201 — 기기 ID·IP 는 남기지 않는다', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody({ deviceId: 'd_testdevice01', ip: '1.2.3.4' }), { 'x-device-id': 'd_testdevice01' }), res as never);
    expect(res.statusCode).toBe(201);
    const row = inserted();
    expect(row).toEqual({
      mode: 'practice',
      reason: 'sexual',
      note: '상대역이 갑자기 이상한 말을 했어요',
      content: '연습 상대 「민준」: (부적절한 말)',
      model: 'google/relay',
      platform: 'android',
      app_version: '1.0.0',
    });
    expect(JSON.stringify(row)).not.toMatch(/d_testdevice01|10\.7\.|1\.2\.3\.4/);
  });

  it('마이 탭처럼 답변 없이 메모만 있어도 받는다 (content 는 비워 저장)', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody({ mode: 'coach', reason: 'other', content: undefined, note: '어제 받은 답장이 모욕적이었어요' })), res as never);
    expect(res.statusCode).toBe(201);
    expect(inserted()).toMatchObject({ mode: 'coach', reason: 'other', content: null, note: '어제 받은 답장이 모욕적이었어요' });
  });

  it('문자열 본문(JSON)도 받는다', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', JSON.stringify(goodBody())), res as never);
    expect(res.statusCode).toBe(201);
  });

  it.each([
    ['모르는 사유', { reason: 'boring' }],
    ['모르는 기능', { mode: 'kkti' }],
    ['메모 300자 초과', { note: '가'.repeat(301) }],
    ['답변 4000자 초과', { content: '가'.repeat(4001) }],
    ['답변도 메모도 없음', { content: '  ', note: '' }],
    ['기기 종류가 너무 김', { platform: 'x'.repeat(17) }],
  ])('형식이 틀리면 400 (%s)', async (_label, extra) => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody(extra)), res as never);
    expect(res.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('JSON 이 아닌 본문은 400', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', '{not json'), res as never);
    expect(res.statusCode).toBe(400);
  });

  it('Supabase 가 연결되지 않았으면 저장하지 않고 503', async () => {
    delete process.env.SUPABASE_URL;
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody()), res as never);
    expect(res.statusCode).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('저장에 실패하면 502 — 앱은 시트를 닫지 않고 다시 보내게 한다', async () => {
    insertOk = false;
    // 저장 실패 로그(console.warn)는 여기서 일부러 내는 것이라 가린다
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody()), res as never);
    expect(res.statusCode).toBe(502);
    expect(res.body?.error).toBeTruthy();
    warn.mockRestore();
  });

  it('본문이 16KB 를 넘으면 413', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody(), { 'content-length': String(17 * 1024) }), res as never);
    expect(res.statusCode).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('한글 4000자 답변 + 300자 메모는 16KB 안에 들어간다', () => {
    const bytes = Buffer.byteLength(JSON.stringify(goodBody({ content: '가'.repeat(4000), note: '나'.repeat(300) })), 'utf8');
    expect(bytes).toBeLessThan(16 * 1024);
  });

  it('같은 IP 가 10분에 10번을 넘으면 429', async () => {
    let last = fakeRes();
    for (let i = 0; i < 11; i += 1) {
      last = fakeRes();
      await handler({ method: 'POST', body: goodBody(), query: {}, headers: { 'x-forwarded-for': '10.8.8.8' } } as never, last as never);
    }
    expect(last.statusCode).toBe(429);
    expect(calls.filter((c) => c.url.endsWith('/rest/v1/ai_report'))).toHaveLength(10);
  });

  it('앱 토큰이 설정돼 있으면 맞지 않는 요청은 401, 맞으면 201', async () => {
    process.env.COACH_APP_TOKEN = 'app-token';
    const wrong = fakeRes();
    await handler(fakeReq('POST', goodBody(), { 'x-app-token': 'wrong' }), wrong as never);
    expect(wrong.statusCode).toBe(401);
    const right = fakeRes();
    await handler(fakeReq('POST', goodBody(), { 'x-app-token': 'app-token' }), right as never);
    expect(right.statusCode).toBe(201);
  });

  it('POST 가 아니면 405', async () => {
    const res = fakeRes();
    await handler(fakeReq('GET', undefined), res as never);
    expect(res.statusCode).toBe(405);
  });
});

describe('앱·서버·관리자 페이지가 같은 값을 쓴다', () => {
  it('앱 시트에서 고를 수 있는 기능·사유는 모두 서버가 받는다', () => {
    for (const mode of AI_REPORT_MODES) {
      for (const reason of AI_REPORT_REASONS) expect(AiReportSchema.safeParse({ mode, reason, content: '답변' }).success).toBe(true);
    }
  });

  it('관리자 페이지의 기능·사유 이름표가 모든 값을 덮는다', () => {
    const html = readFileSync(join(__dirname, '../../site/admin.html'), 'utf8');
    const keysOf = (name: string) => [...(html.match(new RegExp(`const ${name} = \\{([^\\n]*)\\};`))?.[1] ?? '').matchAll(/(\w+):\s*'/g)].map((m) => m[1]);
    expect(keysOf('REPORT_MODE').sort()).toEqual([...AI_REPORT_MODES].sort());
    expect(keysOf('REPORT_REASON').sort()).toEqual([...AI_REPORT_REASONS].sort());
  });
});
