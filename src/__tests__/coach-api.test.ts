import { EventEmitter } from 'node:events';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import handler, { SERVER_DEADLINE_MS } from '../../api/coach';
import { IMAGE_TOO_LARGE_MESSAGE, MAX_IMAGE_BASE64_LENGTH } from '@/lib/coach-schema';
import { callGeminiTask, type CallGeminiOptions } from '@/lib/gemini';

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

  it('캡처가 상한(base64 2.5MB)을 넘으면 413 과 앱이 그대로 보여 줄 안내', async () => {
    const res = await post({}, { ...BODY, image: { base64: 'A'.repeat(MAX_IMAGE_BASE64_LENGTH + 4), mediaType: 'image/jpeg' } });
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: IMAGE_TOO_LARGE_MESSAGE });
    expect(gemini).not.toHaveBeenCalled();
    expect(logLines(logSpy)[0]).toEqual(expect.objectContaining({ status: 413, error: 'image_too_large' }));
  });

  it('지난 기록 칸은 넘으면 잘라서 받는다 (거절하면 그 채팅방이 계속 막히므로)', async () => {
    succeed(ANALYSIS);
    const res = await post({}, { ...BODY, history: [{ userNote: longText(5000), coachSummary: `${longText(1999)}끝${longText(100)}`, chosenReply: longText(3000) }] });
    expect(res.statusCode).toBe(200);
    const task = gemini.mock.calls[0][0];
    expect(task.context).toContain(`사용자: ${longText(2000)} / 코치: ${longText(1999)}끝 / 사용자가 보낸 답장: "${longText(1000)}"`);
    expect(task.context).not.toContain(longText(2001));
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

  it('하나도 없으면 지금 그대로 — 모든 모드가 gemini-3.5-flash · 생각 low · temperature 보냄', async () => {
    await post();
    await post({}, MIND_BODY);
    for (const call of gemini.mock.calls) expect(call[2]).toEqual(expect.objectContaining({ model: 'gemini-3.5-flash', thinkingLevel: 'low', omitTemperature: false }));
  });

  it('GEMINI_MODEL 은 코칭·보고서, GEMINI_MODEL_LIGHT 는 속마음·연습, 생각 수준은 모드마다', async () => {
    Object.assign(process.env, { GEMINI_MODEL: 'gemini-3.6-flash', GEMINI_MODEL_LIGHT: 'gemini-3.5-flash-lite', GEMINI_THINKING_MIND: 'minimal', GEMINI_OMIT_TEMPERATURE: '1' });
    await post();
    await post({}, MIND_BODY);
    expect(gemini.mock.calls[0][2]).toEqual(expect.objectContaining({ model: 'gemini-3.6-flash', thinkingLevel: 'low', omitTemperature: true }));
    expect(gemini.mock.calls[1][2]).toEqual(expect.objectContaining({ model: 'gemini-3.5-flash-lite', thinkingLevel: 'minimal', omitTemperature: true }));
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
