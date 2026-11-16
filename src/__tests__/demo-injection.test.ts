// 데모 빌드의 「실제 AI 결과 주입」 — 앱 사용 영상 녹화(tools/social-make/record-app.mjs)가 쓰는 길
import { CoachRequestSchema } from '@/lib/coach-schema';
import { demoAnalysis, type DemoInjection } from '@/lib/demo';

const req = CoachRequestSchema.parse({
  crush: { name: '민준', gender: 'male', relationship: 'talking', style: [], notes: '', heat: 0 },
  user: { name: '', gender: 'female', style: [] },
  tone: 'natural',
  emoji: 'on',
  text: '민준: 주말에 뭐해?',
});

const real = {
  callName: ' "민준아" ',
  speechLevel: 'casual',
  summary: '먼저 주말 계획을 물어본 건 좋은 신호예요.',
  temperature: 'warm',
  interestScore: 72.4,
  heatDelta: 30,
  insights: ['먼저 물어봤어요.', ' '],
  replies: [
    { tone: 'natural', text: '아직 계획 없어! 너는?', why: '질문을 돌려줘요.', expectedReaction: '그럼 토요일에 밥 먹을래?', successRate: 120 },
    { tone: 'witty', text: '  ', why: '빈 답장은 빠져요.', expectedReaction: '', successRate: 50 },
  ],
  nextStep: '시간을 정해요.',
  warnings: [],
  memory: ['민준이 주말 계획을 물어봄'],
};

const holder = globalThis as { __SENDIT_DEMO__?: DemoInjection };

describe('demoAnalysis', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    delete holder.__SENDIT_DEMO__;
    jest.useRealTimers();
  });

  const run = async () => {
    const p = demoAnalysis(req);
    await jest.advanceTimersByTimeAsync(10_000);
    return p;
  };

  it('넣어 둔 값이 없으면 데모 샘플을 돌려준다', async () => {
    const a = await run();
    expect(a.summary).toContain('데모 샘플');
  });

  it('넣어 둔 실제 결과를 서버 응답처럼 정리해 돌려주고, 앱이 만든 요청을 남긴다', async () => {
    holder.__SENDIT_DEMO__ = { analysis: real, waitMs: 1500 };
    const a = await run();
    expect(a.summary).toBe(real.summary);
    expect(JSON.stringify(a)).not.toContain('데모');
    expect(a.callName).toBe('민준아');
    expect(a.interestScore).toBe(72);
    expect(a.heatDelta).toBe(20);
    expect(a.replies).toHaveLength(1);
    expect(a.replies[0]).toMatchObject({ text: '아직 계획 없어! 너는?', successRate: 99, expectedReaction: '그럼 토요일에 밥 먹을래?' });
    expect(holder.__SENDIT_DEMO__.request?.text).toBe('민준: 주말에 뭐해?');
    expect(holder.__SENDIT_DEMO__.request?.crush.name).toBe('민준');
  });

  it('기다리는 시간은 진짜처럼 — 기본 2초', async () => {
    holder.__SENDIT_DEMO__ = { analysis: real };
    let done = false;
    const p = demoAnalysis(req).then(() => (done = true));
    await jest.advanceTimersByTimeAsync(1900);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(200);
    await p;
    expect(done).toBe(true);
  });

  it('형식이 틀리면 샘플로 넘어가지 않고 실패한다', async () => {
    holder.__SENDIT_DEMO__ = { analysis: { summary: '반쪽짜리' } };
    const p = demoAnalysis(req);
    const caught = p.catch((e: Error) => e);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await caught).toBeInstanceOf(Error);
  });
});
