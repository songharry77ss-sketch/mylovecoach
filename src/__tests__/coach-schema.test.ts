import {
  CoachAnalysisReadSchema,
  CoachAnalysisSchema,
  CoachRequestSchema,
  buildMessageContent,
  buildUserText,
  coachOutputJsonSchema,
  crushToRequest,
  normalizeAnalysis,
} from '@/lib/coach-schema';
import type { Crush } from '@/lib/types';

const baseRequest = {
  crush: { name: '민지', gender: 'female' as const, age: 26, mbti: 'ENFP', relationship: 'talking' as const, style: ['리액션 부자'], notes: '헬스장에서 만남' },
  user: { name: '지훈', gender: 'male' as const, age: 28, mbti: 'ISTJ', style: ['낯가림'] },
  tone: 'flirty' as const,
  text: '주말에 만나자고 하고 싶어',
  history: [{ userNote: '첫 메시지 뭐라고 보낼까?', coachSummary: '가볍게 공통 관심사로 시작해보세요.', chosenReply: '오늘 헬스장 갔어?' }],
};

describe('CoachRequestSchema', () => {
  it('accepts a valid request and defaults history', () => {
    const parsed = CoachRequestSchema.parse({ ...baseRequest, history: undefined });
    expect(parsed.history).toEqual([]);
    expect(parsed.tone).toBe('flirty');
  });

  it('rejects unknown tone', () => {
    expect(() => CoachRequestSchema.parse({ ...baseRequest, tone: 'angry' })).toThrow();
  });

  it('rejects unsupported image media type', () => {
    expect(() => CoachRequestSchema.parse({ ...baseRequest, image: { base64: 'abc', mediaType: 'image/bmp' } })).toThrow();
  });
});

describe('prompt building', () => {
  it('includes profile, history and task blocks', () => {
    const req = CoachRequestSchema.parse(baseRequest);
    const text = buildUserText(req);
    expect(text).toContain('[상대방 프로필]');
    expect(text).toContain('민지');
    expect(text).toContain('ENFP');
    expect(text).toContain('썸 타는 중');
    expect(text).toContain('[사용자(나) 프로필]');
    expect(text).toContain('[최근 코칭 맥락');
    expect(text).toContain('오늘 헬스장 갔어?');
    expect(text).toContain('설레게');
    expect(text).toContain('주말에 만나자고 하고 싶어');
  });

  it('orders content as context text → image → task text', () => {
    const req = CoachRequestSchema.parse({ ...baseRequest, image: { base64: 'QUJD', mediaType: 'image/jpeg' } });
    const content = buildMessageContent(req);
    expect(content.map((c) => c.type)).toEqual(['text', 'image', 'text']);
  });

  it('asks for opener when there is no image and no text', () => {
    const req = CoachRequestSchema.parse({ ...baseRequest, text: undefined });
    expect(buildUserText(req)).toContain('첫 메시지');
  });
});

describe('output schema', () => {
  it('produces a strict JSON schema for structured outputs', () => {
    const schema = coachOutputJsonSchema() as { additionalProperties?: boolean; required?: string[]; properties: Record<string, unknown> };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(
      expect.arrayContaining(['callName', 'speechLevel', 'summary', 'temperature', 'interestScore', 'heatDelta', 'insights', 'replies', 'nextStep', 'warnings']),
    );
  });

  it('normalizes score range and list sizes (예전 서버 응답 형태도 받는다)', () => {
    const raw = CoachAnalysisReadSchema.parse({
      summary: '좋아요',
      temperature: 'warm',
      interestScore: 143.7,
      insights: ['a', ' ', 'b', 'c', 'd', 'e', 'f'],
      replies: [
        { tone: 'natural', text: '안녕', why: '가벼움' },
        { tone: 'flirty', text: '  ', why: '빈 값' },
        { tone: 'witty', text: 'ㅋㅋ', why: '유머' },
        { tone: 'cool', text: '굿', why: '쿨' },
        { tone: 'sincere', text: '진심', why: '진심' },
      ],
      nextStep: '약속 잡기',
      warnings: [],
    });
    const n = normalizeAnalysis(raw);
    expect(n.interestScore).toBe(100);
    expect(n.insights).toHaveLength(5);
    expect(n.replies).toHaveLength(3);
    expect(n.replies.map((r) => r.text)).toEqual(['안녕', 'ㅋㅋ', '굿']);
  });

  it('clears score when temperature is unknown', () => {
    const n = normalizeAnalysis({ summary: '', temperature: 'unknown', interestScore: 50, insights: [], replies: [], nextStep: '', warnings: [] });
    expect(n.interestScore).toBeNull();
  });
});

describe('호칭 · 말투 · 이모지 · 누적 온도', () => {
  it('직접 정한 호칭·말투가 있으면 그것을, 없으면 캡처에서 읽은 값을 보낸다', () => {
    const base: Crush = { id: 'c1', name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '', createdAt: 0, updatedAt: 0, heat: 23 };
    expect(crushToRequest({ ...base, detected: { callName: '언니', speech: 'polite', at: 1 } })).toEqual(
      expect.objectContaining({ callName: '언니', callNameFixed: false, speech: 'polite', speechFixed: false, heat: 23 }),
    );
    expect(crushToRequest({ ...base, callName: '민지야', speech: 'casual', detected: { callName: '언니', speech: 'polite', at: 1 } })).toEqual(
      expect.objectContaining({ callName: '민지야', callNameFixed: true, speech: 'casual', speechFixed: true }),
    );
    expect(crushToRequest({ ...base, speech: 'auto' })).not.toHaveProperty('speech');
  });

  it('프롬프트에 호칭·말투·이모지·지금 온도가 들어간다', () => {
    const req = CoachRequestSchema.parse({
      ...baseRequest,
      crush: { ...baseRequest.crush, callName: '언니', callNameFixed: false, speech: 'polite', speechFixed: true, heat: 41, goal: '첫 약속 잡기' },
      user: { ...baseRequest.user, vibes: ['여유로운'], goal: '올해 안에 연애 시작', about: '러닝 좋아함' },
      emoji: 'on',
    });
    const text = buildUserText(req);
    expect(text).toContain('[내가 부르는 호칭] 언니 (지난 대화에서 읽음)');
    expect(text).toContain('[말투] 존댓말 (직접 정함)');
    expect(text).toContain('[이모지: 넣기]');
    expect(text).toContain('[지금 누적 온도] 41°');
    expect(text).toContain('추구미(보이고 싶은 모습): 여유로운');
    expect(text).toContain('이 사람과의 목표: 첫 약속 잡기');
  });

  it('말투 근거가 없으면 관계 단계 기본 말투로 모든 답장을 통일하라고 적는다', () => {
    const casual = buildUserText(CoachRequestSchema.parse({ ...baseRequest, text: '주말에 보자고 할까' }));
    expect(casual).toContain('모든 답장을 반말로 통일');
    const polite = buildUserText(CoachRequestSchema.parse({ ...baseRequest, crush: { ...baseRequest.crush, relationship: 'blind_date' } }));
    expect(polite).toContain('모든 답장을 존댓말로 통일');
    const fixed = buildUserText(CoachRequestSchema.parse({ ...baseRequest, crush: { ...baseRequest.crush, speech: 'polite', speechFixed: true } }));
    expect(fixed).toContain('[이번 답장 말투] 모든 답장을 존댓말로');
  });

  it('새 항목을 정리한다 (온도 변화 ±20, 성공 확률 1~99, 호칭 따옴표 제거)', () => {
    const raw = CoachAnalysisSchema.parse({
      callName: ' "언니" ',
      speechLevel: 'polite',
      summary: '좋아요',
      temperature: 'hot',
      interestScore: 80,
      heatDelta: 37.4,
      insights: ['a'],
      replies: [{ tone: 'natural', text: '언니 저도요!', why: '공감', expectedReaction: 'ㅋㅋ 그쵸', successRate: 120 }],
      nextStep: '',
      warnings: [],
    });
    const n = normalizeAnalysis(raw);
    expect(n.callName).toBe('언니');
    expect(n.heatDelta).toBe(20);
    expect(n.replies[0].successRate).toBe(99);
  });
});
