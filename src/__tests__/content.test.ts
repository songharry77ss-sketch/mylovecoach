import {
  CHAT_QUESTIONS,
  MIND_CARDS,
  MIND_CATEGORIES,
  drawChatQuestions,
  drawMindCard,
  renderSituation,
  themLabel,
} from '@/lib/mind-cards';
import { PERSONAS, personaById, personasFor, type Persona } from '@/lib/personas';
import type { Gender, Relationship } from '@/lib/types';

/** 테스트용 결정적 난수 (mulberry32) */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GENDERS: Gender[] = ['female', 'male', 'other'];
const RELATIONSHIP_KEYS: Relationship[] = ['crush', 'talking', 'blind_date', 'friend', 'dating', 'ex'];
const count = <T>(list: T[], pick: (x: T) => unknown, value: unknown) => list.filter((x) => pick(x) === value).length;

describe('PERSONAS (연애 연습 상대역)', () => {
  it('12명이고 id 가 겹치지 않는다', () => {
    expect(PERSONAS).toHaveLength(12);
    const ids = PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^p_[a-z]+$/);
  });

  it('필수 글자 필드가 비어 있지 않다', () => {
    const textFields: (keyof Persona)[] = ['id', 'name', 'emoji', 'mbti', 'job', 'scenario', 'opener', 'hint', 'color'];
    for (const p of PERSONAS) {
      for (const f of textFields) {
        const v = p[f];
        expect(typeof v).toBe('string');
        expect((v as string).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('각 필드가 정해진 형식을 지킨다', () => {
    for (const p of PERSONAS) {
      expect(Array.from(p.emoji).length).toBeLessThanOrEqual(2);
      expect(p.mbti).toMatch(/^[EI][SN][TF][JP]$/);
      expect(Number.isInteger(p.age)).toBe(true);
      expect(p.age).toBeGreaterThanOrEqual(22);
      expect(p.age).toBeLessThanOrEqual(36);
      expect(p.style.length).toBeGreaterThanOrEqual(2);
      expect(p.style.length).toBeLessThanOrEqual(4);
      expect(new Set(p.style).size).toBe(p.style.length);
      for (const tag of p.style) expect(tag.trim().length).toBeGreaterThan(0);
      expect(RELATIONSHIP_KEYS).toContain(p.relationship);
      expect(['polite', 'casual']).toContain(p.speech);
      expect([1, 2, 3]).toContain(p.difficulty);
      expect(p.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('남녀 6명씩, 난이도는 4명씩 고르게, 관계 6종을 모두 다룬다', () => {
    expect(count(PERSONAS, (p) => p.gender, 'female')).toBe(6);
    expect(count(PERSONAS, (p) => p.gender, 'male')).toBe(6);
    for (const d of [1, 2, 3]) expect(count(PERSONAS, (p) => p.difficulty, d)).toBe(4);
    for (const r of RELATIONSHIP_KEYS) expect(count(PERSONAS, (p) => p.relationship, r)).toBeGreaterThan(0);
    expect(count(PERSONAS, (p) => p.speech, 'polite')).toBeGreaterThan(0);
    expect(count(PERSONAS, (p) => p.speech, 'casual')).toBeGreaterThan(0);
  });

  it('personaById 는 id 로 찾고, 없으면 undefined', () => {
    expect(personaById('p_minji')?.name).toBe('민지');
    for (const p of PERSONAS) expect(personaById(p.id)).toBe(p);
    expect(personaById('p_nobody')).toBeUndefined();
  });

  it('personasFor 는 이성 페르소나를 앞으로, 같은 성별 안에서는 원래 순서를 유지한다', () => {
    const forFemale = personasFor('female');
    expect(forFemale.slice(0, 6).every((p) => p.gender === 'male')).toBe(true);
    expect(forFemale.slice(6).every((p) => p.gender === 'female')).toBe(true);

    const forMale = personasFor('male');
    expect(forMale.slice(0, 6).map((p) => p.id)).toEqual(PERSONAS.filter((p) => p.gender === 'female').map((p) => p.id));
    expect(forMale.slice(6).map((p) => p.id)).toEqual(PERSONAS.filter((p) => p.gender === 'male').map((p) => p.id));
  });

  it('personasFor(other) 는 원래 순서 그대로이고, 원본 배열을 바꾸지 않는다', () => {
    const before = PERSONAS.map((p) => p.id);
    for (const g of GENDERS) {
      const list = personasFor(g);
      expect(list).toHaveLength(12);
      expect(list).not.toBe(PERSONAS);
    }
    expect(personasFor('other').map((p) => p.id)).toEqual(before);
    expect(PERSONAS.map((p) => p.id)).toEqual(before);
  });
});

describe('MIND_CARDS (속마음 카드)', () => {
  it('40개이고 id 가 겹치지 않는다', () => {
    expect(MIND_CARDS).toHaveLength(40);
    const ids = MIND_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('카테고리 5개에 8개씩 들어 있다', () => {
    expect(MIND_CATEGORIES).toEqual(['연락', '썸', '데이트', '연애중', '이별·재회']);
    for (const cat of MIND_CATEGORIES) expect(count(MIND_CARDS, (c) => c.category, cat)).toBe(8);
  });

  it('카드마다 이모지와 {them} 이 든 상황 문장이 있다', () => {
    for (const c of MIND_CARDS) {
      expect(c.emoji.trim().length).toBeGreaterThan(0);
      expect(Array.from(c.emoji).length).toBeLessThanOrEqual(2);
      expect(c.situation).toContain('{them}');
      expect(c.situation.length).toBeLessThanOrEqual(80);
    }
  });

  it('{them} 바로 뒤에 받침 있는 말용 조사(이·은·을·과·으로)를 쓰지 않는다', () => {
    for (const c of MIND_CARDS) expect(c.situation).not.toMatch(/\{them\}(이|은|을|과|으로)/);
  });
});

describe('themLabel / renderSituation', () => {
  it('성별을 남자/여자/상대로 바꾼다', () => {
    expect(themLabel('male')).toBe('남자');
    expect(themLabel('female')).toBe('여자');
    expect(themLabel('other')).toBe('상대');
  });

  it('{them} 을 모두 치환한다', () => {
    for (const c of MIND_CARDS) {
      for (const g of GENDERS) {
        const text = renderSituation(c, g);
        expect(text).not.toMatch(/[{}]/);
        expect(text).toContain(themLabel(g));
      }
    }
    const card = { id: 't', category: '연락' as const, emoji: '💬', situation: '{them}가 먼저, 그리고 {them}의 친구도' };
    expect(renderSituation(card, 'male')).toBe('남자가 먼저, 그리고 남자의 친구도');
  });

  it('예시 카드가 자연스러운 문장이 된다', () => {
    const card = MIND_CARDS.find((c) => c.id === 'text-1');
    expect(card).toBeDefined();
    expect(renderSituation(card!, 'male')).toBe('남자가 "뭐해?"라고만 보내고 2시간째 답이 없어요.');
    expect(renderSituation(card!, 'other')).toBe('상대가 "뭐해?"라고만 보내고 2시간째 답이 없어요.');
  });
});

describe('drawMindCard', () => {
  const allIds = MIND_CARDS.map((c) => c.id);

  it('exclude 에 든 카드는 뽑지 않는다', () => {
    const exclude = allIds.slice(0, 25);
    const rng = seeded(42);
    for (let i = 0; i < 300; i++) expect(exclude).not.toContain(drawMindCard(exclude, rng).id);
  });

  it('하나만 남기면 항상 그 카드가 나온다', () => {
    const keep = allIds[17];
    const exclude = allIds.filter((id) => id !== keep);
    for (const r of [0, 0.25, 0.5, 0.999999]) expect(drawMindCard(exclude, () => r).id).toBe(keep);
  });

  it('전부 제외되면 아무 카드나 돌려준다', () => {
    const card = drawMindCard(allIds, seeded(7));
    expect(allIds).toContain(card.id);
  });

  it('rng 경계값에서도 배열 밖을 가리키지 않는다', () => {
    expect(drawMindCard([], () => 0).id).toBe(allIds[0]);
    expect(drawMindCard([], () => 0.999999).id).toBe(allIds[allIds.length - 1]);
    expect(drawMindCard([], () => 1).id).toBe(allIds[allIds.length - 1]);
    expect(drawMindCard([], () => -0.5).id).toBe(allIds[0]);
    expect(allIds).toContain(drawMindCard().id);
  });

  it('여러 번 뽑으면 다양한 카드가 나온다', () => {
    const rng = seeded(2026);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(drawMindCard([], rng).id);
    expect(seen.size).toBeGreaterThan(30);
  });
});

describe('CHAT_QUESTIONS / drawChatQuestions', () => {
  it('20개이고 겹치지 않으며 모두 {name} 자리가 있다', () => {
    expect(CHAT_QUESTIONS).toHaveLength(20);
    expect(new Set(CHAT_QUESTIONS).size).toBe(20);
    for (const q of CHAT_QUESTIONS) expect(q).toContain('{name}');
  });

  it('count 개를 중복 없이 뽑고 {name} 을 이름으로 바꾼다', () => {
    const rendered = CHAT_QUESTIONS.map((q) => q.split('{name}').join('민지'));
    for (let seed = 1; seed <= 50; seed++) {
      const qs = drawChatQuestions(5, '민지', seeded(seed));
      expect(qs).toHaveLength(5);
      expect(new Set(qs).size).toBe(5);
      for (const q of qs) {
        expect(q).not.toContain('{name}');
        expect(q).toContain('민지');
        expect(rendered).toContain(q);
      }
    }
  });

  it('count 가 전체보다 크면 20개 전부, 0 이하이면 빈 배열', () => {
    const all = drawChatQuestions(100, '준호', seeded(3));
    expect(all).toHaveLength(20);
    expect(new Set(all).size).toBe(20);
    expect(drawChatQuestions(0, '준호')).toEqual([]);
    expect(drawChatQuestions(-3, '준호')).toEqual([]);
  });

  it('같은 rng 면 같은 결과, 이름의 특수 문자도 그대로 들어간다', () => {
    expect(drawChatQuestions(3, '지환', seeded(11))).toEqual(drawChatQuestions(3, '지환', seeded(11)));
    for (const q of drawChatQuestions(20, '$&', seeded(5))) expect(q.startsWith('$&님')).toBe(true);
  });

  it('이름이 비어 있으면 「상대」로 채운다', () => {
    for (const q of drawChatQuestions(4, '  ', seeded(9))) expect(q.startsWith('상대님')).toBe(true);
  });
});
