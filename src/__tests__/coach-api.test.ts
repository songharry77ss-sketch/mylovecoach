import { EventEmitter } from 'node:events';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import handler, { MAX_BODY_BYTES, SERVER_DEADLINE_MS } from '../../api/coach';
import { MAX_REQUEST_ARRAY_LENGTH } from '@/lib/ai-tasks';
import { IMAGE_TOO_LARGE_MESSAGE, MAX_IMAGE_BASE64_LENGTH } from '@/lib/coach-schema';
import { callGeminiTask, GEMINI_FALLBACK_MODELS, type CallGeminiOptions } from '@/lib/gemini';

// 실제 Gemini 는 부르지 않는다 — 불렸는지만 본다 (기본은 실패로 돌려 응답은 502). 나머지(모델 이름·생각 수준 목록)는 진짜를 쓴다
jest.mock('@/lib/gemini', () => ({ ...jest.requireActual('@/lib/gemini'), callGeminiTask: jest.fn(async () => ({ ok: false, code: 'server', message: 'AI 오류' })) }));
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
const ANALYSIS = { callName: null, speechLevel: 'casual', summary: '좋은 분위기예요', temperature: 'warm', interestScore: 60, heatDelta: 4, insights: [], replies: [{ tone: 'natural', text: '나도 좋아!', why: '', expectedReaction: 'ㅋㅋ', successRate: 70 }], nextStep: '', warnings: [] };
const MIND = { headline: '바빴을 가능성이 커요', innerVoice: '답장해야 하는데', possibilities: [{ label: '진짜 바빴음', percent: 100, reason: '' }], advice: '', sampleReply: '' };

/** 응답 흉내 — 연결이 닫히는 것(close)도 흉내 낼 수 있게 이벤트를 낸다 */
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
/** 서버리스 함수를 요청 하나로 불러 응답 코드·본문을 돌려준다 (요청마다 다른 IP — 호출 제한에 걸리지 않게) */
async function post(headers: Record<string, string> = {}, body: unknown = BODY, res = fakeRes()) {
  const req = { method: 'POST', headers: { 'x-forwarded-for': `10.0.${Math.floor(ipSeq / 200)}.${ipSeq++ % 200}`, ...headers }, body, socket: {} };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

/** 이번 요청이 남긴 로그 줄 (JSON) */
function logLines(spy: jest.SpyInstance): Record<string, unknown>[] {
  return spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"log":"coach_api"')).map((l) => JSON.parse(l) as Record<string, unknown>);
}

const ENV = { ...process.env };
const FLAG_ENV = ['GEMINI_MODEL', 'GEMINI_MODEL_LIGHT', 'GEMINI_THINKING_COACH', 'GEMINI_THINKING_REPORT', 'GEMINI_THINKING_MIND', 'GEMINI_THINKING_PRACTICE', 'GEMINI_OMIT_TEMPERATURE'];
let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
beforeEach(() => {
  gemini.mockClear();
  process.env = { ...ENV, GEMINI_API_KEY: 'test-gemini-key' };
  delete process.env.COACH_APP_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AI_PROVIDER;
  delete process.env.AI_CONSENT_REQUIRED;
  for (const name of FLAG_ENV) delete process.env[name];
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
});
afterAll(() => {
  process.env = ENV;
});

/** 성공 응답을 흉내 낸다 (몇 번째 시도·모델도 서버에 알려 준다) */
function succeed(output: unknown, extra: Partial<{ model: string; attempts: number; finishReason: string }> = {}) {
  gemini.mockImplementationOnce(async (_task, _key, options?: CallGeminiOptions) => {
    const model = extra.model ?? options?.model ?? 'gemini-3.5-flash';
    for (let i = 1; i <= (extra.attempts ?? 1); i++) options?.onAttempt?.(model, i);
    return { ok: true, text: JSON.stringify(output), model, attempts: extra.attempts ?? 1, finishReason: extra.finishReason ?? 'STOP', usage: { input: 2386, output: 663, thoughts: 412, cached: 0, total: 3461 } };
  });
}

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

  it('헤더가 없는 예전 앱은 그 판 처리방침대로 Google 에 동의한 것으로 보고 받는다', async () => {
    await post();
    expect(gemini).toHaveBeenCalledTimes(1);
  });

  it('AI_CONSENT_REQUIRED=1 이면 헤더 없는 예전 앱은 AI 를 부르지 않고 업데이트를 안내한다', async () => {
    process.env.AI_CONSENT_REQUIRED = '1';
    const res = await post();
    expect(res.statusCode).toBe(426);
    expect((res.body as { error: string }).error).toContain('최신 버전으로 업데이트');
    expect(gemini).not.toHaveBeenCalled();
  });

  it('AI_CONSENT_REQUIRED=1 이어도 Google 에 동의한 새 앱은 그대로 보낸다', async () => {
    process.env.AI_CONSENT_REQUIRED = '1';
    const res = await post({ 'x-ai-consent': 'google' });
    expect(res.statusCode).not.toBe(426);
    expect(gemini).toHaveBeenCalledTimes(1);
  });

  it('AI_CONSENT_REQUIRED=1 일 때 다른 회사에 동의한 앱은 업데이트 안내가 아니라 점검 중(503)으로 거절한다', async () => {
    process.env.AI_CONSENT_REQUIRED = '1';
    const res = await post({ 'x-ai-consent': 'anthropic' });
    expect(res.statusCode).toBe(503);
    expect(gemini).not.toHaveBeenCalled();
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

describe('사용량 로그', () => {
  it('요청마다 한 줄 — 모드·모델·토큰 수·종료 이유·시도 횟수·시간만 남기고 대화 내용은 남기지 않는다', async () => {
    succeed(ANALYSIS, { attempts: 2 });
    const res = await post({ 'x-ai-consent': 'google' }, { ...BODY, crush: { ...BODY.crush, notes: '헬스장에서 만난 사람' } });
    expect(res.statusCode).toBe(200);
    const lines = logLines(logSpy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      log: 'coach_api',
      mode: 'coach',
      status: 200,
      model: 'gemini-3.5-flash',
      attempts: 2,
      finishReason: 'STOP',
      promptTokens: 2386,
      candidatesTokens: 663,
      thoughtsTokens: 412,
      cachedTokens: 0,
      totalTokens: 3461,
      image: false,
      ms: expect.any(Number),
    });
    const raw = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    for (const secret of ['민지', '지훈', '첫 메시지', '헬스장', '10.0.']) expect(raw).not.toContain(secret);
  });

  it('응답에도 늘어난 사용량(생각·캐시·전체 토큰)을 싣는다', async () => {
    succeed(ANALYSIS);
    const res = await post();
    expect(res.body).toEqual(expect.objectContaining({ usage: { input: 2386, output: 663, thoughts: 412, cached: 0, total: 3461 }, provider: 'gemini' }));
    succeed(MIND);
    const mind = await post({}, { mode: 'mind', situation: '읽고 답이 없어요', perspective: 'male' });
    expect(mind.body).toEqual(expect.objectContaining({ mode: 'mind', usage: expect.objectContaining({ thoughts: 412 }) }));
  });

  it('거절·실패도 한 줄씩 남는다 (이유 코드와 함께)', async () => {
    await post({ 'x-ai-consent': 'anthropic' });
    await post();
    const lines = logLines(logSpy);
    expect(lines.map((l) => [l.status, l.error])).toEqual([
      [503, 'consent'],
      [502, 'server'],
    ]);
  });

  it('잘린 JSON(MAX_TOKENS)은 502 이고, 로그에 종료 이유가 남는다', async () => {
    gemini.mockImplementationOnce(async () => ({ ok: true, text: '{"summary":"잘', model: 'gemini-3.5-flash', attempts: 1, finishReason: 'MAX_TOKENS', usage: { thoughts: 2000 } }));
    const res = await post();
    expect(res.statusCode).toBe(502);
    expect(logLines(logSpy)[0]).toEqual(expect.objectContaining({ status: 502, error: 'parse', finishReason: 'MAX_TOKENS', thoughtsTokens: 2000 }));
  });

  it('Gemini 를 부르기 직전마다 시작 줄 — 함수가 취소로 끝나 끝 줄이 없어도 부른 횟수를 셀 수 있게', async () => {
    succeed(ANALYSIS, { attempts: 2 });
    await post({}, { ...BODY, crush: { ...BODY.crush, notes: '헬스장에서 만난 사람' } });
    const starts = logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"log":"coach_api_start"'));
    expect(starts.map((l) => JSON.parse(l))).toEqual([
      { log: 'coach_api_start', mode: 'coach', model: 'gemini-3.5-flash', attempt: 1 },
      { log: 'coach_api_start', mode: 'coach', model: 'gemini-3.5-flash', attempt: 2 },
    ]);
    expect(starts.join('\n')).not.toContain('헬스장');
  });

  it('Google 원문 오류(없는 모델 404 등)는 화면에 보내지 않고 고정 안내로 — 로그에는 Google 상태 코드·이름만', async () => {
    const raw = 'models/gemini-3.6-flsh is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models.';
    gemini.mockImplementationOnce(async () => ({ ok: false, status: 404, code: 'server', message: raw, upstreamStatus: 404, upstreamError: 'NOT_FOUND', model: 'gemini-3.5-flash', attempts: 2 }));
    const res = await post();
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'AI 서버와 통신하지 못했어요. 잠시 후 다시 시도해주세요.' });
    expect(logLines(logSpy)[0]).toEqual(expect.objectContaining({ status: 502, error: 'server', upstreamStatus: 404, upstreamError: 'NOT_FOUND' }));
    expect(logSpy.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain('ListModels');
    // 우리가 쓴 안내(혼잡·한도·거절)는 그대로 간다
    gemini.mockImplementationOnce(async () => ({ ok: false, status: 503, code: 'server', message: 'AI 서버가 혼잡해요. 잠시 후 다시 시도해주세요.', upstreamStatus: 503 }));
    expect((await post()).body).toEqual({ error: 'AI 서버가 혼잡해요. 잠시 후 다시 시도해주세요.' });
    gemini.mockImplementationOnce(async () => ({ ok: false, status: 429, code: 'rate_limit', message: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.', upstreamStatus: 429 }));
    expect(await post()).toEqual(expect.objectContaining({ statusCode: 429, body: { error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' } }));
  });
});

describe('본문(JSON)은 인증·호출 제한을 지난 뒤에 읽는다', () => {
  /** 읽을 때마다 세고, 깨진 JSON 처럼 던지는 본문 (@vercel/node 의 req.body 는 읽는 순간 파싱한다) */
  function brokenBodyRequest(headers: Record<string, string>) {
    const seen = { reads: 0 };
    const req = { method: 'POST', headers, socket: {} };
    Object.defineProperty(req, 'body', {
      get() {
        seen.reads += 1;
        throw new Error('Invalid JSON');
      },
    });
    return { req: req as unknown as VercelRequest, seen };
  }

  it('깨진 JSON 은 400 과 로그 한 줄 (Vercel 기본 오류로 새지 않는다)', async () => {
    const { req, seen } = brokenBodyRequest({ 'x-forwarded-for': '10.8.0.1' });
    const res = fakeRes();
    await handler(req, res as unknown as VercelResponse);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '요청 형식이 올바르지 않아요.' });
    expect(seen.reads).toBe(1);
    expect(gemini).not.toHaveBeenCalled();
    expect(logLines(logSpy)).toEqual([expect.objectContaining({ status: 400, error: 'invalid_json', mode: 'coach' })]);
  });

  it('앱 토큰이 틀리면 본문을 읽지 않고 401', async () => {
    process.env.COACH_APP_TOKEN = 'app-token';
    const { req, seen } = brokenBodyRequest({ 'x-forwarded-for': '10.8.0.2', 'x-app-token': 'wrong' });
    const res = fakeRes();
    await handler(req, res as unknown as VercelResponse);
    expect(res.statusCode).toBe(401);
    expect(seen.reads).toBe(0);
  });

  it('호출 제한에 걸리면 본문을 읽지 않고 429 — 깨진 JSON 도 호출 제한에 센다', async () => {
    const headers = { 'x-forwarded-for': '10.8.0.3' };
    for (let i = 0; i < 60; i++) {
      const res = fakeRes();
      await handler(brokenBodyRequest(headers).req, res as unknown as VercelResponse);
      expect(res.statusCode).toBe(400);
    }
    const { req, seen } = brokenBodyRequest(headers);
    const res = fakeRes();
    await handler(req, res as unknown as VercelResponse);
    expect(res.statusCode).toBe(429);
    expect(seen.reads).toBe(0);
  });
});

describe('입력 길이 상한 (비용·남용 방지)', () => {
  const longText = (n: number) => '가'.repeat(n);
  /** 지금 앱이 보낼 수 있는 가장 큰 요청 — 입력창·폼 한도를 다 채우고, 동의 헤더가 없는 예전 앱처럼 */
  const maxedAppRequest = () => ({
    crush: {
      name: longText(20),
      gender: 'female',
      age: 26,
      mbti: 'ENFP',
      relationship: 'talking',
      style: ['답장 느림', '리액션 부자', '이모티콘 많이 씀', '집순이/집돌이', '맛집 탐방', '영화/드라마'],
      notes: longText(500),
      callName: longText(12),
      callNameFixed: true,
      speech: 'polite',
      speechFixed: false,
      goal: '동거·결혼 이야기',
      heat: 37,
    },
    user: { name: longText(20), gender: 'male', age: 28, mbti: 'ISTJ', style: ['낯가림', '적극적', '장난기 많음', '진지함', '리액션 좋음'], about: longText(300), vibes: ['다정한', '여유로운', '설레게 하는'], goal: '올해 안에 연애 시작', kkti: longText(40) },
    tone: 'flirty',
    emoji: 'on',
    // 입력창 800자 + 「다른 답장 더 보기」 안내 문장
    text: `${longText(800)} 이전에 제안한 답장과는 다른 각도의 새로운 답장 3개를 제안해주세요.`,
    // 폭 800px 캡처 (보통 0.2~0.35MB) — 넉넉하게 1.2MB
    image: { base64: 'A'.repeat(1_200_000), mediaType: 'image/jpeg' },
    history: Array.from({ length: 6 }, () => ({ userNote: longText(800), coachSummary: longText(400), chosenReply: longText(200) })),
  });

  it('예전 앱(동의 헤더 없음)이 지금 한도를 꽉 채워 보내도 그대로 통과한다', async () => {
    succeed(ANALYSIS);
    const res = await post({}, maxedAppRequest());
    expect(res.statusCode).toBe(200);
    expect(gemini).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['코칭 글 2,001자', (b: ReturnType<typeof maxedAppRequest>) => ({ ...b, text: longText(2001) })],
    ['상대 이름 101자', (b: ReturnType<typeof maxedAppRequest>) => ({ ...b, crush: { ...b.crush, name: longText(101) } })],
    ['상대 메모 2,001자', (b: ReturnType<typeof maxedAppRequest>) => ({ ...b, crush: { ...b.crush, notes: longText(2001) } })],
    ['태그 21개', (b: ReturnType<typeof maxedAppRequest>) => ({ ...b, crush: { ...b.crush, style: Array.from({ length: 21 }, (_, i) => `태그${i}`) } })],
    ['태그 하나가 41자', (b: ReturnType<typeof maxedAppRequest>) => ({ ...b, user: { ...b.user, style: [longText(41)] } })],
    ['MBTI 11자', (b: ReturnType<typeof maxedAppRequest>) => ({ ...b, user: { ...b.user, mbti: longText(11) } })],
    ['추구미 하나가 41자', (b: ReturnType<typeof maxedAppRequest>) => ({ ...b, user: { ...b.user, vibes: [longText(41)] } })],
    ['GIF 캡처', (b: ReturnType<typeof maxedAppRequest>) => ({ ...b, image: { base64: 'R0lGOD', mediaType: 'image/gif' } })],
    ['base64 가 아닌 캡처', (b: ReturnType<typeof maxedAppRequest>) => ({ ...b, image: { base64: '<script>', mediaType: 'image/png' } })],
  ])('%s → 400, AI 를 부르지 않는다', async (_label, mutate) => {
    const res = await post({}, mutate(maxedAppRequest()));
    expect(res.statusCode).toBe(400);
    expect(gemini).not.toHaveBeenCalled();
  });

  it('캡처가 상한(base64 4.2MB — Vercel 본문 한도 바로 아래)을 넘으면 413 과 앱이 그대로 보여 줄 안내', async () => {
    expect(MAX_IMAGE_BASE64_LENGTH).toBe(4_200_000);
    // 상한까지는 받는다 (예전에 Gemini 까지 가던 긴 스크롤 캡처가 새로 막히지 않게)
    succeed(ANALYSIS);
    const atLimit = await post({}, { ...BODY, image: { base64: 'A'.repeat(MAX_IMAGE_BASE64_LENGTH), mediaType: 'image/jpeg' } });
    expect(atLimit.statusCode).toBe(200);
    gemini.mockClear();
    const res = await post({}, { ...BODY, image: { base64: 'A'.repeat(MAX_IMAGE_BASE64_LENGTH + 4), mediaType: 'image/jpeg' } });
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: IMAGE_TOO_LARGE_MESSAGE });
    expect(gemini).not.toHaveBeenCalled();
    expect(logLines(logSpy)[1]).toEqual(expect.objectContaining({ status: 413, error: 'image_too_large' }));
  });

  it('본문이 content-length 로 상한보다 크면 JSON 을 읽지도 않고 413', async () => {
    let reads = 0;
    const req = { method: 'POST', headers: { 'x-forwarded-for': '10.9.0.1', 'content-length': String(MAX_BODY_BYTES + 1) }, socket: {} };
    Object.defineProperty(req, 'body', {
      get() {
        reads += 1;
        return BODY;
      },
    });
    const res = fakeRes();
    await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: IMAGE_TOO_LARGE_MESSAGE });
    expect(reads).toBe(0);
    expect(gemini).not.toHaveBeenCalled();
    expect(logLines(logSpy)[0]).toEqual(expect.objectContaining({ status: 413, error: 'body_too_large' }));
  });

  it('모든 칸을 서버 상한까지 채운 요청도 본문 상한(= Vercel 4.5MB) 안에 들어가고 통과한다', async () => {
    const tags = (n: number) => Array.from({ length: n }, () => longText(40));
    const schemaMax = {
      crush: { name: longText(100), gender: 'female', age: 26, mbti: longText(10), relationship: 'talking', style: tags(20), notes: longText(2000), callName: longText(20), callNameFixed: true, speech: 'polite', speechFixed: true, goal: longText(60), heat: 37 },
      user: { name: longText(100), gender: 'male', age: 28, mbti: longText(10), style: tags(20), about: longText(300), vibes: tags(5), goal: longText(60), kkti: longText(40) },
      tone: 'flirty',
      emoji: 'on',
      text: longText(2000),
      image: { base64: 'A'.repeat(MAX_IMAGE_BASE64_LENGTH), mediaType: 'image/jpeg' },
      history: Array.from({ length: 8 }, () => ({ userNote: longText(1000), coachSummary: longText(1000), chosenReply: longText(500), replies: Array.from({ length: 3 }, () => longText(300)), insights: Array.from({ length: 5 }, () => longText(200)) })),
      earlierNotes: Array.from({ length: 12 }, () => longText(200)),
      toneChosen: true,
      emojiChosen: true,
    };
    const bytes = Buffer.byteLength(JSON.stringify(schemaMax));
    expect(bytes).toBeLessThan(MAX_BODY_BYTES);
    expect(bytes - MAX_IMAGE_BASE64_LENGTH).toBeLessThan(150_000);
    succeed(ANALYSIS);
    expect((await post({ 'content-length': String(bytes) }, schemaMax)).statusCode).toBe(200);
  });

  it('원소가 아주 많은 배열은 zod 를 거치지 않고 바로 400 (메모리·시간을 쓰지 않는다)', async () => {
    const started = Date.now();
    const res = await post({}, { ...BODY, crush: { ...BODY.crush, style: new Array(1_000_000).fill(0) } });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(res.statusCode).toBe(400);
    // zod 가 원소마다 만들었을 이슈 100만 개가 아니라, 미리 훑어본 이슈 하나
    expect((res.body as { issues: unknown[] }).issues).toEqual([expect.objectContaining({ code: 'too_big', path: ['crush', 'style'], maximum: MAX_REQUEST_ARRAY_LENGTH })]);
    expect(gemini).not.toHaveBeenCalled();
    // 안쪽 배열도 본다 (보고서 기록의 포인트 목록)
    const report = await post({}, {
      mode: 'report',
      crush: BODY.crush,
      user: BODY.user,
      sessions: [{ at: 1, summary: '요약', insights: new Array(10_000).fill(''), temperature: 'warm' }],
    });
    expect(report.statusCode).toBe(400);
    expect((report.body as { issues: { path: unknown[] }[] }).issues[0].path).toEqual(['sessions', 0, 'insights']);
    expect(gemini).not.toHaveBeenCalled();
  });

  it('지난 기록 칸은 넘으면 잘라서 받는다 (거절하면 그 채팅방이 계속 막히므로) — 앱 값보다 조금 큰 1,000·1,000·500자', async () => {
    succeed(ANALYSIS);
    const res = await post({}, { ...BODY, history: [{ userNote: longText(5000), coachSummary: `${longText(999)}끝${longText(100)}`, chosenReply: longText(3000) }] });
    expect(res.statusCode).toBe(200);
    const task = gemini.mock.calls[0][0];
    expect(task.context).toContain(`사용자: ${longText(1000)} / 코치: ${longText(999)}끝 / 사용자가 보낸 답장: "${longText(500)}"`);
    expect(task.context).not.toContain(longText(1001));
  });

  it('보고서·속마음·연습의 태그·MBTI 도 상한이 있다', async () => {
    const mind = await post({}, { mode: 'mind', situation: '읽고 답이 없어요', perspective: 'male', user: { gender: 'female', mbti: longText(11) } });
    expect(mind.statusCode).toBe(400);
    const practice = await post({}, {
      mode: 'practice',
      persona: { name: '민지', gender: 'female', age: 28, mbti: 'ENFP', job: '마케터', style: [longText(41)], relationship: 'blind_date', scenario: '', speech: 'polite', difficulty: 2 },
      user: { name: '지훈', gender: 'male', style: [] },
      heat: 0,
      turns: [{ role: 'me', text: '안녕하세요' }],
    });
    expect(practice.statusCode).toBe(400);
    expect(gemini).not.toHaveBeenCalled();
  });
});

describe('모드별 비용 스위치 (서버 환경변수)', () => {
  const MIND_BODY = { mode: 'mind', situation: '읽고 답이 없어요', perspective: 'male' };

  it('하나도 없으면 지금 그대로 — 모든 모드가 gemini-3.5-flash · 생각 low · temperature 보냄 · 대체 모델도 그대로', async () => {
    await post();
    await post({}, MIND_BODY);
    for (const call of gemini.mock.calls) {
      expect(call[2]).toEqual(expect.objectContaining({ model: 'gemini-3.5-flash', thinkingLevel: 'low', omitTemperature: false, fallbackModels: GEMINI_FALLBACK_MODELS }));
    }
  });

  it('GEMINI_MODEL 은 코칭·보고서, GEMINI_MODEL_LIGHT 는 속마음·연습, 생각 수준은 모드마다', async () => {
    Object.assign(process.env, { GEMINI_MODEL: 'gemini-3.6-flash', GEMINI_MODEL_LIGHT: 'gemini-3.5-flash-lite', GEMINI_THINKING_MIND: 'minimal', GEMINI_OMIT_TEMPERATURE: '1' });
    await post();
    await post({}, MIND_BODY);
    expect(gemini.mock.calls[0][2]).toEqual(expect.objectContaining({ model: 'gemini-3.6-flash', thinkingLevel: 'low', omitTemperature: true }));
    expect(gemini.mock.calls[1][2]).toEqual(expect.objectContaining({ model: 'gemini-3.5-flash-lite', thinkingLevel: 'minimal', omitTemperature: true }));
    // 속마음이 혼잡하면 넘어갈 곳은 운영자가 고른 GEMINI_MODEL (기본 gemini-3.5-flash 가 아니라)
    const mind = gemini.mock.calls[1][2] as CallGeminiOptions;
    expect(mind.fallbackModels?.find((m) => m !== mind.model)).toBe('gemini-3.6-flash');
  });

  it('잘못된 값은 무시하고 기본값을 쓰며 경고를 남긴다', async () => {
    Object.assign(process.env, { GEMINI_MODEL: 'models/../../evil', GEMINI_THINKING_COACH: 'turbo' });
    await post();
    expect(gemini.mock.calls[0][2]).toEqual(expect.objectContaining({ model: 'gemini-3.5-flash', thinkingLevel: 'low' }));
    expect(warnSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('GEMINI_THINKING_COACH');
  });
});

describe('끊기거나 너무 오래 걸리면 기다리지 않는다', () => {
  /** 신호가 끊길 때까지 기다리는 Gemini 흉내 */
  function hangUntilAborted() {
    let seen: AbortSignal | undefined;
    gemini.mockImplementationOnce(
      (_task, _key, options?: CallGeminiOptions) =>
        new Promise((_resolve, reject) => {
          seen = options?.signal;
          options?.onAttempt?.('gemini-3.5-flash', 1);
          options?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    );
    return () => seen;
  }

  it('앱이 연결을 끊으면 Gemini 기다리기를 멈추고 끝낸다 (로그 499)', async () => {
    const signal = hangUntilAborted();
    const res = fakeRes();
    const done = post({}, BODY, res);
    await new Promise((r) => setImmediate(r));
    expect(signal()?.aborted).toBe(false);
    res.emit('close');
    await done;
    expect(signal()?.aborted).toBe(true);
    expect(logLines(logSpy)[0]).toEqual(expect.objectContaining({ status: 499, error: 'client_closed', attempts: 1 }));
  });

  it('응답을 다 보낸 뒤 연결이 닫히는 건 끊김이 아니다', async () => {
    succeed(ANALYSIS);
    const res = fakeRes();
    await post({}, BODY, res);
    res.emit('close');
    expect(res.statusCode).toBe(200);
    expect(logLines(logSpy)[0]).toEqual(expect.objectContaining({ status: 200 }));
  });

  it('Vercel 요청의 aborted 오류도 Gemini 취소로 전달하고 이벤트를 정리한다', async () => {
    const signal = hangUntilAborted();
    const req = Object.assign(new EventEmitter(), { method: 'POST', headers: { 'x-forwarded-for': '10.8.0.1' }, body: BODY, socket: {} });
    const res = fakeRes();
    const done = handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
    await new Promise((resolve) => setImmediate(resolve));
    req.emit('error', new Error('aborted'));
    await done;
    expect(signal()?.aborted).toBe(true);
    expect(res.statusCode).toBe(499);
    expect(req.listenerCount('error')).toBe(0);
    expect(req.listenerCount('aborted')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });

  describe('서버 시한', () => {
    beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] }));
    afterEach(() => jest.useRealTimers());

    it(`${SERVER_DEADLINE_MS / 1000}초(함수 한도 120초·앱 90초보다 짧게)가 지나면 멈추고 504 안내`, async () => {
      expect(SERVER_DEADLINE_MS).toBeLessThan(90_000);
      const signal = hangUntilAborted();
      const res = fakeRes();
      const done = post({}, BODY, res);
      await jest.advanceTimersByTimeAsync(SERVER_DEADLINE_MS - 1);
      expect(signal()?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await done;
      expect(signal()?.aborted).toBe(true);
      expect(res.statusCode).toBe(504);
      expect(res.body).toEqual({ error: '답을 만드는 데 너무 오래 걸려요. 잠시 후 다시 시도해주세요.' });
      expect(logLines(logSpy)[0]).toEqual(expect.objectContaining({ status: 504, error: 'deadline' }));
    });
  });
});
