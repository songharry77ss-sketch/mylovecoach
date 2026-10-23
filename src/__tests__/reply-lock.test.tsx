/**
 * 웹 비회원 답장 가리기 — 첫 버전만 보이고 나머지는 흐린 글자 모양(실제 글은 그리지 않음)과 「가입하고 보기」.
 * 그리고 웹 가입 뒤 돌아갈 채팅방(auth-return): 채팅방 주소만, 30분 안에만, 한 번만 꺼낸다.
 */
import { act } from 'react';
import { Text } from 'react-native';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { AnalysisCard } from '@/components/coach/analysis-card';
import { rememberAuthReturn, takeAuthReturn } from '@/lib/auth-return';
import type { CoachAnalysis } from '@/lib/types';

jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/components/fx/celebration', () => ({ useCelebrate: () => jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
// 캐러셀은 너비를 잰 뒤에 그린다 — 시험에서는 바로 390 으로
jest.mock('react-native/Libraries/Components/View/View', () => {
  const { forwardRef, createElement, useEffect } = jest.requireActual('react');
  const Actual = jest.requireActual('react-native/Libraries/Components/View/View');
  const RealView = Actual.default ?? Actual;
  const Measured = forwardRef((props: { onLayout?: (e: unknown) => void }, ref: unknown) => {
    const { onLayout } = props;
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 300 } } });
    }, [onLayout]);
    return createElement(RealView, { ...props, ref });
  });
  return { __esModule: true, default: Measured };
});

const analysis: CoachAnalysis = {
  summary: '분위기가 좋아요',
  temperature: 'warm',
  interestScore: 70,
  replies: [
    { text: '첫 번째 답장이에요', tone: 'natural', why: '첫 이유', expectedReaction: '좋아!', successRate: 82 },
    { text: '숨겨진 두 번째 답장', tone: 'flirty', why: '숨은 이유', expectedReaction: '숨은 반응', successRate: 74 },
    { text: '숨겨진 세 번째 답장', tone: 'witty', why: '셋째 이유', expectedReaction: '셋째 반응', successRate: 60 },
  ],
  insights: [],
  warnings: [],
  nextStep: '',
} as unknown as CoachAnalysis;

const textOf = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const allText = (t: ReactTestRenderer) => t.root.findAllByType(Text).map((n) => textOf(n)).join('\n');

describe('답장 가리기', () => {
  it('첫 버전은 보이고, 나머지 글은 화면에 그리지 않으며 「가입하고 보기」로 바뀐다', async () => {
    const onUnlock = jest.fn();
    let tree: ReactTestRenderer | null = null;
    await act(async () => {
      tree = create(<AnalysisCard analysis={analysis} onSelectReply={jest.fn()} lockedFrom={1} onUnlock={onUnlock} />);
    });
    const t = tree as unknown as ReactTestRenderer;
    const shown = allText(t);
    expect(shown).toContain('첫 번째 답장이에요');
    expect(shown).not.toContain('숨겨진 두 번째 답장');
    expect(shown).not.toContain('숨은 반응');
    expect(shown).toContain('답장 2개가 더 있어요');
    expect(shown).toContain('가입하면 바로 보여요');

    // 2번째 버전으로 넘기면 복사 대신 가입
    const dot = t.root.findAll((n) => n.props.accessibilityLabel === '버전 2' && typeof n.props.onPress === 'function')[0];
    await act(async () => dot.props.onPress());
    const main = t.root.findAll((n) => n.props.accessibilityLabel === '이 답장 복사하기' && typeof n.props.onPress === 'function')[0];
    expect(textOf(main)).toContain('가입하고 버전 2 보기');
    await act(async () => main.props.onPress());
    expect(onUnlock).toHaveBeenCalledWith(1);
    act(() => t.unmount());
  });

  it('가리지 않으면 모든 버전이 그대로 보인다', async () => {
    let tree: ReactTestRenderer | null = null;
    await act(async () => {
      tree = create(<AnalysisCard analysis={analysis} onSelectReply={jest.fn()} />);
    });
    const t = tree as unknown as ReactTestRenderer;
    expect(allText(t)).toContain('숨겨진 두 번째 답장');
    expect(allText(t)).not.toContain('가입하면 바로 보여요');
    act(() => t.unmount());
  });
});

describe('웹 가입 뒤 돌아갈 채팅방', () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    (globalThis as unknown as { window: unknown }).window = Object.assign(globalThis.window ?? {}, {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  beforeEach(() => store.clear());

  it('채팅방 주소를 한 번만 꺼낸다', () => {
    rememberAuthReturn('/crush/c_abc123');
    expect(takeAuthReturn()).toBe('/crush/c_abc123');
    expect(takeAuthReturn()).toBeNull();
  });

  it('채팅방이 아닌 주소·30분 지난 것은 버린다', () => {
    rememberAuthReturn('https://evil.example/');
    expect(takeAuthReturn()).toBeNull();
    rememberAuthReturn('/crush/../my');
    expect(takeAuthReturn()).toBeNull();
    const now = Date.now();
    rememberAuthReturn('/crush/c_old', now - 31 * 60 * 1000);
    expect(takeAuthReturn(now)).toBeNull();
  });
});
