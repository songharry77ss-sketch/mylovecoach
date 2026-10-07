import { act } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import CrushReportScreen from '@/app/crush/[id]/report';
import { useCoach } from '@/hooks/use-coach';
import { useMindReading } from '@/hooks/use-mind-reading';
import { setAiConsentPrompter, withdrawAiConsent, type AiRoute } from '@/lib/ai-consent';
import { currentQuota } from '@/lib/billing/gate';
import { EMPTY_USAGE, EMPTY_WALLET } from '@/lib/billing/quota';
import { CoachError, requestCoaching } from '@/lib/coach-client';
import { IMAGE_TOO_LARGE_MESSAGE, MAX_IMAGE_BASE64_LENGTH, crushToRequest, userToRequest } from '@/lib/coach-schema';
import { encodeForModel, modelResizeWidth } from '@/lib/images';
import type { ChatMessage, CoachAnalysis, Crush, CrushReport, Gender, MindReading, UserProfile } from '@/lib/types';
import { hasNewSessionsSince, mindCacheKey, reportProfileKey, reportRefresh, useAppStore } from '@/store/app-store';

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
// 보고서 화면은 채팅방 c_report 를 연다
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }), useLocalSearchParams: () => ({ id: 'c_report' }), Stack: { Screen: () => null } }));
// Reanimated(네이티브 worklets)는 테스트 환경에서 띄울 수 없어서, 보고서 화면이 쓰는 만큼만 바로 끝나는 흉내로 바꾼다 (애니메이션은 여기서 볼 것이 아니다)
jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  const { useRef } = jest.requireActual('react');
  /** FadeInDown.delay(80).duration(300) 처럼 이어 부르는 등장 효과 — 아무것도 하지 않는다 */
  const entering: Record<string, () => unknown> = {};
  for (const name of ['delay', 'duration', 'springify', 'damping']) entering[name] = () => entering;
  const same = (t: number) => t;
  const last = (...values: unknown[]) => values[values.length - 1];
  const target = (value: unknown) => value;
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text, createAnimatedComponent: target },
    FadeIn: entering,
    FadeOut: entering,
    FadeInDown: entering,
    FadeInUp: entering,
    ZoomIn: entering,
    Easing: { out: () => same, in: () => same, inOut: () => same, cubic: same, quad: same, ease: same, linear: same },
    useSharedValue: (value: unknown) => useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
    useAnimatedReaction: () => {},
    withDelay: last,
    withSequence: last,
    withSpring: target,
    withTiming: target,
    withRepeat: target,
    interpolate: target,
    interpolateColor: () => 'transparent',
    runOnJS: target,
  };
});
// 버튼은 눌림 애니메이션 없이 글자 버튼으로 — 막혔는지(disabled)는 그대로 넘긴다
jest.mock('@/components/ui/button', () => {
  const { createElement } = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    Button: ({ title, onPress, disabled }: { title: string; onPress?: () => void; disabled?: boolean }) =>
      createElement(RNText, { accessibilityRole: 'button', accessibilityState: { disabled: Boolean(disabled) }, onPress }, title),
  };
});
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
const REPORT: CrushReport = {
  headline: '천천히 데워지는 다정파',
  keywords: ['다정'],
  personality: '신중해요.',
  textingStyle: '답장이 성실해요.',
  greenFlags: ['먼저 연락해요'],
  redFlags: [],
  interests: ['영화'],
  strategy: ['질문으로 이어 가기'],
  roadmap: [{ title: '가까워지기', action: '주말 약속 잡기' }],
  innerThought: '요즘 연락이 기다려지네',
  compatibility: 72,
  compatibilityNote: '대화 리듬이 잘 맞아요.',
};
const ANALYSIS: CoachAnalysis = { summary: 's', temperature: 'warm', interestScore: 60, insights: [], replies: [], nextStep: '', warnings: [] };
let mindReplies = 0;
/** 중계 서버 흉내 — 속마음은 부를 때마다 조금 다른 결과 */
const fetchMock = jest.fn(async (_url: string, init?: { body?: string; signal?: AbortSignal }) => {
  const body = JSON.parse(init?.body ?? '{}') as { mode?: string };
  mindReplies += 1;
  const json =
    body.mode === 'mind'
      ? { mode: 'mind', result: { ...MIND, headline: `${MIND.headline} #${mindReplies}` } }
      : body.mode === 'report'
        ? { mode: 'report', result: REPORT }
        : { analysis: ANALYSIS };
  return { ok: true, status: 200, json: async () => json } as unknown as Response;
});
/** 이번 테스트에서 보낸 요청 중 그 모드의 개수 */
const callsOf = (mode: string) => fetchMock.mock.calls.filter(([, init]) => (JSON.parse(init?.body ?? '{}') as { mode?: string }).mode === mode).length;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
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

  it('「다시 풀이」를 빠르게 두 번 누르면 앞 요청만 끊기고, 뒤 요청이 끝날 때까지 「풀이 중」이 이어진다', async () => {
    const hook = open();
    await askOnce(hook);
    // 이번엔 응답을 붙잡아 둔다 — 앞 요청은 끊길 때까지, 뒤 요청은 release() 할 때까지
    fetchMock.mockImplementationOnce((_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    let release = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve({ ok: true, status: 200, json: async () => ({ mode: 'mind', result: { ...MIND, headline: '두 번째 풀이' } }) } as unknown as Response);
        }),
    );
    let first: Promise<unknown> = Promise.resolve();
    let second: Promise<unknown> = Promise.resolve();
    await act(async () => {
      first = hook().ask(true);
      // 앞 요청이 실제로 나간 뒤에 한 번 더 누른다
      while (fetchMock.mock.calls.length < 2) await flush();
      second = hook().ask(true);
      await first;
    });
    await expect(first).resolves.toBe('failed');
    // 앞 요청이 끝나며 busy 를 끄면 「다시 풀이」 버튼과 예전 풀이가 다시 떠서 또 누를 수 있게 된다
    expect(hook().busy).toBe(true);
    await act(async () => {
      while (fetchMock.mock.calls.length < 3) await flush();
      release();
      await second;
    });
    await expect(second).resolves.toBe('fresh');
    expect(hook().busy).toBe(false);
    expect(hook().reading?.headline).toBe('두 번째 풀이');
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

  it('상대·내 프로필을 고치면 다시 분석할 수 있다 (보고서 요청에 들어가는 그대로 — 대화마다 바뀌는 온도는 빼고)', () => {
    const crush: Crush = { id: 'c', name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '', createdAt: 0, updatedAt: 0, heat: 10 };
    const user = useAppStore.getState().user as UserProfile;
    const keyOf = (c: Crush, u: UserProfile = user, kkti?: string) => reportProfileKey({ crush: crushToRequest(c), user: userToRequest(u, kkti) });
    const messages = [msg(100), msg(200)];
    const report = { data: REPORT, at: 1_000, basedOn: 2, profileKey: keyOf(crush) };
    expect(reportRefresh(report, messages, keyOf(crush))).toBeNull();
    expect(reportRefresh(report, messages, keyOf({ ...crush, heat: 55 }))).toBeNull();
    const edits: Partial<Crush>[] = [{ relationship: 'dating' }, { goal: '고백하기' }, { mbti: 'INTJ' }, { notes: '회사 동료' }, { callName: '오빠' }, { speech: 'polite' }, { name: '민지 선배' }];
    for (const edit of edits) expect(reportRefresh(report, messages, keyOf({ ...crush, ...edit }))).toBe('profile');
    expect(reportRefresh(report, messages, keyOf(crush, { ...user, mbti: 'INTJ' }))).toBe('profile');
    expect(reportRefresh(report, messages, keyOf(crush, { ...user, goal: '올해 안에 연애' }))).toBe('profile');
    expect(reportRefresh(report, messages, keyOf(crush, user, 'ABCD 직진 불도저'))).toBe('profile');
    // 새 코칭 기록이 먼저 · 지문이 없는 예전 보고서는 바뀌었는지 몰라 열어 둔다 · 보고서가 없으면 첫 보고서
    expect(reportRefresh(report, [...messages, msg(1_500)], keyOf(crush))).toBe('sessions');
    expect(reportRefresh({ data: REPORT, at: 1_000, basedOn: 2 }, messages, keyOf(crush))).toBe('unknown');
    expect(reportRefresh(undefined, [], keyOf(crush))).toBe('first');
  });
});

describe('보고서 화면 — 막기가 버튼과 요청에 이어져 있다', () => {
  const ID = 'c_report';
  const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
  const coachMsg = (id: string, createdAt: number): ChatMessage => ({ id, crushId: ID, role: 'coach', createdAt, analysis: ANALYSIS });

  beforeEach(() => {
    const now = Date.now();
    useAppStore.setState({
      crushes: { [ID]: { id: ID, name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '', createdAt: 0, updatedAt: 0, heat: 10 } },
      messages: { [ID]: [coachMsg('m1', now - 2_000), coachMsg('m2', now - 1_000)] },
    });
  });

  function mount(): ReactTestRenderer {
    let tree: ReactTestRenderer | null = null;
    act(() => {
      tree = create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <CrushReportScreen />
        </SafeAreaProvider>,
      );
    });
    mounted.push(tree as unknown as ReactTestRenderer);
    return tree as unknown as ReactTestRenderer;
  }
  /** 그 글의 버튼 (없으면 undefined) */
  const button = (tree: ReactTestRenderer, title: string): ReactTestInstance | undefined =>
    tree.root.findAllByType(Text).find((t) => t.props.children === title && t.props.accessibilityRole === 'button');
  /** 막혀 있어도 onPress 를 직접 불러 본다 — 화면 안의 확인(이른 return)까지 보려고 */
  const press = async (target: ReactTestInstance | undefined) => {
    if (!target) throw new Error('버튼이 없어요');
    await act(async () => {
      await target.props.onPress();
    });
  };

  it('만든 뒤에는 「다시 분석하기」가 막히고 눌러도 부르지 않는다 — 바뀐 정보나 새 대화가 생기면 다시 열린다', async () => {
    const tree = mount();
    await press(button(tree, '분석 보고서 만들기'));
    expect(callsOf('report')).toBe(1);
    expect(useAppStore.getState().crushes[ID].report).toEqual(expect.objectContaining({ basedOn: 2, profileKey: expect.any(String) }));

    // 같은 기록·같은 프로필 → 막힘. 눌러도 부르지 않고 횟수도 그대로
    const left = currentQuota().remaining;
    const blocked = button(tree, '다시 분석하기');
    expect(blocked?.props.accessibilityState).toEqual({ disabled: true });
    await press(blocked);
    expect(callsOf('report')).toBe(1);
    expect(currentQuota().remaining).toBe(left);

    // 관계 단계를 바꾸면 열리고, 다시 만들면 또 막힌다
    // 저장소의 set 은 기기 저장 약속(promise)을 돌려줘서 act 가 비동기로 착각하지 않게 중괄호로 감싼다
    act(() => {
      useAppStore.getState().updateCrush(ID, { relationship: 'dating' });
    });
    const changed = button(tree, '바뀐 정보로 다시 분석');
    expect(changed?.props.accessibilityState).toEqual({ disabled: false });
    await press(changed);
    expect(callsOf('report')).toBe(2);
    expect(button(tree, '다시 분석하기')?.props.accessibilityState).toEqual({ disabled: true });

    // 새 코칭 기록이 생겨도 열린다
    act(() => {
      useAppStore.getState().addMessage({ crushId: ID, role: 'coach', analysis: ANALYSIS });
    });
    const fresh = button(tree, '새 대화까지 반영해 다시 분석');
    expect(fresh?.props.accessibilityState).toEqual({ disabled: false });
    await press(fresh);
    expect(callsOf('report')).toBe(3);
  });

  it('지문이 없는 예전 보고서는 다시 분석할 수 있게 둔다', async () => {
    act(() => {
      useAppStore.getState().saveReport(ID, REPORT, 2);
    });
    const tree = mount();
    const again = button(tree, '다시 분석하기');
    expect(again?.props.accessibilityState).toEqual({ disabled: false });
    await press(again);
    expect(callsOf('report')).toBe(1);
    expect(useAppStore.getState().crushes[ID].report?.profileKey).toEqual(expect.any(String));
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
