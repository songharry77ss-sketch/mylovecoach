import {
  CoachAnalysisSchema,
  CoachRequestSchema,
  buildMessageContent,
  buildUserText,
  coachOutputJsonSchema,
  normalizeAnalysis,
} from '@/lib/coach-schema';

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

  it('puts image block before text block', () => {
    const req = CoachRequestSchema.parse({ ...baseRequest, image: { base64: 'QUJD', mediaType: 'image/jpeg' } });
    const content = buildMessageContent(req);
    expect(content[0].type).toBe('image');
    expect(content[1].type).toBe('text');
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
    expect(schema.required).toEqual(expect.arrayContaining(['summary', 'temperature', 'interestScore', 'insights', 'replies', 'nextStep', 'warnings']));
  });

  it('normalizes score range and list sizes', () => {
    const raw = CoachAnalysisSchema.parse({
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
