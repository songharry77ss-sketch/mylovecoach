/**
 * KKTI 영어판 (Texting Type Test) — kkti.ts 의 한국어 문구마다 영어가 빠짐없이 짝지어져 있는지.
 * 기본(한국어)으로 돌리면 화면 문구가 kkti.ts 그대로인지, APP_LANG=en 으로 돌리면 화면 문구에 한글이 없는지까지 본다.
 *   APP_LANG=en npx jest src/__tests__/kkti-en.test.ts
 */
import { isEn, isKo } from '@/lib/i18n';
import {
  KKTI_AXES,
  KKTI_CODES,
  KKTI_COLORS,
  KKTI_FIT_LABEL,
  KKTI_MATCH_TIERS,
  KKTI_QUESTIONS,
  KKTI_TYPES,
  chatShareText,
  computeKkti,
  kktiMatch,
  matchChatText,
  matchReason,
  matchShareText,
  shareText,
  toSaved,
} from '@/lib/kkti';
import {
  ENNEAGRAM_NOTE_EN,
  KKTI_AXES_EN,
  KKTI_COLORS_EN,
  KKTI_ENNEAGRAM_EN,
  KKTI_FIT_LABEL_EN,
  KKTI_MATCH_LINES_EN,
  KKTI_MATCH_TIPS_EN,
  KKTI_MATCH_TIERS_EN,
  KKTI_MATCH_TIP_ALL_GOOD_EN,
  KKTI_QUESTIONS_EN,
  KKTI_TYPES_EN,
  kktiCopy,
  kktiEnglishCode,
} from '@/lib/kkti-en';

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;

/** 객체 안의 모든 글자를 모은다 */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

const sortedKeys = (o: object) => Object.keys(o).sort();

/** 원하는 유형이 나오는 답 (축마다 같은 쪽 극단) */
function answersFor(code: string): number[] {
  const letters = Array.from(code);
  return KKTI_QUESTIONS.map((q) => {
    const i = KKTI_AXES.findIndex((a) => a.key === q.axis);
    const sign = letters[i] === KKTI_AXES[i].plus.letter ? 1 : -1;
    return q.options.findIndex((o) => o.score === sign * 2);
  });
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = seeded(20261127);
const RESULTS = [
  ...KKTI_CODES.map((code) => computeKkti(answersFor(code))),
  ...Array.from({ length: 60 }, () => computeKkti(KKTI_QUESTIONS.map((q) => Math.floor(rand() * q.options.length)))),
];

/** X 글자 수 — 링크 23, 한글·이모지 등은 2 로 넉넉히 센다 */
function xLength(text: string): number {
  const urls = text.match(/https?:\/\/\S+/g)?.length ?? 0;
  let n = urls * 23;
  for (const ch of text.replace(/https?:\/\/\S+/g, '')) n += (ch.codePointAt(0) ?? 0) <= 0x24ff ? 1 : 2;
  return n;
}

describe('KKTI 영어판 — 짝 맞추기', () => {
  it('16유형 모두 영어가 있고, 강점·조심 개수가 같다', () => {
    expect(sortedKeys(KKTI_TYPES_EN)).toEqual([...KKTI_CODES].sort());
    for (const code of KKTI_CODES) {
      const ko = KKTI_TYPES[code];
      const en = KKTI_TYPES_EN[code];
      expect(en.strengths).toHaveLength(ko.strengths.length);
      expect(en.watchOut).toHaveLength(ko.watchOut.length);
      for (const s of strings(en)) expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it('유형 이름은 서로 다르다', () => {
    const names = KKTI_CODES.map((c) => KKTI_TYPES_EN[c].name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('12문항 모두 영어가 있고, 선택지 개수·말풍선 유무가 같다', () => {
    expect(sortedKeys(KKTI_QUESTIONS_EN)).toEqual(KKTI_QUESTIONS.map((q) => q.id).sort());
    for (const q of KKTI_QUESTIONS) {
      const en = KKTI_QUESTIONS_EN[q.id];
      expect(en.options).toHaveLength(q.options.length);
      expect(Boolean(en.bubble)).toBe(Boolean(q.bubble));
      expect(new Set(en.options).size).toBe(en.options.length);
    }
  });

  it('축 4개 — 영어 글자 8개가 모두 다르고, 16유형의 영어 코드도 모두 다르다', () => {
    expect(sortedKeys(KKTI_AXES_EN)).toEqual(KKTI_AXES.map((a) => a.key).sort());
    const letters = KKTI_AXES.flatMap((a) => [KKTI_AXES_EN[a.key].plus.letter, KKTI_AXES_EN[a.key].minus.letter]);
    expect(new Set(letters).size).toBe(8);
    letters.forEach((l) => expect(l).toMatch(/^[A-Z]$/));
    const codes = KKTI_CODES.map(kktiEnglishCode);
    expect(new Set(codes).size).toBe(16);
    codes.forEach((c) => expect(c).toMatch(/^[A-Z]{4}$/));
    expect(kktiEnglishCode('선빠폭직')).toBe('FRHA');
    expect(kktiEnglishCode('후느담밀')).toBe('WLDS');
  });

  it('연애 컬러 63가지 모두 영어 이름이 있고, 이름이 겹치지 않는다', () => {
    const hexes = KKTI_COLORS.map((c) => c.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(sortedKeys(KKTI_COLORS_EN)).toEqual([...hexes].sort());
    const names = Object.values(KKTI_COLORS_EN).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('애니어그램 1~9 · 궁합 등급 · 맞는 정도 · 축별 궁합 한 줄 · 한마디가 모두 있다', () => {
    expect(sortedKeys(KKTI_ENNEAGRAM_EN)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(sortedKeys(KKTI_MATCH_TIERS_EN)).toEqual(KKTI_MATCH_TIERS.map((t) => String(t.min)).sort());
    expect(sortedKeys(KKTI_FIT_LABEL_EN)).toEqual(sortedKeys(KKTI_FIT_LABEL));
    expect(sortedKeys(KKTI_MATCH_LINES_EN)).toEqual(KKTI_AXES.map((a) => a.key).sort());
    expect(sortedKeys(KKTI_MATCH_TIPS_EN)).toEqual(KKTI_AXES.map((a) => a.key).sort());
    // 궁합 계산이 실제로 고르는 칸(lineKey)마다 영어가 있다
    for (const a of RESULTS) {
      for (const b of RESULTS.slice(0, 20)) {
        const m = kktiMatch(a, b);
        for (const axis of m.axes) expect(KKTI_MATCH_LINES_EN[axis.key][axis.lineKey]).toBeTruthy();
        if (m.tipKey) expect(KKTI_MATCH_TIPS_EN[m.tipKey]).toBeTruthy();
        else expect(m.tip).toBeTruthy();
      }
    }
  });

  it('영어 문구에는 한글이 하나도 없다', () => {
    const all = strings([
      KKTI_TYPES_EN,
      KKTI_QUESTIONS_EN,
      KKTI_AXES_EN,
      KKTI_COLORS_EN,
      KKTI_ENNEAGRAM_EN,
      KKTI_MATCH_TIERS_EN,
      KKTI_FIT_LABEL_EN,
      KKTI_MATCH_LINES_EN,
      KKTI_MATCH_TIPS_EN,
      KKTI_MATCH_TIP_ALL_GOOD_EN,
      ENNEAGRAM_NOTE_EN,
    ]);
    expect(all.length).toBeGreaterThan(300);
    expect(all.filter((s) => HANGUL.test(s))).toEqual([]);
  });
});

describe('kkti.ts 가 영어판에 넘기는 값 (한국어 결과는 그대로)', () => {
  it('애니어그램 traits 는 한국어 이유 문장에 쓴 축 두 개와 같다', () => {
    for (const r of RESULTS) {
      const { traits, reason } = r.enneagram;
      expect(traits).toHaveLength(2);
      const [first, second] = traits.map((t) => KKTI_AXES.find((a) => a.key === t.key)![t.side]);
      expect(reason.startsWith(`${first.and} ${second.adn} 모습에서`)).toBe(true);
    }
  });

  it('궁합 lineKey·tipKey 는 누가 먼저 와도 같다', () => {
    for (const a of RESULTS.slice(0, 16)) {
      for (const b of RESULTS.slice(10, 30)) {
        const ab = kktiMatch(a, b);
        const ba = kktiMatch(b, a);
        expect(ab.axes.map((x) => x.lineKey)).toEqual(ba.axes.map((x) => x.lineKey));
        expect(ab.tipKey).toBe(ba.tipKey);
      }
    }
  });
});

describe(`kktiCopy — 지금 언어(${isKo ? '한국어' : '영어'})`, () => {
  const me = RESULTS[0];
  const friend = RESULTS[20];
  const link = 'https://mylovecoach.vercel.app/k/abc123-def456';

  if (isKo) {
    it('한국어면 kkti.ts 문구 그대로 (한국어판은 바뀌는 게 없다)', () => {
      expect(kktiCopy.testName).toBe('KKTI');
      for (const code of KKTI_CODES) {
        const t = kktiCopy.type(code)!;
        const ko = KKTI_TYPES[code];
        expect([t.code, t.name, t.oneLiner, t.description, t.coachTip, t.emoji]).toEqual([ko.code, ko.name, ko.oneLiner, ko.description, ko.coachTip, ko.emoji]);
        expect(t.strengths).toEqual(ko.strengths);
        expect(t.watchOut).toEqual(ko.watchOut);
        expect(kktiCopy.code(code)).toBe(code);
        expect(kktiCopy.reason(me.code, code)).toBe(matchReason(me.code, code));
      }
      for (const q of KKTI_QUESTIONS) {
        expect(kktiCopy.question(q)).toEqual({ bubble: q.bubble, prompt: q.prompt, options: q.options.map((o) => o.label) });
      }
      for (const r of RESULTS) {
        expect(kktiCopy.color(r.color)).toEqual({ name: r.color.name, description: r.color.description });
        expect(kktiCopy.enneagram(r.enneagram)).toMatchObject({ title: r.enneagram.title, reason: r.enneagram.reason, note: r.enneagram.note });
        r.axes.forEach((axis) => expect(kktiCopy.pole(axis.key, kktiCopy.sideOf(axis))).toEqual({ letter: axis.pole.letter, label: axis.pole.label }));
      }
      const m = kktiMatch(me, friend);
      const copy = kktiCopy.match(m);
      expect(copy.tier).toEqual({ label: m.tier.label, line: m.tier.line, emoji: m.tier.emoji });
      expect(copy.tip).toBe(m.tip);
      expect(copy.axes.map((a) => [a.label, a.fitLabel, a.line])).toEqual(m.axes.map((a) => [a.label, KKTI_FIT_LABEL[a.fit], a.line]));
      expect(kktiCopy.share(me, link)).toBe(shareText(me, link));
      expect(kktiCopy.chat(link)).toBe(chatShareText(link));
      expect(kktiCopy.matchShare(me, friend, link)).toBe(matchShareText(me, friend, link));
      expect(kktiCopy.matchChat(me, friend, link)).toBe(matchChatText(me, friend, link));
      const saved = toSaved(me, 1);
      expect(kktiCopy.saved(saved)).toEqual({ code: saved.code, name: saved.name, colorName: saved.colorName });
    });
  }

  if (isEn) {
    it('영어면 화면 문구에 한글이 없고, 공유 링크는 그대로다', () => {
      expect(kktiCopy.testName).toBe('Texting Type Test');
      const out: string[] = [];
      for (const code of KKTI_CODES) {
        out.push(...strings(kktiCopy.type(code)), kktiCopy.code(code));
        for (const other of KKTI_CODES) {
          const reason = kktiCopy.reason(code, other);
          expect(reason.endsWith('.')).toBe(true);
          out.push(reason);
        }
      }
      for (const q of KKTI_QUESTIONS) out.push(...strings(kktiCopy.question(q)));
      for (const r of RESULTS) {
        out.push(...strings(kktiCopy.color(r.color)), ...strings(kktiCopy.enneagram(r.enneagram)));
        r.axes.forEach((axis) => out.push(kktiCopy.axisLabel(axis.key), ...strings(kktiCopy.pole(axis.key, kktiCopy.sideOf(axis)))));
        out.push(...strings(kktiCopy.saved(toSaved(r, 1))));
        for (const other of RESULTS.slice(0, 16)) out.push(...strings(kktiCopy.match(kktiMatch(r, other))));
      }
      out.push(kktiCopy.share(me, link), kktiCopy.chat(link), kktiCopy.matchShare(me, friend, link), kktiCopy.matchChat(me, friend, link));
      out.push(...(['good', 'ok', 'care'] as const).map((fit) => kktiCopy.fitLabel(fit)));
      expect(out.filter((s) => HANGUL.test(s))).toEqual([]);

      // 받는 사람은 같은 공유 주소로 들어온다 (주소·답 코드는 언어와 상관없다)
      expect(kktiCopy.share(me, link)).toContain(link);
      expect(kktiCopy.matchChat(me, friend, link)).toContain(link);
      expect(kktiCopy.share(me)).toContain(`/k/${me.encoded}`);
    });

    it('영어 공유 문구도 X(280자)에 들어간다', () => {
      for (const a of RESULTS) {
        expect(xLength(kktiCopy.share(a))).toBeLessThanOrEqual(280);
        for (const b of RESULTS.slice(0, 16)) expect(xLength(kktiCopy.matchShare(a, b))).toBeLessThanOrEqual(280);
      }
    });
  }
});
