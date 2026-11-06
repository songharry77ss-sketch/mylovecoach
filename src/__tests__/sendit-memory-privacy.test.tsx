/**
 * 「센딧이 기억하는 이야기」 검토 뒤 고친 점 (11-06).
 * 1) 지운 기억이 메시지·재사용 사본에 남지 않는다 (예전에 저장된 사본도 읽을 때 지운다)
 * 2) 지운 기억은 「다시 기억하지 않을 이야기」로 기기에만 두고, 돌려받은 기억에서 걸러 낸다 (AI 로 보내지 않는다)
 * 3) 출력 상한에 걸려 기억 칸에서 잘린 응답은 기억만 비우고 살린다 · 예전 앱 요청은 기억을 쓰지 않게 한다
 * 4) 답장 카드는 화면 읽기에서 한 덩어리로 묶지 않는다 (안쪽 공유·복사 버튼을 따로 고를 수 있게)
 * 5) 관심도 점수가 없는 예전 결과도 이번 대화의 호감 온도를 보여 준다
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react';
import { Text } from 'react-native';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { AnalysisCard } from '@/components/coach/analysis-card';
import { COACH_SYSTEM_PROMPT, CoachRequestSchema, buildContextText, buildTaskBlock, crushToRequest, salvageTruncatedCoach } from '@/lib/coach-schema';
import type { CoachAnalysis, Crush } from '@/lib/types';
import { memoryAfterResult, useAppStore } from '@/store/app-store';

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
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/components/fx/celebration', () => ({ useCelebrate: () => jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const ANALYSIS: CoachAnalysis = {
  summary: '분위기가 좋아요',
  temperature: 'warm',
  interestScore: 70,
  heatDelta: 5,
  insights: [],
  replies: [{ tone: 'natural', text: '좋아!', why: '', expectedReaction: 'ㅋㅋ', successRate: 80 }],
  nextStep: '',
  warnings: [],
  memory: ['민지는 성수 카페를 좋아함'],
};

const textOf = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const allText = (t: ReactTestRenderer) => t.root.findAllByType(Text).map((n) => textOf(n)).join('\n');

beforeEach(() => useAppStore.getState().resetAll());

const addCrush = () => useAppStore.getState().addCrush({ name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' }).id;

describe('1) 기억 사본을 남기지 않는다', () => {
  it('결과를 메시지·재사용 사본에 저장할 때 기억은 뺀다 (기억은 채팅방의 기억에만)', () => {
    const id = addCrush();
    const s = useAppStore.getState();
    const msg = s.addMessage({ crushId: id, role: 'coach', pending: true });
    s.completeAnalysis(id, msg.id, ANALYSIS, { applyHeat: true });
    s.putCachedAnalysis('k', ANALYSIS);
    const saved = useAppStore.getState().messages[id][0].analysis;
    expect(saved?.summary).toBe('분위기가 좋아요');
    expect(saved).not.toHaveProperty('memory');
    expect(useAppStore.getState().analysisCache.k.analysis).not.toHaveProperty('memory');
  });

  it('예전에 저장된 메시지·재사용 사본의 기억은 앱을 켤 때 한 번 지운다', async () => {
    await AsyncStorage.setItem(
      'mylovecoach.store.v1',
      JSON.stringify({
        version: 1,
        state: {
          crushes: { c1: { id: 'c1', name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '', createdAt: 0, updatedAt: 0 } },
          messages: { c1: [{ id: 'm1', crushId: 'c1', role: 'coach', createdAt: 1, analysis: ANALYSIS }] },
          analysisCache: { k: { analysis: ANALYSIS, at: Date.now() } },
        },
      }),
    );
    await useAppStore.persist.rehydrate();
    const s = useAppStore.getState();
    expect(s.messages.c1[0].analysis?.summary).toBe('분위기가 좋아요');
    expect(s.messages.c1[0].analysis).not.toHaveProperty('memory');
    expect(s.analysisCache.k.analysis).not.toHaveProperty('memory');
  });
});

describe('2) 지운 기억은 다시 기억하지 않는다', () => {
  it('줄을 지우면 「다시 기억하지 않을 이야기」에 남고, 「모두 지우기」는 그때 목록을 모두 남긴다 (최근 20줄)', () => {
    const id = addCrush();
    const s = useAppStore.getState();
    s.setCrushMemory(id, ['민지는 성수 카페를 좋아함', '토요일 오후에 만나기로 함', '민지는 강아지를 키움']);
    s.forgetCrushMemory(id, ['토요일 오후에 만나기로 함']);
    expect(useAppStore.getState().crushes[id].memory?.facts).toEqual(['민지는 성수 카페를 좋아함', '민지는 강아지를 키움']);
    expect(useAppStore.getState().crushes[id].memoryForgotten).toEqual(['토요일 오후에 만나기로 함']);
    s.forgetCrushMemory(id);
    expect(useAppStore.getState().crushes[id].memory).toBeUndefined();
    expect(useAppStore.getState().crushes[id].memoryForgotten).toEqual(['토요일 오후에 만나기로 함', '민지는 성수 카페를 좋아함', '민지는 강아지를 키움']);
    s.forgetCrushMemory(id, Array.from({ length: 25 }, (_, i) => `지운 줄 ${i + 1}`));
    const forgotten = useAppStore.getState().crushes[id].memoryForgotten ?? [];
    expect(forgotten).toHaveLength(20);
    expect(forgotten[forgotten.length - 1]).toBe('지운 줄 25');
    s.clearForgottenMemory(id);
    expect(useAppStore.getState().crushes[id].memoryForgotten).toBeUndefined();
  });

  it('지운 줄은 이 기기에서 걸러 내는 데만 쓰고 AI 로 보내지 않는다 — 요청·프롬프트에 없다', () => {
    const crush: Crush = { id: 'c1', name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '', createdAt: 0, updatedAt: 0, memory: { facts: ['민지는 카페를 좋아함'], at: 1 }, memoryForgotten: ['토요일 오후에 만나기로 함'] };
    const sent = crushToRequest(crush);
    expect(sent).not.toHaveProperty('memoryForgotten');
    expect(JSON.stringify(sent)).not.toContain('토요일 오후에 만나기로 함');
    const req = CoachRequestSchema.parse({ crush: sent, user: { name: '', gender: 'male', style: [] }, tone: 'natural', today: '11/6(금)' });
    const context = buildContextText(req);
    expect(context).not.toContain('지운 기억');
    expect(context).not.toContain('토요일 오후에 만나기로 함');
    expect(COACH_SYSTEM_PROMPT).not.toContain('지운 기억');
  });

  it('서버는 그 칸이 없어도 되고, 혹시 보내 와도 거절하지 않고 버린다(프롬프트에 싣지 않는다)', () => {
    const user = { name: '', gender: 'male', style: [] };
    const crush = { name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' };
    expect(CoachRequestSchema.safeParse({ crush, user, tone: 'natural' }).success).toBe(true);
    const withField = CoachRequestSchema.parse({ crush: { ...crush, memoryForgotten: Array.from({ length: 30 }, (_, i) => `지운 줄 ${i}`) }, user, tone: 'natural' });
    expect(withField.crush).not.toHaveProperty('memoryForgotten');
    expect(buildContextText(withField)).not.toContain('지운 줄');
  });

  it('모델이 지운 줄을 다시 적어 와도(띄어쓰기·문장부호가 달라도) 걸러 낸다', () => {
    expect(memoryAfterResult(['a'], ['a'], ['a', '토요일 오후에 만나기로 함.', 'b'], ['토요일  오후에 만나기로 함'])).toEqual(['a', 'b']);
    // 지운 줄만 다시 적어 왔으면 바꿀 게 없다
    expect(memoryAfterResult(['a'], ['a'], ['a', '「토요일 오후에 만나기로 함」'], ['토요일 오후에 만나기로 함'])).toBeNull();
    const id = addCrush();
    useAppStore.getState().forgetCrushMemory(id, ['민지는 카페를 좋아함']);
    useAppStore.getState().setCrushMemory(id, ['민지는 "카페"를 좋아함!', '새 이야기']);
    expect(useAppStore.getState().crushes[id].memory?.facts).toEqual(['새 이야기']);
  });
});

describe('3) 잘린 응답 살리기 · 예전 앱은 기억을 쓰지 않게', () => {
  it('기억 칸 안에서 잘렸으면 기억만 비우고 요약·답장은 살린다. 기억 앞에서 잘렸으면 살리지 않는다', () => {
    const full = JSON.stringify({ ...ANALYSIS, memory: ['민지는 성수 카페를 좋아함', '토요일 약속'] });
    const cut = full.slice(0, full.indexOf('토요일') + 2);
    const saved = salvageTruncatedCoach(cut) as CoachAnalysis;
    expect(saved.summary).toBe('분위기가 좋아요');
    expect(saved.replies[0].text).toBe('좋아!');
    expect(saved.memory).toEqual([]);
    expect(salvageTruncatedCoach(full.slice(0, full.indexOf('"memory"') + 5))).toEqual(expect.objectContaining({ memory: [] }));
    expect(salvageTruncatedCoach(full.slice(0, full.indexOf('"memory"') - 1))).toEqual(expect.objectContaining({ memory: [] }));
    expect(salvageTruncatedCoach(full.slice(0, 40))).toBeUndefined();
    // 답장 중간에서 끊겼으면 살리지 않는다
    expect(salvageTruncatedCoach(full.slice(0, full.indexOf('"why"')))).toBeUndefined();
  });

  it('예전 앱(오늘 날짜 없음)·remember:false 요청은 「기억: 남기지 않음」, 새 앱 요청은 아니다', () => {
    const base = { crush: { name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' }, user: { name: '', gender: 'male', style: [] }, tone: 'natural', text: '안녕' };
    expect(buildTaskBlock(CoachRequestSchema.parse(base))).toContain('[기억: 남기지 않음]');
    expect(buildTaskBlock(CoachRequestSchema.parse({ ...base, today: '11/6(금)', remember: false }))).toContain('[기억: 남기지 않음]');
    expect(buildTaskBlock(CoachRequestSchema.parse({ ...base, today: '11/6(금)' }))).not.toContain('[기억: 남기지 않음]');
  });
});

describe('4·5) 결과 카드', () => {
  it('답장 카드는 한 덩어리로 묶지 않아 안쪽 공유·복사 버튼을 따로 고를 수 있다', async () => {
    let tree: ReactTestRenderer | null = null;
    await act(async () => {
      tree = create(<AnalysisCard analysis={ANALYSIS} onSelectReply={jest.fn()} />);
    });
    const t = tree as unknown as ReactTestRenderer;
    const card = t.root.findAll((n) => n.props.testID === 'reply-card-0' && typeof n.props.onPress === 'function')[0];
    expect(card.props.accessible).toBe(false);
    expect(card.props.accessibilityLabel).toBeUndefined();
    expect(t.root.findAll((n) => n.props.accessibilityLabel === '답장 1 복사하기').length).toBeGreaterThan(0);
    expect(t.root.findAll((n) => n.props.accessibilityLabel === '답장 1 공유하기').length).toBeGreaterThan(0);
    act(() => t.unmount());
  });

  it('관심도 점수가 없는 예전 결과도 이번 대화의 호감 온도를 보여 준다', async () => {
    const old = { ...ANALYSIS, interestScore: null, heatDelta: undefined, memory: undefined } as CoachAnalysis;
    let tree: ReactTestRenderer | null = null;
    await act(async () => {
      tree = create(<AnalysisCard analysis={old} onSelectReply={jest.fn()} />);
    });
    const t = tree as unknown as ReactTestRenderer;
    expect(allText(t)).toContain('이번 대화 호감 온도');
    expect(allText(t)).toContain('따뜻함');
    expect(allText(t)).not.toContain('관심 있을 가능성');
    act(() => t.unmount());
  });
});
