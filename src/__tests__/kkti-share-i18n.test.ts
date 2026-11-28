/**
 * KKTI 공유 링크 세계화 (2026-11-28) — 한국어가 아닌 사람이 보낸 링크(/k/코드?l=언어)의 미리보기·카드 그림·넘어가기.
 * l 이 없는 링크(지금까지 나간 모든 링크)는 한국어 그대로인지도 본다 (kkti-share-api.test.ts 가 한국어 내용을 자세히 본다).
 */
import { CARD_SIZE, cardTree, renderCard, type Node } from '../../api/_kkti-card';
import cardHandler from '../../api/kkti-card';
import shareHandler, { shareHtml, sharePage } from '../../api/_kkti-share';
import jaDict from '@/i18n/dict/ja.json';
import { LANGS } from '@/lib/i18n';
import { KKTI_AXES, KKTI_CODES, KKTI_QUESTIONS, KKTI_TYPES, cardUrl, computeKkti, kktiMatch, shareUrl } from '@/lib/kkti';
import {
  KKTI_SHARE_LANGS,
  KKTI_TYPES_EN,
  kktiCardLang,
  kktiCardUrlFor,
  kktiEnglishCode,
  kktiShareLang,
  kktiShareUrlFor,
  withKktiLang,
} from '@/lib/kkti-en-text';

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const SITE = 'https://mylovecoach.vercel.app';

function answersFor(code: string, strength: 1 | 2 = 2): number[] {
  const letters = Array.from(code);
  return KKTI_QUESTIONS.map((q) => {
    const axisIndex = KKTI_AXES.findIndex((a) => a.key === q.axis);
    const sign = letters[axisIndex] === KKTI_AXES[axisIndex].plus.letter ? 1 : -1;
    return q.options.findIndex((o) => o.score === sign * strength);
  });
}

const me = computeKkti(answersFor('선빠폭직'));
const friend = computeKkti(answersFor('후느담밀', 1));

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
  setHeader: (name: string, value: string) => FakeRes;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
  send: (body: unknown) => FakeRes;
}

function fakeRes(): FakeRes {
  const res = { statusCode: 200, headers: {} } as FakeRes;
  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value;
    return res;
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.send = res.json;
  return res;
}

const share = (query: Record<string, string>) => {
  const res = fakeRes();
  shareHandler({ method: 'GET', query, headers: { host: 'mylovecoach.vercel.app' } } as never, res as never);
  return String(res.body);
};

function meta(html: string, property: string): string | null {
  const found = new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`).exec(html);
  return found ? found[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null;
}

/** 넘어갈 앱 화면 주소 (스크립트 안의 location.replace) */
const redirect = (html: string) => JSON.parse(/location\.replace\((".*?")\);/.exec(html)?.[1] ?? '""') as string;

/** 카드 뼈대 안의 글자 (이모지 그림 주소는 빼고) */
function texts(node: Node | string | null | false | undefined, out: string[] = []): string[] {
  if (!node) return out;
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  const children = node.props.children;
  (Array.isArray(children) ? children : [children]).forEach((child) => texts(child as Node | string, out));
  return out;
}

describe('공유 링크 만들기', () => {
  it('한국어는 지금까지와 같은 주소, 그 밖의 언어는 ?l=언어', () => {
    expect(kktiShareUrlFor('ko', me.encoded)).toBe(shareUrl(me.encoded));
    expect(kktiShareUrlFor('ko', me.encoded, friend.encoded)).toBe(`${SITE}/k/${me.encoded}-${friend.encoded}`);
    expect(kktiShareUrlFor('en', me.encoded)).toBe(`${SITE}/k/${me.encoded}?l=en`);
    expect(kktiShareUrlFor('en', me.encoded, friend.encoded)).toBe(`${SITE}/k/${me.encoded}-${friend.encoded}?l=en`);
    expect(kktiShareUrlFor('zh-Hant', me.encoded)).toBe(`${SITE}/k/${me.encoded}?l=zh-Hant`);
    expect(kktiShareUrlFor('en', me.encoded, null)).toBe(kktiShareUrlFor('en', me.encoded));
  });

  it('카드 그림 주소 — 한국어는 그대로, 그 밖의 언어는 모두 영어 카드(l=en) 하나로 모은다', () => {
    expect(kktiCardUrlFor('ko', me.encoded, friend.encoded, 'story')).toBe(cardUrl(me.encoded, friend.encoded, 'story'));
    expect(kktiCardUrlFor('en', me.encoded)).toBe(`${SITE}/api/kkti-card?a=${me.encoded}&l=en`);
    expect(kktiCardUrlFor('ja', me.encoded, friend.encoded, 'square', 'https://kkti.example.com')).toBe(`https://kkti.example.com/api/kkti-card?a=${me.encoded}&w=${friend.encoded}&s=square&l=en`);
    expect(withKktiLang(`${SITE}/k`, 'en')).toBe(`${SITE}/k?l=en`);
    expect(withKktiLang(`${SITE}/k`, 'ko')).toBe(`${SITE}/k`);
    expect(kktiCardLang('ko')).toBe('ko');
    expect(KKTI_SHARE_LANGS.filter((l) => l !== 'ko').every((l) => kktiCardLang(l) === 'en')).toBe(true);
  });

  it('l 값 읽기 — 없으면 한국어, 모르는 값은 영어, 받은 글자는 목록 값으로만', () => {
    for (const v of [undefined, null, '', '  ', 'ko', 'KO', 'ko-KR', 'ko_KR']) expect(kktiShareLang(v)).toBe('ko');
    expect(kktiShareLang('en')).toBe('en');
    expect(kktiShareLang('en-US')).toBe('en');
    expect(kktiShareLang('ja')).toBe('ja');
    expect(kktiShareLang('zh-Hans')).toBe('zh-Hans');
    expect(kktiShareLang('zh-hant')).toBe('zh-Hant');
    expect(kktiShareLang('zh_TW')).toBe('zh-Hant');
    expect(kktiShareLang('zh-CN')).toBe('zh-Hans');
    expect(kktiShareLang('pt-BR')).toBe('pt');
    expect(kktiShareLang('no')).toBe('nb');
    for (const v of ['xx', '<script>', '"><b>', 'en"onload=1']) expect(kktiShareLang(v)).toBe('en');
    // 글자가 아니면 l 이 없는 것과 같다
    for (const v of [42, {}, ['en']]) expect(kktiShareLang(v)).toBe('ko');
  });

  it('서버의 언어 목록은 앱 언어 목록(i18n.ts LANGS)과 같다', () => {
    expect([...KKTI_SHARE_LANGS]).toEqual([...LANGS]);
  });
});

describe('공유 페이지 — 한국어가 아닌 링크', () => {
  it('영어 — 제목·설명은 영어, 카드 그림은 영어(l=en), 결과 화면은 ?lang=en', () => {
    const page = sharePage(me.encoded, SITE, {}, 'en');
    expect(page.title).toBe(`My texting MBTI is ${me.mbti.type} ${me.type.emoji} "${KKTI_TYPES_EN[me.code].name}"`);
    expect(page.description).toContain(`Texting Type ${kktiEnglishCode(me.code)}`);
    expect(page.description).toContain(KKTI_TYPES_EN[me.code].oneLiner);
    expect(page.description).toContain('see your match');
    expect(page.target).toBe(`/kkti/result?a=${me.encoded}&lang=en`);
    expect(page.image).toBe(`${SITE}/api/kkti-card?a=${me.encoded}&l=en`);
    expect(page.url).toBe(`${SITE}/k/${me.encoded}?l=en`);
    expect(HANGUL.test(page.title + page.description)).toBe(false);
  });

  it('영어 궁합 — 퍼센트·영어 등급, 두 사람의 영어 유형 이름', () => {
    const page = sharePage(`${me.encoded}-${friend.encoded}`, SITE, {}, 'en');
    const match = kktiMatch(me, friend);
    expect(page.title.startsWith(`Our texting MBTI match: ${match.percent}% ${match.tier.emoji}`)).toBe(true);
    expect(page.description).toContain(`${me.mbti.type} ${me.type.emoji} ${KKTI_TYPES_EN[me.code].name}`);
    expect(page.description).toContain(`${friend.mbti.type} ${friend.type.emoji} ${KKTI_TYPES_EN[friend.code].name}`);
    expect(page.target).toBe(`/kkti/result?a=${me.encoded}&w=${friend.encoded}&lang=en`);
    expect(page.image).toBe(`${SITE}/api/kkti-card?a=${me.encoded}&w=${friend.encoded}&l=en`);
    expect(page.url).toBe(`${SITE}/k/${me.encoded}-${friend.encoded}?l=en`);
    expect(HANGUL.test(page.title + page.description)).toBe(false);
  });

  it('영어 소개(코드 없음·잘못됨) — 테스트 첫 화면으로, 유입 표시는 그대로', () => {
    for (const code of ['', 'nope', '<script>']) {
      const page = sharePage(code, SITE, {}, 'en');
      expect(page.title).toContain('Texting Type Test');
      expect(page.target).toBe('/kkti?lang=en');
      expect(page.image).toBe(`${SITE}/api/kkti-card?l=en`);
      expect(page.url).toBe(`${SITE}/k?l=en`);
      expect(HANGUL.test(page.title + page.description)).toBe(false);
    }
    expect(sharePage('', SITE, { utm_source: 'tiktok' }, 'en').target).toBe('/kkti?lang=en&utm_source=tiktok');
    expect(sharePage(me.encoded, SITE, { utm_source: 'threads' }, 'en').target).toBe(`/kkti/result?a=${me.encoded}&lang=en&utm_source=threads`);
  });

  it('일본어 — 미리보기 글은 번역 사전으로, 카드 그림은 영어', () => {
    const ja = jaDict as Record<string, string>;
    const page = sharePage(me.encoded, SITE, {}, 'ja');
    const name = ja[KKTI_TYPES_EN[me.code].name];
    expect(name).toBeTruthy();
    const template = ja['My texting MBTI is {0} {1} "{2}"'];
    expect(template).toBeTruthy();
    expect(page.title).toBe(template.replace('{0}', me.mbti.type).replace('{1}', me.type.emoji).replace('{2}', name));
    expect(page.description).toContain(ja[KKTI_TYPES_EN[me.code].oneLiner]);
    expect(page.image).toBe(`${SITE}/api/kkti-card?a=${me.encoded}&l=en`);
    expect(page.target).toBe(`/kkti/result?a=${me.encoded}&lang=ja`);
    expect(page.url).toBe(`${SITE}/k/${me.encoded}?l=ja`);
    expect(page.siteName).toBe(ja['Texting Type Test']);

    const html = shareHtml(page);
    expect(html).toContain('<html lang="ja">');
    expect(meta(html, 'og:locale')).toBe('ja_JP');
    expect(meta(html, 'og:site_name')).toBe(ja['Texting Type Test']);
  });

  it('지원하는 모든 언어 — 빈 자리({0}) 없이, 카드는 영어, 화면은 그 언어로', () => {
    for (const lang of KKTI_SHARE_LANGS.filter((l) => l !== 'ko')) {
      for (const code of [me.encoded, `${me.encoded}-${friend.encoded}`, '']) {
        const page = sharePage(code, SITE, {}, lang);
        expect(`${page.title} ${page.description} ${page.linkText}`).not.toMatch(/\{\d\}/);
        expect(page.title.length).toBeGreaterThan(5);
        expect(page.image.endsWith('l=en')).toBe(true);
        expect(page.target).toContain(`lang=${lang}`);
        expect(page.url.endsWith(`?l=${lang}`)).toBe(true);
        const html = shareHtml(page);
        expect(html).toContain(`<html lang="${lang}">`);
        expect(meta(html, 'og:locale')).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
      }
    }
  });
});

describe('GET /k/코드?l=언어', () => {
  it('l 이 없으면 지금까지와 똑같은 한국어 페이지', () => {
    const html = share({ c: me.encoded });
    expect(html).toBe(shareHtml(sharePage(me.encoded, SITE)));
    expect(html).toContain('<html lang="ko">');
    expect(meta(html, 'og:locale')).toBe('ko_KR');
    expect(meta(html, 'og:title')).toContain(me.type.name);
    expect(meta(html, 'og:image')).toBe(`${SITE}/api/kkti-card?a=${me.encoded}`);
    expect(redirect(html)).toBe(`/kkti/result?a=${me.encoded}`);
    expect(share({ c: me.encoded, l: 'ko' })).toBe(html);
  });

  it('l=en — 영어 미리보기·영어 카드, 결과 화면은 ?lang=en', () => {
    const html = share({ c: me.encoded, l: 'en' });
    expect(html).toContain('<html lang="en">');
    expect(meta(html, 'og:locale')).toBe('en_US');
    expect(meta(html, 'og:title')).toContain(KKTI_TYPES_EN[me.code].name);
    expect(meta(html, 'og:image')).toBe(`${SITE}/api/kkti-card?a=${me.encoded}&l=en`);
    expect(meta(html, 'twitter:image')).toBe(`${SITE}/api/kkti-card?a=${me.encoded}&l=en`);
    expect(meta(html, 'og:url')).toBe(`${SITE}/k/${me.encoded}?l=en`);
    expect(redirect(html)).toBe(`/kkti/result?a=${me.encoded}&lang=en`);
    expect(HANGUL.test(html)).toBe(false);
  });

  it('주소창에서 복사한 세계판 앱 화면 주소(?lang=en)도 영어로', () => {
    const html = share({ a: me.encoded, w: friend.encoded, lang: 'en', via: 'app' });
    expect(meta(html, 'og:title')).toContain('Our texting MBTI match');
    expect(meta(html, 'og:image')).toBe(`${SITE}/api/kkti-card?a=${me.encoded}&w=${friend.encoded}&l=en`);
  });

  it('이상한 l 값은 영어로 바꿔 쓰고, 그대로 페이지에 넣지 않는다', () => {
    const html = share({ c: me.encoded, l: '"><script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('<html lang="en">');
    expect(redirect(html)).toBe(`/kkti/result?a=${me.encoded}&lang=en`);
  });
});

describe('결과 카드 그림 — 영어', () => {
  it('모든 유형·모양의 영어 카드에 한글이 없다 (혼자·둘·소개)', () => {
    const results = KKTI_CODES.map((code) => computeKkti(answersFor(code)));
    for (const shape of ['og', 'story', 'square'] as const) {
      const all: string[] = [...texts(cardTree(shape, null, null, 'en'))];
      results.forEach((r, i) => {
        all.push(...texts(cardTree(shape, r, null, 'en')), ...texts(cardTree(shape, r, results[(i + 5) % results.length], 'en')));
      });
      expect(all.filter((s) => HANGUL.test(s))).toEqual([]);
    }
  });

  it('영어 카드에는 영어 유형 이름·코드·등급, 한국어 카드는 그대로', () => {
    for (const shape of ['og', 'story', 'square'] as const) {
      const solo = texts(cardTree(shape, me, null, 'en')).join('\n');
      expect(solo).toContain(KKTI_TYPES_EN[me.code].name);
      expect(solo).toContain(`My texting MBTI is ${me.mbti.type}`);
      const pair = texts(cardTree(shape, me, friend, 'en')).join('\n');
      expect(pair).toContain(`${me.mbti.type} · ${kktiEnglishCode(me.code)}`);
      expect(pair).toContain(String(kktiMatch(me, friend).percent));
      // 한국어(기본)는 바뀐 게 없다
      expect(JSON.stringify(cardTree(shape, me))).toBe(JSON.stringify(cardTree(shape, me, null, 'ko')));
      expect(texts(cardTree(shape, me)).join('\n')).toContain(KKTI_TYPES[me.code].name);
    }
    expect(texts(cardTree('og', me, null, 'en')).join('\n')).toContain(`Texting Type ${kktiEnglishCode(me.code)}`);
  });

  const pngSize = (png: Buffer) => ({ signature: png.subarray(1, 4).toString('latin1'), width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

  it('영어 카드를 실제로 PNG 로 그린다', async () => {
    for (const [shape, a, w] of [
      ['og', me, null],
      ['story', me, friend],
      ['square', null, null],
    ] as const) {
      const png = await renderCard(shape, a, w, 'en');
      expect(pngSize(png)).toEqual({ signature: 'PNG', ...CARD_SIZE[shape] });
      expect(png.length).toBeGreaterThan(20_000);
    }
  }, 60_000);

  it('GET /api/kkti-card?l=en — 영어 카드, l 이 없으면 한국어 카드', async () => {
    const call = async (query: Record<string, string>) => {
      const res = fakeRes();
      await cardHandler({ method: 'GET', query, headers: {} } as never, res as never);
      return res;
    };
    const en = await call({ a: me.encoded, l: 'en' });
    const ja = await call({ a: me.encoded, l: 'ja' });
    const ko = await call({ a: me.encoded });
    for (const res of [en, ja, ko]) {
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(pngSize(res.body as Buffer)).toEqual({ signature: 'PNG', ...CARD_SIZE.og });
    }
    // 일본어 링크도 영어 카드 (같은 그림), 한국어 카드와는 다르다
    expect(Buffer.compare(en.body as Buffer, ja.body as Buffer)).toBe(0);
    expect(Buffer.compare(en.body as Buffer, ko.body as Buffer)).not.toBe(0);
    expect(Buffer.compare(ko.body as Buffer, await renderCard('og', me))).toBe(0);
  }, 60_000);
});
