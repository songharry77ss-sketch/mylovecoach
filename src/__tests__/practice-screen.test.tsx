import { act } from 'react';
import { Modal, Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import PracticeSessionScreen from '@/app/practice/[id]';
import { PRACTICE_PROMPT_TURNS, parseAiRequest } from '@/lib/ai-tasks';
import { PRACTICE_MAX_TURNS } from '@/lib/practice';
import type { PracticePersona, PracticeTurn } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

// 연애 연습 화면을 실제로 그려, 1.0 의 말풍선 상한(서버 64개 · 앱 전송 최근 30개)과
// 이 화면의 AI 답변 신고(화면 위 깃발 · 「끝내기」 글자 버튼 · 코치 피드백 깃발)가 함께 동작하는지 본다
jest.setTimeout(30_000);

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
// 스토어 빌드처럼 중계 서버 주소와 앱 토큰이 있는 상태 (신고 진입점이 보이는 빌드)
jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://coach.test', apiSameOrigin: false, apiToken: 'app-token', supportEmail: '', privacyUrl: 'https://coach.test/privacy.html', termsUrl: '' },
}));
// 애니메이션은 여기서 볼 것이 아니다 (Reanimated 4 의 시험용 모듈은 worklets 네이티브 모듈도 시험용으로 바꿔야 불러진다)
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
// 화면 머리(Stack.Screen)의 오른쪽 버튼은 본문 맨 위에 그려 눌러 본다
jest.mock('expo-router', () => {
  const { createElement, Fragment } = jest.requireActual('react');
  return {
    Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => createElement(Fragment, null, options?.headerRight?.() ?? null) },
    useLocalSearchParams: () => ({ id: 'pr_long' }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  };
});
jest.mock('@/components/ui/button', () => {
  const { createElement } = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    Button: ({ title, onPress, disabled, loading }: { title: string; onPress?: () => void; disabled?: boolean; loading?: boolean }) =>
      createElement(RNText, { accessibilityRole: 'button', accessibilityState: { disabled: Boolean(disabled || loading) }, onPress: disabled || loading ? undefined : onPress }, title),
  };
});
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const PERSONA: PracticePersona = {
  id: 'blind',
  name: '민지',
  emoji: '🙂',
  gender: 'female',
  age: 28,
  mbti: 'ENFP',
  job: '마케터',
  style: [],
  relationship: 'blind_date',
  scenario: '소개팅 다음 날',
  opener: '어제 잘 들어갔어요?',
  speech: 'polite',
  difficulty: 2,
  hint: '질문으로 이어 가기',
  color: '#FFD6E0',
};

/** 상대 첫 말 + (내 말 1 · 상대 말풍선 3) × 11마디 = 말풍선 45개 — 마지막 12마디째를 보내면 40개를 넘는다 */
function longTurns(): PracticeTurn[] {
  const turns: PracticeTurn[] = [{ id: 't0', role: 'them', text: PERSONA.opener, at: 0 }];
  for (let i = 1; i < PRACTICE_MAX_TURNS; i += 1) {
    turns.push({ id: `m${i}`, role: 'me', text: `내 말 ${i}`, at: i, feedback: `피드백 ${i}`, better: '', delta: 1 });
    for (let j = 1; j <= 3; j += 1) turns.push({ id: `t${i}-${j}`, role: 'them', text: `상대 말 ${i}-${j}`, at: i });
  }
  return turns;
}

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const fetchMock = jest.fn(
  async (_url: string, _init?: { body?: string; headers?: Record<string, string> }): Promise<FakeResponse> => ({
    ok: true,
    status: 200,
    json: async () => ({ result: { replies: ['주말 좋아요 ㅎㅎ'], heatDelta: 4, mood: '😊', feedback: '약속을 구체적으로 잡아서 좋아요', better: '', ended: false } }),
  }),
);

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
}
/** 접근성 이름으로 찾은 누를 수 있는 것들 */
function byLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
}

beforeAll(async () => {
  // 요청마다 거는 90초 시간 제한 타이머가 테스트 뒤에 남지 않도록 가짜 타이머로 (프로미스·setImmediate 는 진짜 그대로)
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
  global.fetch = fetchMock as unknown as typeof fetch;
  // 저장소를 다 읽은 뒤에 연습 상태를 넣는다 (늦게 읽힌 빈 저장값이 덮지 않게)
  for (let i = 0; i < 50 && !useAppStore.persist.hasHydrated(); i += 1) await act(flush);
  useAppStore.setState({
    user: { name: '지훈', gender: 'male', style: [], defaultTone: 'natural', createdAt: 0 },
    // AI 분석 동의는 받은 상태 (동의 시트는 따로 시험한다). 연습 1회 차감도 이미 한 상태
    aiConsent: true,
    aiConsentProvider: 'google',
    aiConsentAt: 1,
    practice: { pr_long: { id: 'pr_long', persona: PERSONA, turns: longTurns(), heat: 20, mood: '🙂', startedAt: 0, updatedAt: 0, charged: true } },
  });
});
afterEach(() => jest.clearAllTimers());
afterAll(() => jest.useRealTimers());

describe('연애 연습 화면 — 말풍선 상한과 AI 답변 신고', () => {
  it('말풍선이 40개를 넘어도 최근 30개만 보내고, 위 깃발·「끝내기」·피드백 깃발이 그대로 동작한다', async () => {
    let tree: ReactTestRenderer | null = null;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <PracticeSessionScreen />
        </SafeAreaProvider>,
      );
      await flush();
    });
    const screen = tree as unknown as ReactTestRenderer;

    // 머리: 깃발은 신고, 연습 끝내기는 글자 버튼. 내 말풍선 아래 코치 피드백에도 깃발
    expect(byLabel(screen, 'AI 답변 신고')).not.toHaveLength(0);
    const endButton = byLabel(screen, '연습 끝내기');
    expect(endButton).not.toHaveLength(0);
    expect(endButton[0].findAllByType(Text).map((t) => t.props.children)).toContain('끝내기');
    expect(byLabel(screen, '이 피드백 신고하기').length).toBeGreaterThan(0);

    // 12마디째 보내기 — 기기에는 말풍선 46개가 있지만 서버에는 최근 30개만 간다
    act(() => screen.root.findByType(TextInput).props.onChangeText('그럼 이번 주말에 볼래요?'));
    const sendButton = byLabel(screen, '보내기');
    expect(sendButton).not.toHaveLength(0);
    await act(async () => {
      sendButton[sendButton.length - 1].props.onPress();
      await flush();
    });
    for (let i = 0; i < 50 && fetchMock.mock.calls.length === 0; i += 1) await act(flush);
    // 응답을 받고 나면 상대 말풍선은 0.35초 뒤에 하나씩 온다
    for (let i = 0; i < 20 && useAppStore.getState().practice.pr_long.turns.length < 47; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(400);
        await flush();
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://coach.test/api/coach');
    expect(init?.headers?.['x-ai-consent']).toBe('google');
    const body = JSON.parse(init?.body ?? '{}') as { mode: string; turns: { role: string; text: string }[] };
    expect(body.mode).toBe('practice');
    expect(body.turns).toHaveLength(PRACTICE_PROMPT_TURNS);
    expect(body.turns[body.turns.length - 1]).toEqual({ role: 'me', text: '그럼 이번 주말에 볼래요?' });
    const all = useAppStore.getState().practice.pr_long.turns;
    // 보낼 때 기기에는 46개(45 + 방금 보낸 말) — 그중 마지막 30개
    expect(body.turns[0].text).toBe(all[46 - PRACTICE_PROMPT_TURNS].text);
    // 서버(같은 스키마)가 받는 요청이고, 예전 앱처럼 46개를 통째로 보내도 64개 상한 안이라 받는다
    expect(parseAiRequest(body).ok).toBe(true);
    expect(parseAiRequest({ ...body, turns: all.slice(0, 46).map((t) => ({ role: t.role, text: t.text })) }).ok).toBe(true);

    // 12마디를 다 써서 연습이 끝나면 「끝내기」는 사라지고, 신고 깃발은 남는다
    expect(all).toHaveLength(47);
    expect(byLabel(screen, '연습 끝내기')).toHaveLength(0);
    const flag = byLabel(screen, 'AI 답변 신고');
    expect(flag).not.toHaveLength(0);

    // 위 깃발은 기기에 있는 전체 대화에서 상대의 가장 최근 말을 신고한다 (서버로 잘라 보낸 30개와 무관)
    await act(async () => {
      flag[0].props.onPress();
      await flush();
    });
    const sheet = screen.root.findAllByType(Modal).find((m) => m.props.visible);
    expect(sheet).toBeDefined();
    expect(texts(screen)).toContain('연습 상대 「민지」: 주말 좋아요 ㅎㅎ');

    act(() => screen.unmount());
  });
});
