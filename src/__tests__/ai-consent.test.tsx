import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react';
import { create } from 'react-test-renderer';

import { useAiAction } from '@/hooks/use-ai-action';
import { useCoach } from '@/hooks/use-coach';
import { ensureAiConsent, setAiConsentPrompter, withdrawAiConsent, type AiRoute } from '@/lib/ai-consent';
import { CoachError, requestAi, requestCoaching } from '@/lib/coach-client';
import { APP_CONFIG } from '@/lib/config';
import { useAppStore, type AppState } from '@/store/app-store';

// 테스트 환경에는 기기 저장소 네이티브 모듈이 없어 메모리로 대신한다 (jest.mock 은 import 보다 먼저 실행되도록 끌어올려진다)
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});
// 스토어 빌드처럼 중계 서버 주소가 있는 상태. 개인 키 모드는 테스트 안에서 apiUrl 을 비워 본다
jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://coach.test', apiSameOrigin: false, apiToken: '', supportEmail: '', privacyUrl: '', termsUrl: '' },
}));
// 캡처 인코딩은 네이티브 이미지 모듈이 필요해서 고정값으로
jest.mock('@/lib/images', () => ({ encodeForModel: jest.fn(async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' })) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const ANALYSIS = { summary: '좋은 분위기예요', temperature: 'warm', interestScore: 60, insights: [], replies: [{ tone: 'natural', text: '나도 좋아!', why: '' }], nextStep: '', warnings: [] };
const MIND = {
  headline: '바빴을 가능성이 커요',
  innerVoice: '답장해야 하는데',
  possibilities: [
    { label: '진짜 바빴음', percent: 60, reason: '' },
    { label: '고민 중', percent: 40, reason: '' },
  ],
  advice: '',
  sampleReply: '',
};

/** 중계 서버 흉내 — 요청 본문의 mode 에 맞는 결과를 돌려준다 */
const fetchMock = jest.fn(async (_url: string, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? '{}') as { mode?: string };
  const json = body.mode === 'mind' ? { mode: 'mind', result: MIND } : { analysis: ANALYSIS };
  return { ok: true, status: 200, json: async () => json } as unknown as Response;
});
/** 동의 시트 대신 — 테스트마다 답을 정한다 */
const ask = jest.fn<Promise<boolean>, [AiRoute]>();

const coachInput = () => ({
  crush: { name: '민지', gender: 'female' as const, relationship: 'talking' as const, style: [], notes: '' },
  user: { name: '지훈', gender: 'male' as const, style: [] },
  tone: 'natural' as const,
  text: '주말에 만나자고 하고 싶어',
});
const mindInput = { situation: '읽고 답이 없어요', perspective: 'male' as const };
const RELAY: AiRoute = { provider: 'google', via: 'relay' };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** 훅을 화면 없이 띄워 최신 값을 읽는다 */
function mountHook<T>(hook: () => T): () => T {
  const ref: { current: T | null } = { current: null };
  function Probe() {
    ref.current = hook();
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return () => ref.current as T;
}

beforeAll(() => {
  // 요청마다 거는 90초 시간 제한 타이머가 테스트 뒤에 남지 않도록 가짜 타이머로 (프로미스·setImmediate 는 진짜 그대로)
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  APP_CONFIG.apiUrl = 'https://coach.test';
  fetchMock.mockClear();
  ask.mockReset();
  setAiConsentPrompter(ask);
  useAppStore.getState().resetAll();
  useAppStore.setState({ hydrated: true });
});
afterEach(() => jest.clearAllTimers());

describe('AI 분석 동의 관문', () => {
  it('처음이면 동의 시트를 띄우고, 동의하면 그대로 보낸다', async () => {
    ask.mockResolvedValue(true);
    const analysis = await requestCoaching(coachInput());
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(RELAY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://coach.test/api/coach');
    expect(analysis.summary).toBe('좋은 분위기예요');
    const s = useAppStore.getState();
    expect(s.aiConsent).toBe(true);
    expect(s.aiConsentProvider).toBe('google');
    expect(typeof s.aiConsentAt).toBe('number');
  });

  it('동의 안 함이면 아무것도 보내지 않고, 화면에 보일 안내로 끝낸다', async () => {
    ask.mockResolvedValue(false);
    const error = await requestCoaching(coachInput()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CoachError);
    expect(error).toEqual(expect.objectContaining({ code: 'consent', message: 'AI 분석에 동의해야 답장을 만들 수 있어요.' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().aiConsent).toBe(false);
  });

  it('한 번 동의하면 다시 묻지 않는다', async () => {
    ask.mockResolvedValue(true);
    await requestCoaching(coachInput());
    await requestAi('mind', mindInput);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('철회하면 다음 AI 요청에서 다시 묻는다', async () => {
    ask.mockResolvedValue(true);
    await requestCoaching(coachInput());
    withdrawAiConsent();
    expect(useAppStore.getState().aiConsent).toBe(false);
    ask.mockResolvedValue(false);
    await expect(requestAi('mind', mindInput)).rejects.toMatchObject({ code: 'consent', message: 'AI 분석에 동의해야 속마음을 풀어 드릴 수 있어요.' });
    expect(ask).toHaveBeenCalledTimes(2);
    // 철회 뒤 요청은 나가지 않았다 (첫 요청 한 번뿐)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('동의 안 함 뒤에도 다시 쓰면 다시 묻고, 그때 동의하면 보낸다', async () => {
    ask.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(requestCoaching(coachInput())).rejects.toMatchObject({ code: 'consent' });
    await expect(requestCoaching(coachInput())).resolves.toEqual(expect.objectContaining({ summary: '좋은 분위기예요' }));
    expect(ask).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('동시에 들어온 요청은 시트 하나의 답을 같이 기다린다', async () => {
    let answer: (agreed: boolean) => void = () => {};
    ask.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    const coach = requestCoaching(coachInput());
    const mind = requestAi('mind', mindInput);
    await flush();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    answer(true);
    await expect(coach).resolves.toEqual(expect.objectContaining({ summary: '좋은 분위기예요' }));
    await expect(mind).resolves.toEqual(expect.objectContaining({ headline: '바빴을 가능성이 커요' }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('같이 기다리던 요청은 동의 안 함이면 모두 보내지 않는다', async () => {
    let answer: (agreed: boolean) => void = () => {};
    ask.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    const first = requestCoaching(coachInput()).catch((e: CoachError) => e.code);
    const second = requestCoaching(coachInput()).catch((e: CoachError) => e.code);
    await flush();
    answer(false);
    expect(await Promise.all([first, second])).toEqual(['consent', 'consent']);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('개인 키로 다른 회사(Anthropic)에 보내게 되면 그 회사로 다시 묻는다', async () => {
    ask.mockResolvedValue(true);
    await requestCoaching(coachInput());
    // 서버 주소가 없는 빌드 → 개인 키로 기기에서 바로 보낸다
    APP_CONFIG.apiUrl = '';
    ask.mockResolvedValue(false);
    await expect(requestCoaching(coachInput(), { directApiKey: 'sk-ant-test' })).rejects.toMatchObject({ code: 'consent' });
    expect(ask).toHaveBeenLastCalledWith({ provider: 'anthropic', via: 'direct' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('연결된 AI 가 없으면 묻지도 보내지도 않는다', async () => {
    APP_CONFIG.apiUrl = '';
    await expect(requestCoaching(coachInput())).rejects.toMatchObject({ code: 'not_configured' });
    expect(ask).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('동의 시트가 아직 없으면(화면 준비 전) 보내지 않는다', async () => {
    setAiConsentPrompter(null);
    await expect(requestCoaching(coachInput())).rejects.toMatchObject({ code: 'consent' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('저장된 동의를 다 읽은 뒤에 판단한다', async () => {
    useAppStore.setState({ hydrated: false });
    ask.mockResolvedValue(true);
    const done = ensureAiConsent(RELAY);
    await flush();
    expect(ask).not.toHaveBeenCalled();
    // 기기에서 읽어 온 값이 이미 동의였다면 묻지 않는다
    useAppStore.setState({ hydrated: true, aiConsent: true, aiConsentProvider: 'google', aiConsentAt: 1 });
    await expect(done).resolves.toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('동의 시트가 떠도 고른 캡처와 무료 횟수는 그대로', () => {
  const capture = { uri: 'file:///capture.jpg', width: 1080, height: 1920 };

  it('동의 안 함: 캡처는 채팅에 남고, 안내 오류만 보이고, 횟수는 차감되지 않는다', async () => {
    ask.mockResolvedValue(false);
    const crushId = useAppStore.getState().quickStart();
    const usage = useAppStore.getState().usage;
    const wallet = useAppStore.getState().wallet;
    const coach = mountHook(useCoach);
    let result: string | undefined;
    await act(async () => {
      result = await coach().send({ crushId, image: capture, text: '', tone: 'natural' });
    });
    expect(result).toBe('sent');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().usage).toEqual(usage);
    expect(useAppStore.getState().wallet).toEqual(wallet);
    const [mine, reply] = useAppStore.getState().messages[crushId];
    expect(mine).toEqual(expect.objectContaining({ role: 'user', imageUri: capture.uri }));
    expect(reply).toEqual(expect.objectContaining({ role: 'coach', pending: false, error: 'AI 분석에 동의해야 답장을 만들 수 있어요.', text: 'consent' }));
  });

  it('동의하면 고른 캡처 그대로 분석이 이어지고, 그때 한 번만 차감된다', async () => {
    ask.mockResolvedValue(true);
    const crushId = useAppStore.getState().quickStart();
    const before = useAppStore.getState().usage.total;
    const coach = mountHook(useCoach);
    await act(async () => {
      await coach().send({ crushId, image: capture, text: '', tone: 'natural' });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { image?: unknown };
    expect(sent.image).toEqual({ base64: 'QUJD', mediaType: 'image/jpeg' });
    expect(useAppStore.getState().usage.total).toBe(before + 1);
    const reply = useAppStore.getState().messages[crushId][1];
    expect(reply.analysis?.summary).toBe('좋은 분위기예요');
  });

  it('보고서·속마음·연습도 동의 안 함이면 차감 없이 안내만 보인다', async () => {
    ask.mockResolvedValue(false);
    const usage = useAppStore.getState().usage;
    const action = mountHook(useAiAction);
    let result: unknown;
    await act(async () => {
      result = await action().run('mind', (o) => requestAi('mind', mindInput, o), { reason: 'mind' });
    });
    expect(result).toBeNull();
    expect(action().error).toBe('AI 분석에 동의해야 속마음을 풀어 드릴 수 있어요.');
    expect(useAppStore.getState().usage).toEqual(usage);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AI 분석 동의 저장', () => {
  const KEY = 'mylovecoach.store.v1';

  it('예전 버전 저장값(동의 기록 없음)은 「아직 묻지 않음」으로 읽고, 다른 기록은 그대로 둔다', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ version: 1, state: { deviceId: 'd_old', analyticsConsent: true, usage: { total: 2, day: '2026-10-05', dayCount: 0 } } }));
    await useAppStore.persist.rehydrate();
    const s = useAppStore.getState();
    expect(s.aiConsent).toBeNull();
    expect(s.aiConsentProvider).toBeNull();
    expect(s.aiConsentAt).toBeNull();
    expect(s.deviceId).toBe('d_old');
    expect(s.analyticsConsent).toBe(true);
    expect(s.usage.total).toBe(2);
  });

  it('알 수 없는 값은 동의로 보지 않는다', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ version: 1, state: { aiConsent: true, aiConsentProvider: 'someone', aiConsentAt: 'yesterday' } }));
    await useAppStore.persist.rehydrate();
    const s = useAppStore.getState();
    expect([s.aiConsent, s.aiConsentProvider, s.aiConsentAt]).toEqual([null, null, null]);
  });

  it('동의 기록은 기기에 저장되고, 「모든 데이터 삭제」면 처음 상태로 돌아간다', () => {
    useAppStore.getState().setAiConsent('google');
    const saved = useAppStore.persist.getOptions().partialize?.(useAppStore.getState()) as Partial<AppState>;
    expect(saved).toEqual(expect.objectContaining({ aiConsent: true, aiConsentProvider: 'google' }));
    useAppStore.getState().resetAll();
    expect(useAppStore.getState().aiConsent).toBeNull();
  });
});
