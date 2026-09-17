import { CoachRequestSchema, buildContextText, buildMessageContent, buildUserText } from '@/lib/coach-schema';
import { AGE_GUIDES, MBTI_PROFILES, ageBand, pairDynamics , retrieveKnowledge } from '@/lib/knowledge';
import { analysisCacheKey } from '@/store/app-store';

describe('knowledge base', () => {
  it('covers all 16 MBTI types with every field filled', () => {
    const types = ['ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'];
    for (const t of types) {
      const p = MBTI_PROFILES[t];
      expect(p).toBeDefined();
      for (const v of Object.values(p)) expect((v as string).length).toBeGreaterThan(10);
    }
    expect(Object.keys(AGE_GUIDES)).toHaveLength(6);
  });

  it('maps ages to bands', () => {
    expect(ageBand(19)).toBe('teen');
    expect(ageBand(22)).toBe('early20s');
    expect(ageBand(27)).toBe('late20s');
    expect(ageBand(33)).toBe('early30s');
    expect(ageBand(38)).toBe('late30s');
    expect(ageBand(45)).toBe('forties');
    expect(ageBand(undefined)).toBeNull();
  });

  it('derives pair dynamics from letters', () => {
    const notes = pairDynamics('ISFJ', 'ENTP');
    expect(notes.join(' ')).toContain('상대는 내향');
    expect(notes.join(' ')).toContain('상대는 F, 나는 T');
    expect(notes.join(' ')).toContain('상대는 J');
    expect(pairDynamics('ENFP', undefined)).toEqual([]);
  });

  it('retrieves only the relevant sections', () => {
    const text = retrieveKnowledge({ crush: { mbti: 'istj', age: 33, relationship: 'blind_date', gender: 'male' }, user: { mbti: 'ENFP', age: 29 } });
    expect(text).toContain('[상대 MBTI ISTJ 참고]');
    expect(text).toContain('30대 초반');
    expect(text).toContain('소개팅');
    expect(text).toContain('[나(ENFP)의 성향 참고]');
    expect(text).toContain('연상');
    expect(text).not.toContain('ENTP');
  });

  it('falls back to dimension notes for unknown 4-letter codes and handles missing data', () => {
    const text = retrieveKnowledge({ crush: { mbti: 'XNTQ', relationship: 'talking', gender: 'female' }, user: {} });
    expect(text).toContain('직관(N)');
    expect(text).toContain('[관계 단계 참고]');
  });
});

describe('prompt assembly with knowledge', () => {
  const req = CoachRequestSchema.parse({
    crush: { name: '민지', gender: 'female', age: 26, mbti: 'ENFP', relationship: 'talking', style: [], notes: '' },
    user: { name: '지훈', gender: 'male', age: 28, mbti: 'ISTJ', style: [] },
    tone: 'natural',
    text: '주말에 만나자고 하고 싶어',
    image: { base64: 'QUJD', mediaType: 'image/jpeg' },
  });

  it('puts context text before the image and the task after it', () => {
    const content = buildMessageContent(req);
    expect(content.map((c) => c.type)).toEqual(['text', 'image', 'text']);
    expect((content[0] as { text: string }).text).toContain('[코치 참고 자료');
    expect((content[2] as { text: string }).text).toContain('[이번 요청]');
  });

  it('keeps context identical across turns with different questions (cache-friendly)', () => {
    const a = buildContextText(req);
    const b = buildContextText({ ...req, text: '다른 질문', tone: 'flirty' });
    expect(a).toBe(b);
    expect(buildUserText(req)).toContain('ENFP');
  });
});

describe('analysisCacheKey', () => {
  it('is stable for the same input and differs otherwise', () => {
    const base = { crushId: 'c1', tone: 'natural', text: '안녕 ', imageBase64: 'abc' };
    expect(analysisCacheKey(base)).toBe(analysisCacheKey({ ...base, text: '안녕' }));
    expect(analysisCacheKey(base)).not.toBe(analysisCacheKey({ ...base, tone: 'flirty' }));
    expect(analysisCacheKey(base)).not.toBe(analysisCacheKey({ ...base, variation: true }));
  });
});
