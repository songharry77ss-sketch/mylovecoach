import { buildCoachTask } from '@/lib/ai-tasks';
import { COACH_SYSTEM_PROMPT, CoachRequestSchema, buildContextText } from '@/lib/coach-schema';
import type { ChatMessage, CoachAnalysis } from '@/lib/types';
import { HISTORY_TURNS, buildEarlierNotes, buildHistory, lastTypedAt, useAppStore } from '@/store/app-store';

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

const analysis = (summary: string, replies: string[] = [], insights: string[] = []): CoachAnalysis => ({
  summary,
  temperature: 'warm',
  interestScore: 60,
  insights,
  replies: replies.map((text) => ({ tone: 'natural', text, why: '' })),
  nextStep: '',
  warnings: [],
});

let at = 1_000;
const msg = (partial: Partial<ChatMessage> & Pick<ChatMessage, 'role'>): ChatMessage => ({
  id: Math.random().toString(36).slice(2),
  crushId: 'c1',
  createdAt: (at += 10),
  ...partial,
});

/** 사용자 글 → 코치 답 한 쌍씩 n 턴 */
const chat = (n: number) =>
  Array.from({ length: n }, (_, i) => [
    msg({ role: 'user', text: `요청${i + 1}` }),
    msg({ role: 'coach', analysis: analysis(`요약${i + 1}`, [`답장${i + 1}-1`, `답장${i + 1}-2`, `답장${i + 1}-3`], [`포인트${i + 1}`]) }),
  ]).flat();

const crush = { name: '민지', gender: 'female' as const, relationship: 'talking' as const, style: [], notes: '' };
const user = { name: '지훈', gender: 'male' as const, style: [] };

describe('대화 기억 — 앱이 보내는 맥락', () => {
  it('최근 8턴을 싣고, 그중 최근 3턴만 제안한 답장·읽어낸 포인트까지 싣는다', () => {
    const history = buildHistory(chat(10));
    expect(HISTORY_TURNS).toBe(8);
    expect(history).toHaveLength(8);
    expect(history[0].userNote).toBe('요청3');
    expect(history.slice(0, 5).every((h) => h.replies === undefined && h.insights === undefined)).toBe(true);
    expect(history[7]).toEqual({ userNote: '요청10', coachSummary: '요약10', replies: ['답장10-1', '답장10-2', '답장10-3'], insights: ['포인트10'] });
    expect(history[5].replies).toEqual(['답장8-1', '답장8-2', '답장8-3']);
  });

  it('캡처와 글을 같이 보냈으면 둘 다 남긴다', () => {
    const history = buildHistory([msg({ role: 'user', imageUri: 'file://a.jpg', text: '이거 어떻게 답해?' }), msg({ role: 'coach', analysis: analysis('요약') })]);
    expect(history[0].userNote).toBe('(대화 캡처 업로드) 이거 어떻게 답해?');
  });

  it('최근 맥락 밖으로 밀려난 앞 대화에서는 사용자가 직접 쓴 말만 따로 모은다', () => {
    const list = [
      msg({ role: 'user', text: '앞으로 답장은 이모지 빼고 짧게 해 줘' }),
      msg({ role: 'coach', analysis: analysis('알겠어요') }),
      msg({ role: 'user', imageUri: 'file://a.jpg' }),
      msg({ role: 'coach', analysis: analysis('캡처 요약') }),
      msg({ role: 'user', text: '🔄 다른 답장 더 보기' }),
      msg({ role: 'coach', analysis: analysis('다른 답장') }),
      ...chat(8),
    ];
    // 최근 8턴은 history 로 가고, 그 앞 3턴 중 직접 쓴 글은 첫 번째뿐 (캡처만 올린 턴·「다른 답장」 자동 문구는 뺀다)
    expect(buildEarlierNotes(list)).toEqual(['앞으로 답장은 이모지 빼고 짧게 해 줘']);
    // 대화가 짧으면 전부 history 에 들어가니 따로 모을 것이 없다
    expect(buildEarlierNotes(chat(5))).toEqual([]);
    // 아주 긴 글은 잘라서 싣는다
    const long = buildEarlierNotes([msg({ role: 'user', text: '가'.repeat(500) }), ...chat(8)]);
    expect(long[0].length).toBeLessThanOrEqual(161);
  });

  it('사용자가 마지막으로 직접 쓴 시각 — 「다른 답장」 자동 문구·캡처만 올린 것은 세지 않는다', () => {
    const typed = msg({ role: 'user', text: '반말로 해 줘' });
    const list = [typed, msg({ role: 'coach', analysis: analysis('네') }), msg({ role: 'user', text: '🔄 다른 답장 더 보기' }), msg({ role: 'user', imageUri: 'file://b.jpg' })];
    expect(lastTypedAt(list)).toBe(typed.createdAt);
    expect(lastTypedAt([msg({ role: 'user', imageUri: 'file://c.jpg' })])).toBeNull();
  });
});

describe('대화 기억 — 저장된 결과 재사용', () => {
  beforeEach(() => useAppStore.getState().resetAll());

  it('결과를 만든 뒤 사용자가 새로 글을 썼으면 저장된 결과를 쓰지 않는다', () => {
    const s = useAppStore.getState();
    s.putCachedAnalysis('k', analysis('예전 결과'));
    const savedAt = useAppStore.getState().analysisCache.k.at;
    expect(useAppStore.getState().getCachedAnalysis('k')?.summary).toBe('예전 결과');
    expect(useAppStore.getState().getCachedAnalysis('k', savedAt - 1)?.summary).toBe('예전 결과');
    expect(useAppStore.getState().getCachedAnalysis('k', null)?.summary).toBe('예전 결과');
    expect(useAppStore.getState().getCachedAnalysis('k', savedAt + 1)).toBeNull();
  });
});

describe('대화 기억 — 서버가 만드는 프롬프트', () => {
  it('예전 앱 요청(새 칸 없음)도 그대로 받는다', () => {
    const parsed = CoachRequestSchema.safeParse({ crush, user, tone: 'natural', text: '안녕', history: [{ userNote: 'a', coachSummary: 'b', chosenReply: 'c' }] });
    expect(parsed.success).toBe(true);
  });

  it('제안한 답장·읽어낸 포인트·앞 대화의 요청을 맥락에 싣는다', () => {
    const parsed = CoachRequestSchema.parse({
      crush,
      user,
      tone: 'natural',
      text: '2번 답장 좀 더 짧게',
      earlierNotes: ['앞으로 이모지는 빼 줘'],
      history: [{ userNote: '(대화 캡처 업로드)', coachSummary: '관심이 있어 보여요', insights: ['먼저 질문함', '답장이 빠름'], replies: ['첫째', '둘째', '셋째'] }],
    });
    const context = buildContextText(parsed);
    expect(context).toContain('[더 앞선 대화에서 사용자가 한 말 (오래된 순) — 요청이었다면 계속 지킬 것]\n- 앞으로 이모지는 빼 줘');
    expect(context).toContain('코치가 제안한 답장: 1번 "첫째" 2번 "둘째" 3번 "셋째"');
    expect(context).toContain('코치가 읽어낸 포인트: 먼저 질문함; 답장이 빠름');
    // 앞 대화 요청이 최근 맥락보다 앞에 온다 (오래된 순)
    expect(context.indexOf('[더 앞선 대화')).toBeLessThan(context.indexOf('[최근 코칭 맥락'));
    // 지시문에 「앞의 요청을 계속 지키라」는 규칙이 있다 — 예전 앱(새 칸 없음) 요청에도 적용된다
    expect(COACH_SYSTEM_PROMPT).toContain('사용자가 바꾸기 전까지 이번 답에도 계속 지키세요');
    expect(buildCoachTask(parsed).system).toBe(COACH_SYSTEM_PROMPT);
  });

  it('지난 기록 칸이 너무 길면 거절하지 않고 잘라서 받는다', () => {
    const parsed = CoachRequestSchema.parse({ crush, user, tone: 'natural', earlierNotes: ['가'.repeat(900)], history: [{ replies: ['나'.repeat(900)], insights: ['다'.repeat(900)] }] });
    expect(parsed.earlierNotes?.[0]).toHaveLength(200);
    expect(parsed.history[0].replies?.[0]).toHaveLength(300);
    expect(parsed.history[0].insights?.[0]).toHaveLength(200);
  });

  it('맥락이 없으면 새 블록도 없다', () => {
    const context = buildContextText(CoachRequestSchema.parse({ crush, user, tone: 'natural' }));
    expect(context).not.toContain('[더 앞선 대화');
    expect(context).not.toContain('[최근 코칭 맥락');
  });
});
