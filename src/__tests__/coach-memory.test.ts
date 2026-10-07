import { buildCoachTask } from '@/lib/ai-tasks';
import { COACH_SYSTEM_PROMPT, CoachRequestSchema, buildContextText, buildTaskBlock } from '@/lib/coach-schema';
import type { ChatMessage, CoachAnalysis } from '@/lib/types';
import { HISTORY_TURNS, buildEarlierNotes, buildHistory, lastRequestAt, turnRequestOf, useAppStore, variationTargetOf } from '@/store/app-store';

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
      msg({ role: 'user', text: '🔄 다른 답장 더 보기', variationOf: 'x' }),
      msg({ role: 'coach', analysis: analysis('다른 답장') }),
      ...chat(8),
    ];
    // 최근 8턴은 history 로 가고, 그 앞 3턴 중 직접 쓴 글은 첫 번째뿐 (캡처만 올린 턴·「다른 답장」 자동 문구는 뺀다)
    expect(buildEarlierNotes(list)).toEqual(['앞으로 답장은 이모지 빼고 짧게 해 줘']);
    // 대화가 짧으면 전부 history 에 들어가니 따로 모을 것이 없다
    expect(buildEarlierNotes(chat(5))).toEqual([]);
    // 아주 긴 글은 잘라서 싣는다
    const long = buildEarlierNotes([msg({ role: 'user', text: '가'.repeat(500) }), ...chat(8)]);
    expect(Array.from(long[0]).length).toBe(161);
  });

  it('잘라도 이모지를 반으로 쪼개지 않는다', () => {
    const text = `${'가'.repeat(159)}💗💗💗`;
    const [note] = buildEarlierNotes([msg({ role: 'user', text }), ...chat(8)]);
    expect(note).toBe(`${'가'.repeat(159)}💗…`);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(note)).toBe(false);
  });

  it('마지막 직접 요청 시각 — 캡처 업로드도 세고, 「다른 답장」 자동 요청은 세지 않는다', () => {
    const typed = msg({ role: 'user', text: '반말로 해 줘' });
    const capture = msg({ role: 'user', imageUri: 'file://b.jpg' });
    expect(lastRequestAt([typed, msg({ role: 'coach', analysis: analysis('네') }), msg({ role: 'user', text: '🔄 다른 답장 더 보기', variationOf: 'q' })])).toBe(typed.createdAt);
    expect(lastRequestAt([typed, capture])).toBe(capture.createdAt);
    expect(lastRequestAt([msg({ role: 'coach', analysis: analysis('네') })])).toBeNull();
  });
});

describe('대화 기억 — 「다른 버전 더 보기」·다시 시도가 고르는 대상', () => {
  it('누른 카드를 만든 그 턴의 요청을 쓴다 (예전처럼 캡처를 찾아 더 앞 턴으로 가지 않는다)', () => {
    const q1 = msg({ role: 'user', imageUri: 'file://a.jpg', text: '이 캡처 봐 줘' });
    const a1 = msg({ role: 'coach', analysis: analysis('캡처 요약', ['가', '나', '다']) });
    const q2 = msg({ role: 'user', text: '그럼 주말에 만나자고 해도 돼?' });
    const a2 = msg({ role: 'coach', analysis: analysis('글 요약', ['라', '마', '바']) });
    const auto = msg({ role: 'user', text: '🔄 다른 답장 더 보기', variationOf: a2.id });
    const a3 = msg({ role: 'coach', analysis: analysis('다른 답장', ['사', '아', '자']) });
    const list = [q1, a1, q2, a2, auto, a3];
    expect(turnRequestOf(list, a2.id)?.id).toBe(q2.id);
    expect(turnRequestOf(list, a1.id)?.id).toBe(q1.id);
    // 「다른 답장」 결과 카드에서 또 누르면 자동 요청을 건너뛰고 그 앞의 실제 요청
    expect(turnRequestOf(list, a3.id)?.id).toBe(q2.id);
  });

  it('실패한 「다른 답장」 다시 시도는 원래 카드를 다시 바꾼다', () => {
    const a1 = msg({ role: 'coach', analysis: analysis('요약1') });
    const a2 = msg({ role: 'coach', analysis: analysis('요약2') });
    const req = msg({ role: 'user', text: '🔄 다른 답장 더 보기', variationOf: a1.id });
    expect(variationTargetOf([a1, a2, req], req)?.id).toBe(a1.id);
    // 예전 메시지(대상 id 없음)는 그 앞의 마지막 결과 카드
    const old = msg({ role: 'user', text: '🔄 다른 답장 더 보기' });
    expect(variationTargetOf([a1, a2, old], old)?.id).toBe(a2.id);
  });
});

describe('대화 기억 — 저장된 결과 재사용', () => {
  beforeEach(() => useAppStore.getState().resetAll());

  it('결과를 만든 뒤 사용자가 새로 요청했으면 저장된 결과를 쓰지 않는다', () => {
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

  it('제안한 답장(화면과 같은 버전 번호)·읽어낸 포인트·앞 대화의 요청을 맥락에 싣는다', () => {
    const parsed = CoachRequestSchema.parse({
      crush,
      user,
      tone: 'natural',
      text: '버전 2 좀 더 짧게',
      earlierNotes: ['앞으로 이모지는 빼 줘'],
      history: [{ userNote: '(대화 캡처 업로드)', coachSummary: '관심이 있어 보여요', insights: ['먼저 질문함', '답장이 빠름'], replies: ['첫째', '둘째', '셋째'] }],
    });
    const context = buildContextText(parsed);
    expect(context).toContain('[더 앞선 대화에서 사용자가 한 말 (오래된 순) — 계속 지켜 달라고 한 요청과 알려 준 정보만 이어서 반영할 것]\n- 앞으로 이모지는 빼 줘');
    expect(context).toContain('코치가 제안한 답장: 버전1 "첫째" 버전2 "둘째" 버전3 "셋째"');
    expect(context).toContain('코치가 읽어낸 포인트: 먼저 질문함; 답장이 빠름');
    // 앞 대화 요청이 최근 맥락보다 앞에 온다 (오래된 순)
    expect(context.indexOf('[더 앞선 대화')).toBeLessThan(context.indexOf('[최근 코칭 맥락'));
    // 지시문 — 예전 앱(새 칸 없음) 요청에도 적용된다
    expect(buildCoachTask(parsed).system).toBe(COACH_SYSTEM_PROMPT);
  });

  it('지시문: 계속 지켜 달라고 한 요청이 앱 설정값(이모지·톤·말투 기본값)보다 우선, 한 번만 한 부탁은 그 턴만, 맥락의 일은 온도에 다시 세지 않음', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('우선순위: 사용자가 이번에 직접 쓴 말 > 앞에서 계속 지켜 달라고 한 요청 > [이번 요청]의 톤·[이모지]·[이번 답장 말투] 같은 앱 설정값');
    expect(COACH_SYSTEM_PROMPT).toContain('"이번엔"처럼 그때 한 번만 한 부탁은 그 턴에만 적용됩니다');
    expect(COACH_SYSTEM_PROMPT).toContain('heatDelta에 다시 세지 말고');
    // 프로필 「직접 정함」 호칭·말투는 여전히 가장 먼저
    expect(COACH_SYSTEM_PROMPT).toContain('프로필의 "직접 정함" 호칭·말투는 지금처럼 가장 먼저 지킵니다');
    // 캡처도 저장된 말투도 없을 때 기본 말투는 앞 대화에서 정한 말투가 있으면 그것
    const task = buildTaskBlock(CoachRequestSchema.parse({ crush, user, tone: 'natural', text: '안녕' }));
    expect(task).toContain('앞 대화에서 정한 말투가 있으면 그것으로');
  });

  it('지난 기록 칸이 너무 길면 거절하지 않고 잘라서 받고, 이모지 반쪽은 버린다', () => {
    const parsed = CoachRequestSchema.parse({ crush, user, tone: 'natural', earlierNotes: ['가'.repeat(900)], history: [{ replies: ['나'.repeat(900)], insights: ['다'.repeat(900)] }] });
    expect(parsed.earlierNotes?.[0]).toHaveLength(200);
    expect(parsed.history[0].replies?.[0]).toHaveLength(300);
    expect(parsed.history[0].insights?.[0]).toHaveLength(200);
    const split = CoachRequestSchema.parse({ crush, user, tone: 'natural', earlierNotes: [`${'가'.repeat(199)}💗`] });
    expect(split.earlierNotes?.[0]).toBe('가'.repeat(199));
  });

  it('맥락이 없으면 새 블록도 없다', () => {
    const context = buildContextText(CoachRequestSchema.parse({ crush, user, tone: 'natural' }));
    expect(context).not.toContain('[더 앞선 대화');
    expect(context).not.toContain('[최근 코칭 맥락');
  });
});
