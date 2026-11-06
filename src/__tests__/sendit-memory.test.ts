/**
 * 「센딧이 기억하는 이야기」 — 대화방마다 오래 가는 기억(Crush.memory.facts).
 * 요청: 상대 정보에 기억을 싣고(코칭·상대 분석 보고서), 오늘 날짜와 「기억: 남기지 않음」(비밀 상담·다른 답장)을 알린다.
 * 응답: 코치가 이번 대화까지 고친 전체 기억(memory)을 돌려주고, 앱은 새 결과일 때만 저장한다.
 */
import { buildTask, jsonSchemaOf, parseAiRequest } from '@/lib/ai-tasks';
import {
  COACH_SYSTEM_PROMPT,
  CoachAnalysisReadSchema,
  CoachAnalysisSchema,
  CoachRequestSchema,
  MEMORY_MAX,
  buildContextText,
  buildTaskBlock,
  crushToRequest,
  normalizeAnalysis,
  todayLabel,
  userToRequest,
} from '@/lib/coach-schema';
import { toGeminiSchema } from '@/lib/gemini';
import type { Crush } from '@/lib/types';
import { memoryAfterResult, reportProfileKey, useAppStore } from '@/store/app-store';

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

const crush = { name: '민지', gender: 'female' as const, relationship: 'talking' as const, style: [], notes: '' };
const user = { name: '지훈', gender: 'male' as const, style: [] };
const facts = ['민지는 성수 카페를 좋아함', '11/1(토) 첫 만남에서 전시를 봄', '민지가 "다음엔 파스타 먹자"고 함'];

describe('센딧이 기억하는 이야기 — 요청과 프롬프트', () => {
  it('상대 정보에 기억을 싣고, 코칭 프롬프트에는 참고 자료 뒤·지난 대화 앞에 한 번만 둔다', () => {
    const parsed = CoachRequestSchema.parse({
      crush: { ...crush, memory: facts },
      user,
      tone: 'natural',
      text: '이번 주말 뭐 하자고 할까',
      earlierNotes: ['이모지는 빼 줘'],
      history: [{ userNote: '안녕', coachSummary: '좋아요' }],
      today: '11/6(목)',
    });
    const context = buildContextText(parsed);
    expect(context).toContain('[센딧이 기억하는 이 사람과의 이야기 (오래된 순) — 지난 대화에서 알게 된 사실]\n- 민지는 성수 카페를 좋아함\n- 11/1(토) 첫 만남에서 전시를 봄');
    expect(context.split('[센딧이 기억하는').length).toBe(2);
    expect(context.indexOf('[상대방 프로필]')).toBeLessThan(context.indexOf('[센딧이 기억하는'));
    expect(context.indexOf('[센딧이 기억하는')).toBeLessThan(context.indexOf('[더 앞선 대화'));
    expect(context.indexOf('[센딧이 기억하는')).toBeLessThan(context.indexOf('[최근 코칭 맥락'));
    const task = buildTaskBlock(parsed);
    expect(task).toContain('- [오늘] 11/6(목)');
    expect(task).not.toContain('[기억: 남기지 않음]');
  });

  it('지시문: 기억을 이어서 쓰고, 이번 대화까지 고친 전체 목록을 돌려주며, 요청·추측·개인정보는 담지 않는다', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('센딧');
    expect(COACH_SYSTEM_PROMPT).not.toContain('나만의 연애코치');
    expect(COACH_SYSTEM_PROMPT).toContain('[센딧이 기억하는 이 사람과의 이야기]');
    expect(COACH_SYSTEM_PROMPT).toContain(`최대 ${MEMORY_MAX}개, 각 40~60자의 짧은 한 문장`);
    expect(COACH_SYSTEM_PROMPT).toContain('답장 말투·길이·이모지 같은 사용자의 요청(따로 기억함)');
    expect(COACH_SYSTEM_PROMPT).toContain('확실하지 않은 추측');
    expect(COACH_SYSTEM_PROMPT).toContain('연락처·주소·계좌 같은 개인정보');
    expect(COACH_SYSTEM_PROMPT).toContain('[기억: 남기지 않음]이면 memory를 빈 배열로');
  });

  it('비밀 상담·다른 답장은 「기억: 남기지 않음」으로 보낸다', () => {
    const task = buildTaskBlock(CoachRequestSchema.parse({ crush, user, tone: 'natural', text: '안녕', remember: false, today: '11/6(금)' }));
    expect(task).toContain('[기억: 남기지 않음]');
  });

  it('예전 앱 요청(기억·오늘 없음)은 기억 블록 없이 그대로 받는다', () => {
    const parsed = CoachRequestSchema.parse({ crush, user, tone: 'natural', text: '안녕' });
    expect(buildContextText(parsed)).not.toContain('[센딧이 기억하는');
    expect(buildTaskBlock(parsed)).not.toContain('[오늘]');
    // 예전 앱은 기억을 읽지 않으니 모델이 기억을 쓰지 않게 한다 (출력 토큰 절약)
    expect(buildTaskBlock(parsed)).toContain('[기억: 남기지 않음]');
  });

  it('저장해 둔 기억이 길면 거절하지 않고 잘라서 받고, 줄 수는 12줄까지', () => {
    const parsed = CoachRequestSchema.parse({ crush: { ...crush, memory: ['가'.repeat(500)] }, user, tone: 'natural' });
    expect(parsed.crush.memory?.[0]).toHaveLength(200);
    const tooMany = { crush: { ...crush, memory: Array.from({ length: 13 }, (_, i) => `${i}`) }, user, tone: 'natural' };
    expect(CoachRequestSchema.safeParse(tooMany).success).toBe(false);
  });

  it('상대 분석 보고서에도 기억이 같이 간다', () => {
    const parsed = parseAiRequest({ mode: 'report', crush: { ...crush, memory: facts }, user, sessions: [], heatLog: [] });
    if (!parsed.ok) throw new Error('보고서 요청이 거절됐어요');
    const context = buildTask(parsed).context;
    expect(context).toContain('[센딧이 기억하는 이 사람과의 이야기');
    expect(context).toContain('민지가 "다음엔 파스타 먹자"고 함');
  });

  it('앱은 기억을 상대 정보에 싣는다 — 최근 8줄까지, 비밀 상담은 싣지 않는다', () => {
    const base: Crush = { id: 'c1', name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '', createdAt: 0, updatedAt: 0 };
    const many = Array.from({ length: 10 }, (_, i) => `사실${i + 1}`);
    expect(crushToRequest({ ...base, memory: { facts: many, at: 1 } }).memory).toEqual(many.slice(-8));
    expect(crushToRequest({ ...base, secret: true, memory: { facts: ['비밀'], at: 1 } }).memory).toBeUndefined();
    expect(crushToRequest(base).memory).toBeUndefined();
    // 기억만 바뀌어서는 상대 분석 보고서를 「바뀐 정보로 다시 분석」으로 열지 않는다
    const profile = (c: Crush) => ({ crush: crushToRequest(c), user: userToRequest({ ...user, defaultTone: 'natural', createdAt: 0 }) });
    expect(reportProfileKey(profile({ ...base, memory: { facts: ['a'], at: 1 } }))).toBe(reportProfileKey(profile(base)));
  });

  it('오늘 날짜는 「11/6(금)」처럼 기기 날짜로', () => {
    expect(todayLabel(new Date(2026, 10, 6, 21, 0))).toBe('11/6(금)');
    expect(todayLabel(new Date(2026, 10, 8))).toBe('11/8(일)');
  });
});

describe('센딧이 기억하는 이야기 — 응답', () => {
  const raw = { callName: null, speechLevel: 'casual', summary: '좋아요', temperature: 'warm', interestScore: 60, heatDelta: 4, insights: [], replies: [], nextStep: '', warnings: [] };

  it('모델에게 주는 출력 형식에 memory 가 꼭 써야 하는 칸으로, 맨 끝 순서로 들어간다 (Gemini 형식도)', () => {
    const json = jsonSchemaOf(CoachAnalysisSchema) as { required: string[]; properties: Record<string, { type: string }> };
    expect(json.required).toContain('memory');
    expect(json.properties.memory.type).toBe('array');
    const gemini = toGeminiSchema(json as unknown as Record<string, unknown>) as {
      required: string[];
      propertyOrdering: string[];
      properties: Record<string, { type: string; items: { type: string }; default?: unknown }>;
    };
    expect(gemini.required).toContain('memory');
    expect(gemini.properties.memory.items.type).toBe('string');
    expect(gemini.properties.memory.default).toBeUndefined();
    expect(gemini.propertyOrdering[gemini.propertyOrdering.length - 1]).toBe('memory');
  });

  it('모델이 memory 를 빠뜨려도 서버는 실패로 돌려보내지 않고 빈 목록으로 받는다', () => {
    const parsed = CoachAnalysisSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.memory).toEqual([]);
  });

  it('예전 서버 응답(memory 없음)은 앱에서 「없음」으로 읽는다 — 빈 목록으로 기억을 지우지 않게', () => {
    expect(normalizeAnalysis(CoachAnalysisReadSchema.parse(raw)).memory).toBeUndefined();
  });

  it('기억 줄 정리 — 글머리표·번호·공백을 지우고, 같은 줄은 한 번, 너무 길면 자르고, 8줄을 넘으면 최근 것만', () => {
    const tidy = (memory: string[]) => normalizeAnalysis(CoachAnalysisReadSchema.parse({ ...raw, memory })).memory ?? [];
    const few = tidy(['- 민지는  카페를 좋아함', '1. 토요일 약속', '민지는 카페를 좋아함.', '  ', '가'.repeat(150)]);
    expect(few[0]).toBe('민지는 카페를 좋아함');
    expect(few[1]).toBe('토요일 약속');
    expect(few).toHaveLength(3);
    expect(Array.from(few[2])).toHaveLength(100);
    const many = tidy(['오래된 일', ...Array.from({ length: 8 }, (_, i) => `최근${i + 1}`)]);
    expect(many).toHaveLength(MEMORY_MAX);
    expect(many[0]).toBe('최근1');
    expect(many[MEMORY_MAX - 1]).toBe('최근8');
  });
});

describe('센딧이 기억하는 이야기 — 앱에 저장', () => {
  beforeEach(() => useAppStore.getState().resetAll());

  const addCrush = (secret = false) => useAppStore.getState().addCrush({ name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '', ...(secret ? { secret: true } : {}) }).id;

  it('결과의 기억을 저장하고, 빈 결과·예전 서버 응답·그대로인 기억은 지금 기억을 그대로 둔다', () => {
    expect(memoryAfterResult(undefined, undefined, ['민지는 카페를 좋아함'])).toEqual(['민지는 카페를 좋아함']);
    expect(memoryAfterResult(['a'], ['a'], ['a', 'b'])).toEqual(['a', 'b']);
    expect(memoryAfterResult(['a'], ['a'], [])).toBeNull();
    expect(memoryAfterResult(['a'], ['a'], undefined)).toBeNull();
    expect(memoryAfterResult(['a'], ['a'], ['a'])).toBeNull();
  });

  it('보낸 뒤 사용자가 기억을 지웠으면 이번 결과로 되살리지 않는다', () => {
    expect(memoryAfterResult(['a', 'b'], ['a'], ['a', 'b', 'c'])).toBeNull();
    expect(memoryAfterResult(['a', 'b'], undefined, ['a', 'b', 'c'])).toBeNull();
  });

  it('줄 하나 지우기·모두 지우기, 8줄 넘게 넣으면 최근 8줄만', () => {
    const id = addCrush();
    const s = useAppStore.getState();
    s.setCrushMemory(id, Array.from({ length: 10 }, (_, i) => `사실${i + 1}`));
    expect(useAppStore.getState().crushes[id].memory?.facts).toEqual(Array.from({ length: 8 }, (_, i) => `사실${i + 3}`));
    const kept = useAppStore.getState().crushes[id].memory?.facts ?? [];
    s.setCrushMemory(
      id,
      kept.filter((f) => f !== '사실5'),
    );
    expect(useAppStore.getState().crushes[id].memory?.facts).not.toContain('사실5');
    expect(useAppStore.getState().crushes[id].memory?.facts).toHaveLength(7);
    s.setCrushMemory(id, null);
    expect(useAppStore.getState().crushes[id].memory).toBeUndefined();
    s.setCrushMemory(id, ['다시']);
    s.setCrushMemory(id, []);
    expect(useAppStore.getState().crushes[id].memory).toBeUndefined();
  });

  it('비밀 상담은 기억하지 않는다', () => {
    const id = addCrush(true);
    useAppStore.getState().setCrushMemory(id, ['비밀 얘기']);
    expect(useAppStore.getState().crushes[id].memory).toBeUndefined();
  });

  it('모든 데이터 삭제면 기억도 사라진다', () => {
    const id = addCrush();
    useAppStore.getState().setCrushMemory(id, ['민지는 카페를 좋아함']);
    useAppStore.getState().resetAll();
    expect(useAppStore.getState().crushes[id]).toBeUndefined();
  });
});
