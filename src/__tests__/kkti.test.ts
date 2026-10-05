import { Colors } from '@/constants/theme';
import {
  ENNEAGRAM_NOTE,
  KKTI_AXES,
  KKTI_CODES,
  KKTI_COLORS,
  KKTI_QUESTIONS,
  KKTI_TYPES,
  computeKkti,
  contrastRatio,
  decodeAnswers,
  encodeAnswers,
  estimateEnneagram,
  kktiFromCode,
  legibleOn,
  loveColor,
  matchReason,
  readableTextOn,
  resultUrl,
  shareText,
  toSaved,
  type KktiAxisKey,
} from '@/lib/kkti';
import { TONES } from '@/lib/labels';

const HEX = /^#[0-9A-F]{6}$/;

/** 테스트용 고정 난수 (같은 seed → 같은 답 목록) */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomAnswers(rand: () => number): number[] {
  return KKTI_QUESTIONS.map((q) => Math.floor(rand() * q.options.length));
}

/** 원하는 유형 코드가 나오도록 축마다 같은 쪽 답을 고른다 (strength: 1 이면 약하게, 2 면 극단) */
function answersFor(code: string, strength: 1 | 2 = 2): number[] {
  const letters = Array.from(code);
  return KKTI_QUESTIONS.map((q) => {
    const axisIndex = KKTI_AXES.findIndex((a) => a.key === q.axis);
    const sign = letters[axisIndex] === KKTI_AXES[axisIndex].plus.letter ? 1 : -1;
    return q.options.findIndex((o) => o.score === sign * strength);
  });
}

/** X(트위터) 글자 수 — 한글·이모지는 2, 링크는 23 으로 센다 (보수적으로 계산) */
function xLength(text: string): number {
  const withoutUrls = text.replace(/https?:\/\/\S+/g, '');
  const urls = text.match(/https?:\/\/\S+/g)?.length ?? 0;
  let n = urls * 23;
  for (const ch of withoutUrls) {
    const cp = ch.codePointAt(0) ?? 0;
    const light = cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037);
    n += light ? 1 : 2;
  }
  return n;
}

describe('KKTI 질문', () => {
  it('12문항, 축마다 3문항', () => {
    expect(KKTI_QUESTIONS).toHaveLength(12);
    const perAxis: Record<KktiAxisKey, number> = { start: 0, speed: 0, express: 0, pace: 0 };
    KKTI_QUESTIONS.forEach((q) => (perAxis[q.axis] += 1));
    expect(perAxis).toEqual({ start: 3, speed: 3, express: 3, pace: 3 });
  });

  it('선택지는 2~4개, 점수는 -2~+2 정수이고 양쪽 글자가 모두 나올 수 있다', () => {
    const ids = new Set<string>();
    for (const q of KKTI_QUESTIONS) {
      ids.add(q.id);
      expect(q.prompt.length).toBeGreaterThan(5);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
      for (const o of q.options) {
        expect(Number.isInteger(o.score)).toBe(true);
        expect(Math.abs(o.score)).toBeLessThanOrEqual(2);
        expect(o.label.trim().length).toBeGreaterThan(0);
      }
      expect(q.options.some((o) => o.score > 0)).toBe(true);
      expect(q.options.some((o) => o.score < 0)).toBe(true);
    }
    expect(ids.size).toBe(KKTI_QUESTIONS.length);
  });
});

describe('KKTI 16유형 데이터', () => {
  it('16개 코드가 축 글자 조합을 빠짐없이 덮는다', () => {
    expect(KKTI_CODES).toHaveLength(16);
    expect(new Set(KKTI_CODES).size).toBe(16);
    const all: string[] = [''];
    const combos = KKTI_AXES.reduce((acc, axis) => acc.flatMap((p) => [p + axis.plus.letter, p + axis.minus.letter]), all);
    expect([...combos].sort()).toEqual([...KKTI_CODES].sort());
  });

  it('유형마다 필요한 내용이 다 있다', () => {
    const tones = TONES.map((t) => t.key);
    const names = new Set<string>();
    for (const code of KKTI_CODES) {
      const t = KKTI_TYPES[code];
      expect(t.code).toBe(code);
      expect(t.name.length).toBeGreaterThan(1);
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(t.oneLiner.length).toBeGreaterThan(5);
      expect(t.description.length).toBeGreaterThan(30);
      expect(t.strengths).toHaveLength(2);
      expect(t.watchOut.length).toBeGreaterThanOrEqual(1);
      expect(t.watchOut.length).toBeLessThanOrEqual(2);
      expect(t.coachTip.length).toBeGreaterThan(10);
      expect(tones).toContain(t.recommendedTone);
      names.add(t.name);
    }
    expect(names.size).toBe(16);
  });

  it('잘 맞는·안 맞는 유형은 실제 코드이고 자기 자신이 아니다', () => {
    for (const code of KKTI_CODES) {
      const t = KKTI_TYPES[code];
      expect(KKTI_TYPES[t.bestMatch]).toBeDefined();
      expect(KKTI_TYPES[t.worstMatch]).toBeDefined();
      expect(t.bestMatch).not.toBe(code);
      expect(t.worstMatch).not.toBe(code);
      expect(t.bestMatch).not.toBe(t.worstMatch);
      expect(matchReason(code, t.bestMatch)).toMatch(/요$/);
      expect(matchReason(code, t.worstMatch)).toMatch(/요$/);
    }
  });

  it('모든 유형이 실제로 나올 수 있다 (극단·약한 답 모두)', () => {
    for (const code of KKTI_CODES) {
      expect(computeKkti(answersFor(code, 2)).code).toBe(code);
      expect(computeKkti(answersFor(code, 1)).code).toBe(code);
    }
  });
});

describe('KKTI 결과 계산', () => {
  it('같은 답이면 같은 결과', () => {
    const rand = seeded(7);
    for (let i = 0; i < 50; i++) {
      const answers = randomAnswers(rand);
      expect(computeKkti(answers)).toEqual(computeKkti([...answers]));
      expect(toSaved(computeKkti(answers), 1)).toEqual(toSaved(computeKkti(answers), 1));
    }
  });

  it('카톡 속 진짜 MBTI 와 확신도', () => {
    const allPlus = computeKkti(answersFor('선빠폭직'));
    expect(allPlus.mbti.type).toBe('ESFJ');
    expect(allPlus.mbti.letters.every((l) => l.confidence === 100)).toBe(true);
    expect(computeKkti(answersFor('후느담밀')).mbti.type).toBe('INTP');

    const rand = seeded(11);
    for (let i = 0; i < 200; i++) {
      const r = computeKkti(randomAnswers(rand));
      expect(r.mbti.type).toMatch(/^[EI][SN][FT][JP]$/);
      for (const axis of r.axes) {
        // 고른 쪽이 언제나 절반 넘게
        expect(axis.percent).toBeGreaterThan(50);
        expect(axis.percent).toBeLessThanOrEqual(100);
        expect(axis.plusPercent + (100 - axis.plusPercent)).toBe(100);
      }
      expect(r.code).toBe(r.axes.map((a) => a.pole.letter).join(''));
    }
  });

  it('점수가 비기면 가장 확실하게 고른 답 쪽으로 기운다', () => {
    // 연락 시작 축: +2, -1, -1 → 합 0 → 선
    const base = answersFor('후느담밀');
    const startQs = KKTI_QUESTIONS.map((q, i) => (q.axis === 'start' ? i : -1)).filter((i) => i >= 0);
    const answers = [...base];
    answers[startQs[0]] = KKTI_QUESTIONS[startQs[0]].options.findIndex((o) => o.score === 2);
    answers[startQs[1]] = KKTI_QUESTIONS[startQs[1]].options.findIndex((o) => o.score === -1);
    answers[startQs[2]] = KKTI_QUESTIONS[startQs[2]].options.findIndex((o) => o.score === -1);
    const r = computeKkti(answers);
    expect(r.axes[0].score).toBe(0);
    expect(r.axes[0].pole.letter).toBe('선');
    expect(r.code).toBe('선느담밀');
  });

  it('애니어그램 추정은 1~9 이고, 9가지 모두 나올 수 있다', () => {
    const seen = new Set<number>();
    const steps = [-6, -4, -2, -1, 0, 1, 2, 4, 6].map((s) => s / 6);
    for (const start of steps)
      for (const speed of steps)
        for (const express of steps)
          for (const pace of steps) {
            const e = estimateEnneagram({ start, speed, express, pace });
            expect(e.number).toBeGreaterThanOrEqual(1);
            expect(e.number).toBeLessThanOrEqual(9);
            seen.add(e.number);
          }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const r = computeKkti(answersFor('선빠폭직'));
    expect(r.enneagram.title).toBe(`${r.enneagram.number}번 ${r.enneagram.name}`);
    expect(r.enneagram.reason).toContain(r.enneagram.title);
    expect(r.enneagram.note).toBe(ENNEAGRAM_NOTE);
    expect(r.enneagram.note).toContain('추정');
  });
});

describe('나만의 연애 컬러', () => {
  it('이름 있는 색이 48개 이상이고 이름·hex 가 서로 다르다', () => {
    const names = new Set(KKTI_COLORS.map((c) => c.name));
    expect(names.size).toBe(KKTI_COLORS.length);
    expect(names.size).toBeGreaterThanOrEqual(48);
    expect(new Set(KKTI_COLORS.map((c) => c.hex)).size).toBe(KKTI_COLORS.length);
    for (const c of KKTI_COLORS) {
      expect(c.hex).toMatch(HEX);
      expect(c.mood.length).toBeGreaterThan(5);
    }
  });

  it('결과 색은 #RRGGBB 이고, 이름과 설명은 목록에 있는 것', () => {
    const rand = seeded(23);
    const byName = new Map(KKTI_COLORS.map((c) => [c.name, c]));
    for (let i = 0; i < 300; i++) {
      const { color } = computeKkti(randomAnswers(rand));
      expect(color.hex).toMatch(HEX);
      expect(byName.get(color.name)?.mood).toBe(color.description);
      expect(byName.get(color.name)?.hex).toBe(color.namedHex);
    }
  });

  it('같은 유형이어도 답 조합마다 색이 미묘하게 다르다', () => {
    const rand = seeded(99);
    const hexes = new Set<string>();
    const N = 400;
    for (let i = 0; i < N; i++) hexes.add(computeKkti(randomAnswers(rand)).color.hex);
    expect(hexes.size).toBeGreaterThan(N * 0.9);
    // 흔들기 없는 계산도 같은 값이면 같은 색
    const v = { start: 0.5, speed: -0.33, express: 1, pace: -1 };
    expect(loveColor(v)).toEqual(loveColor({ ...v }));
    expect(loveColor(v, 42).hex).toBe(loveColor(v, 42).hex);
  });

  it('색 위의 글자색은 충분히 읽힌다', () => {
    for (const c of KKTI_COLORS) expect(contrastRatio(c.hex, readableTextOn(c.hex))).toBeGreaterThanOrEqual(4);
  });

  it('연애 컬러를 카드 위 글자로 써도 라이트·다크 모드에서 읽힌다', () => {
    const cards = [Colors.light.surfaceElevated, Colors.dark.surfaceElevated];
    const rand = seeded(31);
    const samples = [...KKTI_COLORS.map((c) => c.hex), ...Array.from({ length: 100 }, () => computeKkti(randomAnswers(rand)).color.hex)];
    for (const hex of samples) {
      for (const bg of cards) {
        const text = legibleOn(hex, bg);
        expect(text).toMatch(HEX);
        expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('답 코드 · 결과 링크', () => {
  it('encode → decode 가 원래 답으로 돌아온다', () => {
    const rand = seeded(5);
    const cases = [KKTI_QUESTIONS.map(() => 0), KKTI_QUESTIONS.map((q) => q.options.length - 1), ...Array.from({ length: 300 }, () => randomAnswers(rand))];
    for (const answers of cases) {
      const code = encodeAnswers(answers);
      expect(code).toMatch(/^[0-9a-z]{6}$/);
      expect(decodeAnswers(code)).toEqual(answers);
      expect(decodeAnswers(code.toUpperCase())).toEqual(answers);
      // SNS 에 붙여 넣다 뒤에 기호가 붙어도 읽힌다
      expect(decodeAnswers(`${code}.`)).toEqual(answers);
      expect(decodeAnswers(` ${code})`)).toEqual(answers);
      expect(kktiFromCode(code)?.code).toBe(computeKkti(answers).code);
    }
  });

  it('잘못된 코드는 null', () => {
    const code = encodeAnswers(randomAnswers(seeded(3)));
    const flipped = code.slice(0, 2) + (code[2] === 'a' ? 'b' : 'a') + code.slice(3);
    for (const bad of [undefined, null, '', 'abc', 'zzzzzz', '!!!!!!', code + '0', code.slice(1), flipped]) {
      expect(decodeAnswers(bad)).toBeNull();
    }
    expect(kktiFromCode('nope')).toBeNull();
    expect(() => encodeAnswers([0, 1])).toThrow();
    expect(() => encodeAnswers(KKTI_QUESTIONS.map(() => 9))).toThrow();
  });

  it('결과 링크와 공유 문구', () => {
    const r = computeKkti(answersFor('후빠폭밀'));
    expect(resultUrl(r.encoded)).toBe(`https://mylovecoach.vercel.app/kkti/result?a=${r.encoded}`);
    expect(r.url).toBe(resultUrl(r.encoded));
    const text = shareText(r, r.url);
    expect(text).toContain(r.url);
    expect(text).toContain(r.code);
    expect(text).toContain(r.type.name);
    expect(text).toContain(r.mbti.type);
  });

  it('공유 문구는 모든 유형·색 이름에서 X 글자 수(280) 안에 들어간다', () => {
    const longestColor = [...KKTI_COLORS].sort((a, b) => b.name.length - a.name.length)[0];
    for (const code of KKTI_CODES) {
      const r = computeKkti(answersFor(code));
      const worst = { ...r, color: { ...r.color, name: longestColor.name } };
      expect(xLength(shareText(worst))).toBeLessThanOrEqual(280);
    }
  });

  it('프로필 저장 모양', () => {
    const r = computeKkti(answersFor('선느담직'));
    expect(toSaved(r, 123)).toEqual({
      code: '선느담직',
      name: r.type.name,
      emoji: r.type.emoji,
      color: r.color.hex,
      colorName: r.color.name,
      mbti: 'ENTJ',
      enneagram: r.enneagram.number,
      at: 123,
    });
  });
});
