import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { useCoach } from '@/hooks/use-coach';
import { useMindReading } from '@/hooks/use-mind-reading';
import { setAiConsentPrompter, withdrawAiConsent, type AiRoute } from '@/lib/ai-consent';
import { currentQuota } from '@/lib/billing/gate';
import { EMPTY_USAGE, EMPTY_WALLET } from '@/lib/billing/quota';
import { CoachError, requestCoaching } from '@/lib/coach-client';
import { IMAGE_TOO_LARGE_MESSAGE, MAX_IMAGE_BASE64_LENGTH } from '@/lib/coach-schema';
import { encodeForModel, modelResizeWidth } from '@/lib/images';
import type { ChatMessage, CoachAnalysis, Gender, MindReading } from '@/lib/types';
import { hasNewSessionsSince, mindCacheKey, useAppStore } from '@/store/app-store';

// 테스트 환경에는 기기 저장소 네이티브 모듈이 없어 메모리로 대신한다
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
// 스토어 빌드처럼 중계 서버 주소가 있는 상태 (무료 횟수도 센다)
jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://coach.test', apiSameOrigin: false, apiToken: '', supportEmail: '', privacyUrl: '', termsUrl: '' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));
jest.mock('expo-image-picker', () => ({}));
/**
 * 이미지 조작 흉내 — 파일 이름의 w숫자가 원본 폭. resize 를 부르면 그 폭으로 바뀐다.
 * 저장한 base64 에는 저장한 폭을 적는다 (huge 가 든 파일은 상한보다 큰 캡처)
 */
jest.mock('expo-image-manipulator', () => {
  const makeRef = (uri: string, width: number) => ({
    width,
    height: width * 2,
    release: jest.fn(),
    saveAsync: jest.fn(async () => ({
      uri,
      width,
      height: width * 2,
      base64: uri.includes('huge') ? 'A'.repeat(jest.requireActual('@/lib/coach-schema').MAX_IMAGE_BASE64_LENGTH + 4) : `QjY0${width}`,
    })),
  });
  return {
    __esModule: true,
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    ImageManipulator: {
      manipulate: jest.fn((uri: string) => {
        let width = Number(/w(\d+)/.exec(uri)?.[1] ?? 0);
        const context: { resize: jest.Mock; renderAsync: jest.Mock } = {
          resize: jest.fn((size: { width: number }) => {
            width = size.width;
            return context;
          }),
          renderAsync: jest.fn(async () => makeRef(uri, width)),
        };
        return context;
      }),
    },
  };
});

const MIND: MindReading = {
  headline: '바빴을 가능성이 커요',
  innerVoice: '답장해야 하는데',
  possibilities: [
    { label: '진짜 바빴음', percent: 60, reason: '' },
    { label: '고민 중', percent: 40, reason: '' },
  ],
  advice: '',
  sampleReply: '',
};
let mindReplies = 0;
/** 중계 서버 흉내 — 속마음은 부를 때마다 조금 다른 결과 */
const fetchMock = jest.fn(async (_url: string, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? '{}') as { mode?: string };
  mindReplies += 1;
  const json = body.mode === 'mind' ? { mode: 'mind', result: { ...MIND, headline: `${MIND.headline} #${mindReplies}` } } : { analysis: { summary: 's', temperature: 'warm', interestScore: 60, insights: [], replies: [], nextStep: '', warnings: [] } };
  return { ok: true, status: 200, json: async () => json } as unknown as Response;
});
const ask = jest.fn<Promise<boolean>, [AiRoute]>();
const SITUATION = '남자가 "뭐해?"라고만 보내고 2시간째 답이 없어요.';

/** 띄운 훅들 — 테스트가 끝나면 내린다 (저장소가 바뀔 때 지난 테스트의 훅이 다시 그려지지 않게) */
const mounted: ReactTestRenderer[] = [];

/** 훅을 화면 없이 띄워 최신 값을 읽는다 */
function mountHook<T>(hook: () => T): () => T {
  const ref: { current: T | null } = { current: null };
  function Probe() {
    ref.current = hook();
    return null;
  }
  act(() => {
    mounted.push(create(<Probe />));
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
  fetchMock.mockClear();
  mindReplies = 0;
  ask.mockReset();
  ask.mockResolvedValue(true);
  setAiConsentPrompter(ask);
  useAppStore.getState().resetAll();
  // 무료 횟수는 「모든 데이터 삭제」로 지워지지 않아서 테스트마다 처음 상태로 + 넉넉한 횟수권
  useAppStore.setState({ hydrated: true, usage: EMPTY_USAGE, wallet: { ...EMPTY_WALLET, credits: 10 } });
  useAppStore.getState().setUser({ name: '하늘', gender: 'female', age: 26, mbti: 'ENFP', style: [], defaultTone: 'natural', createdAt: 0 });
});
afterEach(() => {
  act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  jest.clearAllTimers();
});

describe('속마음 풀이 재사용', () => {
  const open = (situation = SITUATION, perspective: Gender = 'male') => mountHook(() => useMindReading(situation, perspective));
  const askOnce = async (hook: ReturnType<typeof open>, force = false) => {
    let outcome: unknown;
    await act(async () => {
      outcome = await hook().ask(force);
    });
    return outcome;
  };

  it('같은 카드를 다시 열면 AI 를 부르지 않고 저장된 풀이를 보여 준다 (횟수 그대로)', async () => {
    const left = currentQuota().remaining;
    const first = open();
    expect(await askOnce(first)).toBe('fresh');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(currentQuota().remaining).toBe(left - 1);

    const again = open();
    expect(await askOnce(again)).toBe('reused');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(currentQuota().remaining).toBe(left - 1);
    expect(again().reused).toBe(true);
    expect(again().reading?.headline).toBe(`${MIND.headline} #1`);
    // 「최근에 본 속마음」에는 한 번만
    expect(useAppStore.getState().mindHistory).toHaveLength(1);
  });

  it('아무것도 보내지 않으니 AI 분석 동의를 철회했어도 저장된 풀이는 그대로 보인다', async () => {
    await askOnce(open());
    withdrawAiConsent();
    ask.mockClear();
    expect(await askOnce(open())).toBe('reused');
    expect(ask).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('대상 성별·상황·내 프로필(성별·나이·MBTI)이 다르면 새로 푼다', async () => {
    await askOnce(open());
    await askOnce(open(SITUATION, 'female'));
    await askOnce(open('여자가 답장을 다음 날 아침에야 보냈어요.'));
    act(() => {
      useAppStore.getState().updateUser({ mbti: 'INTJ' });
    });
    await askOnce(open());
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // 프로필 이름처럼 AI 에 보내지 않는 값은 키에 들어가지 않는다
    act(() => {
      useAppStore.getState().updateUser({ name: '다른 별명' });
    });
    expect(await askOnce(open())).toBe('reused');
  });

  it('「다시 풀이」는 저장된 풀이를 건너뛰고 새로 부르고(1회 차감), 그 결과로 바꿔 둔다', async () => {
    const left = currentQuota().remaining;
    await askOnce(open());
    const hook = open();
    expect(await askOnce(hook)).toBe('reused');
    expect(currentQuota().remaining).toBe(left - 1);
    expect(await askOnce(hook, true)).toBe('fresh');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(currentQuota().remaining).toBe(left - 2);
    expect(hook().reused).toBe(false);
    expect(hook().reading?.headline).toBe(`${MIND.headline} #2`);
    // 다음에 열면 새 풀이가 나온다
    const later = open();
    await askOnce(later);
    expect(later().reading?.headline).toBe(`${MIND.headline} #2`);
    expect(useAppStore.getState().mindHistory).toHaveLength(1);
  });

  it('저장된 풀이는 30일이 지나면 쓰지 않고, 60개까지만 둔다', () => {
    const now = Date.now();
    const s = useAppStore.getState();
    const key = mindCacheKey({ situation: SITUATION, perspective: 'male', user: { gender: 'female', age: 26, mbti: 'ENFP' } });
    s.putCachedMind(key, MIND);
    expect(useAppStore.getState().getCachedMind(key)).toEqual(MIND);
    jest.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(useAppStore.getState().getCachedMind(key)).toBeNull();
    for (let i = 0; i < 70; i++) s.putCachedMind(`k${i}`, MIND);
    expect(Object.keys(useAppStore.getState().mindCache)).toHaveLength(60);
    // 기기에 저장되고, 「모든 데이터 삭제」면 지워진다
    const saved = useAppStore.persist.getOptions().partialize?.(useAppStore.getState()) as { mindCache?: object };
    expect(Object.keys(saved.mindCache ?? {})).toHaveLength(60);
    s.resetAll();
    expect(useAppStore.getState().mindCache).toEqual({});
    jest.setSystemTime(now);
  });
});

describe('보고서 「다시 분석하기」', () => {
  const analysis: CoachAnalysis = { summary: 's', temperature: 'warm', interestScore: 60, insights: [], replies: [], nextStep: '', warnings: [] };
  const msg = (createdAt: number, withAnalysis = true): ChatMessage => ({ id: `m${createdAt}`, crushId: 'c', role: 'coach', createdAt, ...(withAnalysis ? { analysis } : {}) });

  it('첫 보고서는 언제나 만들 수 있다', () => {
    expect(hasNewSessionsSince(undefined, [])).toBe(true);
  });

  it('마지막 보고서 뒤로 새 코칭 기록이 없으면 막는다', () => {
    const report = { at: 1_000, basedOn: 2 };
    expect(hasNewSessionsSince(report, [msg(100), msg(200)])).toBe(false);
    // 분석이 없는 말풍선(실패·분석 중)은 새 기록이 아니다
    expect(hasNewSessionsSince(report, [msg(100), msg(200), msg(2_000, false)])).toBe(false);
  });

  it('새 분석이 생기면 다시 분석할 수 있다 (채팅을 지우고 다시 쌓은 경우도)', () => {
    const report = { at: 1_000, basedOn: 2 };
    expect(hasNewSessionsSince(report, [msg(100), msg(200), msg(1_500)])).toBe(true);
    // 지운 뒤 같은 개수만큼 새로 쌓임 — 개수는 같아도 보고서보다 늦게 생긴 분석이 있다
    expect(hasNewSessionsSince(report, [msg(1_200), msg(1_300)])).toBe(true);
  });
});

describe('캡처 인코딩은 작은 캡처를 키우지 않는다', () => {
  const manipulate = () => jest.requireMock('expo-image-manipulator').ImageManipulator.manipulate as jest.Mock;
  const lastContext = () => {
    const results = manipulate().mock.results;
    return results[results.length - 1].value as { resize: jest.Mock; renderAsync: jest.Mock };
  };

  it('800px 보다 넓을 때만 800px 로 줄인다', () => {
    expect(modelResizeWidth(1080)).toBe(800);
    expect(modelResizeWidth(801)).toBe(800);
    expect(modelResizeWidth(800)).toBeNull();
    expect(modelResizeWidth(720)).toBeNull();
    expect(modelResizeWidth(0)).toBeNull();
  });

  it('폭을 알면: 넓으면 줄이고, 좁으면 그대로 (JPEG 0.75)', async () => {
    await expect(encodeForModel('file:///w1080.jpg', 1080)).resolves.toEqual({ base64: 'QjY0800', mediaType: 'image/jpeg' });
    expect(lastContext().resize).toHaveBeenCalledWith({ width: 800 });
    await expect(encodeForModel('file:///w720.jpg', 720)).resolves.toEqual({ base64: 'QjY0720', mediaType: 'image/jpeg' });
    expect(lastContext().resize).not.toHaveBeenCalled();
    const saved = (await lastContext().renderAsync.mock.results[0].value) as { saveAsync: jest.Mock; release: jest.Mock };
    expect(saved.saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.75, base64: true });
    expect(saved.release).toHaveBeenCalled();
  });

  it('폭을 모르면(다시 시도·다른 답장) 읽어서 재고, 좁은 캡처는 키우지 않는다', async () => {
    await expect(encodeForModel('file:///w600.jpg', 0)).resolves.toEqual({ base64: 'QjY0600', mediaType: 'image/jpeg' });
    expect(lastContext().resize).not.toHaveBeenCalled();
    expect(lastContext().renderAsync).toHaveBeenCalledTimes(1);
    await expect(encodeForModel('file:///w1440.jpg')).resolves.toEqual({ base64: 'QjY0800', mediaType: 'image/jpeg' });
    expect(lastContext().resize).toHaveBeenCalledWith({ width: 800 });
    // 재려고 읽은 원본도 놓아 준다
    const measured = (await lastContext().renderAsync.mock.results[0].value) as { release: jest.Mock };
    expect(measured.release).toHaveBeenCalled();
  });
});

describe('캡처가 너무 크면', () => {
  it('앱은 보내지 않고 서버(413)와 같은 안내를 보여 준다', async () => {
    const huge = { base64: 'A'.repeat(MAX_IMAGE_BASE64_LENGTH + 4), mediaType: 'image/jpeg' as const };
    const error = await requestCoaching({ crush: { name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' }, user: { name: '', gender: 'male', style: [] }, tone: 'natural', image: huge }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CoachError);
    expect(error).toEqual(expect.objectContaining({ code: 'too_large', message: IMAGE_TOO_LARGE_MESSAGE }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('채팅: 캡처는 남고 안내만 보이며, 횟수는 그대로', async () => {
    const crushId = useAppStore.getState().quickStart();
    const before = useAppStore.getState().usage;
    const coach = mountHook(useCoach);
    await act(async () => {
      await coach().send({ crushId, image: { uri: 'file:///huge-w1080.jpg', width: 1080, height: 4000 }, text: '', tone: 'natural' });
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().usage).toEqual(before);
    const [mine, reply] = useAppStore.getState().messages[crushId];
    expect(mine).toEqual(expect.objectContaining({ role: 'user', imageUri: 'file:///huge-w1080.jpg' }));
    expect(reply).toEqual(expect.objectContaining({ role: 'coach', pending: false, error: IMAGE_TOO_LARGE_MESSAGE, text: 'too_large' }));
  });

  it('형식이 틀린 요청도 날것의 검사 오류 대신 짧은 안내로', async () => {
    const error = await requestCoaching({ crush: { name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' }, user: { name: '', gender: 'male', style: [] }, tone: 'angry' as never }).catch((e: unknown) => e);
    expect(error).toEqual(expect.objectContaining({ code: 'parse', message: '요청 형식이 올바르지 않아요.' }));
  });
});
