import { normalizeMind, normalizePractice } from '@/lib/ai-schemas';
import { buildTask, parseAiRequest } from '@/lib/ai-tasks';
import { buildGeminiTaskBody } from '@/lib/gemini';
import type { CoachAnalysis } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

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

const user = { name: '지훈', gender: 'male' as const, style: [] };
const crush = { name: '민지', gender: 'female' as const, relationship: 'talking' as const, style: [], notes: '' };

describe('AI 요청 모드', () => {
  it('mode 가 없으면 예전 앱의 코칭 요청으로 받는다', () => {
    const parsed = parseAiRequest({ crush, user, tone: 'natural', text: '안녕' });
    expect(parsed.ok && parsed.mode).toBe('coach');
  });

  it('모드별로 다른 프롬프트와 출력 형식을 만든다', () => {
    const report = parseAiRequest({ mode: 'report', crush: { ...crush, heat: 30 }, user, sessions: [{ at: 1, summary: '좋은 분위기', insights: ['먼저 연락'], temperature: 'warm' }] });
    const mind = parseAiRequest({ mode: 'mind', situation: '읽고 답이 없어요', perspective: 'male' });
    const practice = parseAiRequest({
      mode: 'practice',
      persona: { name: '민지', gender: 'female', age: 28, mbti: 'ENFP', job: '마케터', style: [], relationship: 'blind_date', scenario: '소개팅 다음 날', speech: 'polite', difficulty: 2 },
      user,
      heat: 5,
      turns: [
        { role: 'them', text: '어제 잘 들어가셨어요?' },
        { role: 'me', text: '네! 덕분에 즐거웠어요 ㅎㅎ' },
      ],
    });
    for (const p of [report, mind, practice]) expect(p.ok).toBe(true);
    if (!report.ok || !mind.ok || !practice.ok) return;
    const r = buildTask(report);
    expect(r.context).toContain('[코칭 기록 (오래된 순)]');
    expect(r.context).toContain('좋은 분위기');
    const m = buildTask(mind);
    expect(m.context).toContain('남자');
    expect(m.task).toContain('읽고 답이 없어요');
    const pr = buildTask(practice);
    expect(pr.context).toContain('[상대역 말투] 존댓말');
    expect(pr.task).toContain('나: 네! 덕분에 즐거웠어요 ㅎㅎ');
    // Gemini 본문에 모드별 출력 형식이 들어간다
    const body = buildGeminiTaskBody(pr);
    expect(Object.keys((body.generationConfig.responseSchema as { properties: object }).properties)).toEqual(['replies', 'heatDelta', 'mood', 'feedback', 'better', 'ended']);
  });

  it('잘못된 요청은 거절한다', () => {
    expect(parseAiRequest({ mode: 'mind', situation: '', perspective: 'male' }).ok).toBe(false);
    expect(parseAiRequest({ mode: 'practice', persona: {}, user, heat: 0, turns: [] }).ok).toBe(false);
  });
});

describe('출력 정리', () => {
  it('속마음 가능성은 합이 100 이 되도록 맞추고 큰 순서로', () => {
    const m = normalizeMind({
      headline: 'h',
      innerVoice: 'v',
      possibilities: [
        { label: 'a', percent: 20, reason: '' },
        { label: 'b', percent: 50, reason: '' },
        { label: 'c', percent: 40, reason: '' },
      ],
      advice: '',
      sampleReply: ' ',
    });
    expect(m.possibilities.reduce((s, p) => s + p.percent, 0)).toBe(100);
    expect(m.possibilities[0].label).toBe('b');
    expect(m.sampleReply).toBe('');
  });

  it('연습 온도 변화는 ±15 안으로, 말풍선은 3개까지', () => {
    const p = normalizePractice({ replies: ['a', ' ', 'b', 'c', 'd'], heatDelta: -40, mood: '', feedback: 'f', better: ' ', ended: false });
    expect(p.replies).toEqual(['a', 'b', 'c']);
    expect(p.heatDelta).toBe(-15);
    expect(p.mood).toBe('🙂');
  });
});

describe('누적 호감 온도 · 비밀 상담', () => {
  const analysis = (patch: Partial<CoachAnalysis> = {}): CoachAnalysis => ({
    summary: 's',
    temperature: 'warm',
    interestScore: 60,
    insights: [],
    replies: [],
    nextStep: '',
    warnings: [],
    ...patch,
  });

  beforeEach(() => useAppStore.getState().resetAll());

  it('0°에서 시작해 분석마다 오르내리고, 캡처에서 읽은 호칭·말투를 기억한다', () => {
    const s = useAppStore.getState();
    const c = s.addCrush({ name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' });
    expect(useAppStore.getState().crushes[c.id].heat).toBe(0);
    const m1 = s.addMessage({ crushId: c.id, role: 'coach', pending: true });
    s.completeAnalysis(c.id, m1.id, analysis({ heatDelta: 12, callName: '언니', speechLevel: 'polite' }), { applyHeat: true });
    let crushNow = useAppStore.getState().crushes[c.id];
    expect(crushNow.heat).toBe(12);
    expect(crushNow.detected).toEqual(expect.objectContaining({ callName: '언니', speech: 'polite' }));
    expect(useAppStore.getState().messages[c.id][0].heat).toEqual({ before: 0, after: 12, delta: 12 });

    const m2 = s.addMessage({ crushId: c.id, role: 'coach', pending: true });
    s.completeAnalysis(c.id, m2.id, analysis({ heatDelta: -40 }), { applyHeat: true });
    crushNow = useAppStore.getState().crushes[c.id];
    // -20° 밑으로는 내려가지 않는다
    expect(crushNow.heat).toBe(-20);
    expect(crushNow.heatLog?.map((h) => h.value)).toEqual([12, -20]);

    // 다른 답장 더 보기 등은 온도를 움직이지 않는다
    const m3 = s.addMessage({ crushId: c.id, role: 'coach', pending: true });
    s.completeAnalysis(c.id, m3.id, analysis({ heatDelta: 10 }), { applyHeat: false });
    expect(useAppStore.getState().crushes[c.id].heat).toBe(-20);

    // 글만 보낸 요청의 말투는 추측이라 기억하지 않는다 (호칭은 기억)
    const m4 = s.addMessage({ crushId: c.id, role: 'coach', pending: true });
    s.completeAnalysis(c.id, m4.id, analysis({ callName: '언니', speechLevel: 'casual' }), { fromCapture: false });
    expect(useAppStore.getState().crushes[c.id].detected).toEqual(expect.objectContaining({ callName: '언니', speech: 'polite' }));
  });

  it('예전 서버 응답(온도 변화 없음)은 분위기로 대신 움직인다', () => {
    const s = useAppStore.getState();
    const c = s.addCrush({ name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' });
    const m = s.addMessage({ crushId: c.id, role: 'coach', pending: true });
    s.completeAnalysis(c.id, m.id, analysis({ temperature: 'hot' }), { applyHeat: true });
    expect(useAppStore.getState().crushes[c.id].heat).toBe(10);
  });

  it('비밀 상담 채팅방은 저장소에 쓰지 않는다', () => {
    const s = useAppStore.getState();
    const normal = s.addCrush({ name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' });
    const secret = s.createSecretChat();
    s.addMessage({ crushId: secret, role: 'user', text: '비밀 질문' });
    const persist = (useAppStore as unknown as { persist: { getOptions: () => { partialize: (st: unknown) => { crushes: object; messages: object } } } }).persist;
    const saved = persist.getOptions().partialize(useAppStore.getState());
    expect(Object.keys(saved.crushes)).toEqual([normal.id]);
    expect(saved.messages).not.toHaveProperty(secret);
  });

  it('연습은 0°에서 시작하고 결과만큼 움직인다', () => {
    const s = useAppStore.getState();
    const id = s.startPractice({
      id: 'p',
      name: '민지',
      emoji: '🌻',
      gender: 'female',
      age: 28,
      mbti: 'ENFP',
      job: '',
      style: [],
      relationship: 'talking',
      scenario: '',
      opener: '뭐해? ㅋㅋ',
      speech: 'casual',
      difficulty: 1,
      hint: '',
      color: '#fff',
    });
    expect(useAppStore.getState().practice[id].turns[0]).toEqual(expect.objectContaining({ role: 'them', text: '뭐해? ㅋㅋ' }));
    s.applyPracticeResult(id, 7, '😊', false);
    expect(useAppStore.getState().practice[id]).toEqual(expect.objectContaining({ heat: 7, mood: '😊', charged: true }));
  });
});
