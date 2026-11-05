/**
 * KKTI 둘의 궁합 · 공유 링크 — 궁합은 둘 다 테스트를 끝내야 나오고, 둘이 같은 화면을 본다.
 */
import {
  KKTI_AXES,
  KKTI_CODES,
  KKTI_FIT_LABEL,
  KKTI_MATCH_TIERS,
  KKTI_QUESTIONS,
  KKTI_TYPES,
  cardUrl,
  chatShareText,
  cleanSite,
  computeKkti,
  isSavedResult,
  kktiMatch,
  kktiRole,
  matchChatText,
  matchShareText,
  parseShareCode,
  retakeFriend,
  shareText,
  shareUrl,
  toSaved,
} from '@/lib/kkti';

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randomAnswers = (rand: () => number) => KKTI_QUESTIONS.map((q) => Math.floor(rand() * q.options.length));

function answersFor(code: string, strength: 1 | 2 = 2): number[] {
  const letters = Array.from(code);
  return KKTI_QUESTIONS.map((q) => {
    const axisIndex = KKTI_AXES.findIndex((a) => a.key === q.axis);
    const sign = letters[axisIndex] === KKTI_AXES[axisIndex].plus.letter ? 1 : -1;
    return q.options.findIndex((o) => o.score === sign * strength);
  });
}

/** X(트위터) 글자 수 — 한글·이모지는 2, 링크는 23 으로 센다 */
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

describe('KKTI 둘의 궁합', () => {
  it('누구를 먼저 넣어도 같은 결과 (둘이 같은 화면을 본다)', () => {
    const rand = seeded(17);
    for (let i = 0; i < 300; i++) {
      const a = computeKkti(randomAnswers(rand));
      const b = computeKkti(randomAnswers(rand));
      expect(kktiMatch(a, b)).toEqual(kktiMatch(b, a));
    }
  });

  it('퍼센트는 30~99 정수이고, 등급·축 설명이 빠짐없이 나온다', () => {
    const rand = seeded(29);
    for (let i = 0; i < 500; i++) {
      const m = kktiMatch(computeKkti(randomAnswers(rand)), computeKkti(randomAnswers(rand)));
      expect(Number.isInteger(m.percent)).toBe(true);
      expect(m.percent).toBeGreaterThanOrEqual(30);
      expect(m.percent).toBeLessThanOrEqual(99);
      expect(KKTI_MATCH_TIERS).toContain(m.tier);
      expect(m.percent).toBeGreaterThanOrEqual(m.tier.min);
      expect(m.axes.map((x) => x.key)).toEqual(KKTI_AXES.map((x) => x.key));
      for (const axis of m.axes) {
        expect(axis.score).toBeGreaterThanOrEqual(0);
        expect(axis.score).toBeLessThanOrEqual(100);
        expect(KKTI_FIT_LABEL[axis.fit]).toBeTruthy();
        expect(axis.line.length).toBeGreaterThan(8);
      }
      expect(m.tip.length).toBeGreaterThan(8);
    }
  });

  it('유형 설명의 찰떡은 가장 높고 상극은 가장 낮다', () => {
    for (const code of KKTI_CODES) {
      const me = computeKkti(answersFor(code));
      const best = kktiMatch(me, computeKkti(answersFor(KKTI_TYPES[code].bestMatch)));
      const worst = kktiMatch(me, computeKkti(answersFor(KKTI_TYPES[code].worstMatch)));
      expect(best.percent).toBe(99);
      expect(best.tier.label).toBe('천생연분');
      expect(worst.percent).toBe(30);
      expect(worst.tier.label).toBe('극과 극');
      for (const other of KKTI_CODES) {
        const p = kktiMatch(me, computeKkti(answersFor(other))).percent;
        expect(p).toBeLessThanOrEqual(best.percent);
        expect(p).toBeGreaterThanOrEqual(worst.percent);
      }
    }
  });

  it('흔한 조합은 한쪽 끝에 몰리지 않는다 (절반 이상이 50~89%)', () => {
    const rand = seeded(41);
    let middle = 0;
    const seen = new Set<number>();
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const p = kktiMatch(computeKkti(randomAnswers(rand)), computeKkti(randomAnswers(rand))).percent;
      seen.add(p);
      if (p >= 50 && p <= 89) middle += 1;
    }
    expect(middle / N).toBeGreaterThan(0.5);
    // 숫자가 다양해야 「우리만의 결과」처럼 느껴진다
    expect(seen.size).toBeGreaterThan(40);
  });

  it('등급은 높은 것부터 내려가고 0% 까지 덮는다', () => {
    const mins = KKTI_MATCH_TIERS.map((t) => t.min);
    expect([...mins].sort((a, b) => b - a)).toEqual(mins);
    expect(mins[mins.length - 1]).toBe(0);
    expect(new Set(KKTI_MATCH_TIERS.map((t) => t.label)).size).toBe(KKTI_MATCH_TIERS.length);
  });

  it('축 설명은 같은 쪽·다른 쪽에 따라 달라진다', () => {
    const lead = computeKkti(answersFor('선빠폭직'));
    const wait = computeKkti(answersFor('후빠폭직'));
    const start = (a: typeof lead, b: typeof lead) => kktiMatch(a, b).axes[0];
    expect(start(lead, wait).fit).toBe('good');
    expect(start(lead, wait).line).toContain('한 명이 먼저');
    expect(start(lead, lead).fit).toBe('care');
    expect(start(lead, lead).line).toContain('둘 다 선톡파');
    expect(start(wait, wait).line).toContain('기다리는');
    // 나머지 축은 닮을수록 좋다
    expect(kktiMatch(lead, wait).axes.slice(1).every((x) => x.fit === 'good')).toBe(true);
    expect(kktiMatch(lead, wait).tip).toContain('결이 같아요');
  });

  it('맞는 정도와 설명이 어긋나지 않는다 — 잘 맞는 축에 「달라요」, 맞춰 가는 축에 「잘 통해요」라고 쓰지 않는다', () => {
    const rand = seeded(53);
    for (let i = 0; i < 1000; i++) {
      const m = kktiMatch(computeKkti(randomAnswers(rand)), computeKkti(randomAnswers(rand)));
      for (const axis of m.axes) {
        if (axis.fit === 'good') expect(axis.line).not.toMatch(/달라요|숙제|한쪽은/);
        if (axis.fit === 'care') expect(axis.line).not.toMatch(/엇비슷|반갑게 받아/);
      }
    }
  });
});

describe('공유 링크', () => {
  const me = computeKkti(answersFor('후빠폭밀'));
  const friend = computeKkti(answersFor('선느담직', 1));

  it('짧은 주소 /k/코드, 궁합은 /k/내코드-상대코드', () => {
    expect(shareUrl(me.encoded)).toBe(`https://mylovecoach.vercel.app/k/${me.encoded}`);
    expect(shareUrl(me.encoded, friend.encoded)).toBe(`https://mylovecoach.vercel.app/k/${me.encoded}-${friend.encoded}`);
    expect(shareUrl(me.encoded, null)).toBe(shareUrl(me.encoded));
  });

  it('주소의 코드 부분을 다시 읽는다', () => {
    expect(parseShareCode(me.encoded)).toEqual({ a: me.encoded, w: null });
    expect(parseShareCode(`${me.encoded}-${friend.encoded}`)).toEqual({ a: me.encoded, w: friend.encoded });
    expect(parseShareCode(` ${me.encoded.toUpperCase()}-${friend.encoded} `)).toEqual({ a: me.encoded, w: friend.encoded });
    // 상대 코드만 잘못됐으면 내 결과만
    expect(parseShareCode(`${me.encoded}-zzzzzz`)).toEqual({ a: me.encoded, w: null });
    for (const bad of [undefined, null, '', 'nope', `-${me.encoded}`, 'zzzzzz-zzzzzz']) expect(parseShareCode(bad)).toBeNull();
  });

  it('카드 그림 주소', () => {
    expect(cardUrl(me.encoded)).toBe(`https://mylovecoach.vercel.app/api/kkti-card?a=${me.encoded}&v=2`);
    expect(cardUrl(me.encoded, friend.encoded, 'story')).toBe(`https://mylovecoach.vercel.app/api/kkti-card?a=${me.encoded}&w=${friend.encoded}&s=story&v=2`);
    expect(cardUrl(me.encoded, null, 'square', 'https://kkti.example.com')).toBe(`https://kkti.example.com/api/kkti-card?a=${me.encoded}&s=square&v=2`);
  });

  it('전용 주소는 https 주소 모양일 때만 쓴다', () => {
    expect(cleanSite('https://kkti.example.com/')).toBe('https://kkti.example.com');
    expect(cleanSite(' https://kkti.example.com ')).toBe('https://kkti.example.com');
    for (const bad of [undefined, '', 'http://kkti.example.com', 'kkti.example.com', 'https://kkti.example.com/path', 'https://a b.com', 'javascript:alert(1)']) expect(cleanSite(bad)).toBeNull();
  });

  it('공유 문구는 짧은 주소를 쓰고, 궁합이 나온다는 걸 알려 준다', () => {
    const text = shareText(me);
    expect(text).toContain(shareUrl(me.encoded));
    expect(text).toContain('궁합');
    // 첫 줄은 누구나 아는 「진짜 MBTI」로 시작한다
    expect(text.split('\n')[0].startsWith(`내 카톡 속 진짜 MBTI는 ${me.mbti.type}`)).toBe(true);
    expect(chatShareText(shareUrl(me.encoded))).toContain('진짜 MBTI');
    expect(chatShareText(shareUrl(me.encoded))).toContain(shareUrl(me.encoded));
    // 한 사람에게 보내는 문구에는 해시태그를 넣지 않는다
    expect(chatShareText(shareUrl(me.encoded))).not.toContain('#');
  });

  it('궁합 공유 문구는 퍼센트·등급·두 유형과 내 코드가 앞에 오는 주소를 담는다', () => {
    const match = kktiMatch(me, friend);
    const text = matchShareText(me, friend);
    expect(text).toContain(`${match.percent}%`);
    expect(text).toContain(match.tier.label);
    expect(text).toContain(me.type.name);
    expect(text).toContain(friend.type.name);
    expect(text).toContain(shareUrl(me.encoded, friend.encoded));
    const chat = matchChatText(me, friend);
    expect(chat).toContain(`${match.percent}%`);
    expect(chat).toContain(shareUrl(me.encoded, friend.encoded));
    expect(chat).not.toContain('#');
  });

  it('궁합 공유 문구는 모든 유형 조합에서 X 글자 수(280) 안에 들어간다', () => {
    for (const a of KKTI_CODES) for (const b of KKTI_CODES) expect(xLength(matchShareText(computeKkti(answersFor(a)), computeKkti(answersFor(b))))).toBeLessThanOrEqual(280);
  });
});

describe('결과 화면을 보는 사람', () => {
  const a = computeKkti(answersFor('선빠폭직'));
  const b = computeKkti(answersFor('후느담밀', 1));
  const c = computeKkti(answersFor('선느담직'));
  const savedA = toSaved(a, 1);

  it('주소의 결과가 내 것이면 mine, 주소의 상대가 나면 partner, 그 밖은 guest', () => {
    expect(kktiRole(savedA, a, null)).toBe('mine');
    expect(kktiRole(savedA, a, b)).toBe('mine');
    // 친구 B 가 내 링크로 테스트를 끝내고 돌려보낸 궁합 링크 (/k/B-A)
    expect(kktiRole(savedA, b, a)).toBe('partner');
    // 친구가 보낸 링크, 남들의 궁합 링크
    expect(kktiRole(savedA, b, null)).toBe('guest');
    expect(kktiRole(savedA, b, c)).toBe('guest');
    // 저장된 결과가 없는 사람 (처음 온 사람, 테스트한 곳과 다른 브라우저)
    expect(kktiRole(null, a, null)).toBe('guest');
    expect(kktiRole(undefined, b, a)).toBe('guest');
    // 둘이 같은 답이어도 내 결과가 먼저
    expect(kktiRole(savedA, a, a)).toBe('mine');
  });

  it('예전에 저장한 결과(답 코드 없음)도 내 결과·상대로 알아본다', () => {
    const { a: _dropped, ...old } = savedA;
    expect(kktiRole(old, a, null)).toBe('mine');
    expect(kktiRole(old, b, a)).toBe('partner');
    expect(kktiRole(old, b, null)).toBe('guest');
  });

  it('다시 테스트할 때는 상대를 들고 간다 — 끝나면 그 사람과의 궁합이 다시 나온다', () => {
    // 내 결과 화면: 주소의 상대 (없으면 혼자 다시)
    expect(retakeFriend('mine', a, b)).toBe(b);
    expect(retakeFriend('mine', a, null)).toBeNull();
    // 친구가 돌려보낸 궁합 화면·친구 결과 화면: 화면의 주인(친구)
    expect(retakeFriend('partner', b, a)).toBe(b);
    expect(retakeFriend('guest', b, null)).toBe(b);
    expect(retakeFriend('guest', b, c)).toBe(b);
  });
});

describe('내 결과인지 가리기', () => {
  it('저장된 답 코드로 본다 — 같은 유형이어도 답이 다르면 남의 결과', () => {
    const mine = computeKkti(answersFor('선빠폭직', 2));
    const sameType = computeKkti(answersFor('선빠폭직', 1));
    expect(sameType.code).toBe(mine.code);
    const saved = toSaved(mine, 1);
    expect(saved.a).toBe(mine.encoded);
    expect(isSavedResult(saved, mine)).toBe(true);
    expect(isSavedResult(saved, sameType)).toBe(false);
    expect(isSavedResult(null, mine)).toBe(false);
  });

  it('예전에 저장한 결과(답 코드 없음)는 유형과 색으로 본다', () => {
    const mine = computeKkti(answersFor('후느담밀'));
    const { a: _dropped, ...old } = toSaved(mine, 1);
    expect(isSavedResult(old, mine)).toBe(true);
    expect(isSavedResult(old, computeKkti(answersFor('후느담직')))).toBe(false);
  });
});
