/**
 * api/kkti-share.ts · api/kkti-card.ts — KKTI 공유 링크(/k/코드)의 미리보기 페이지와 결과 카드 그림.
 * 카톡·인스타는 이 페이지의 og 태그만 읽어 미리보기를 만든다.
 */
import { CARD_EXTRA_EMOJI, CARD_SIZE, cardTree, emojiImage, renderCard } from '../../api/_kkti-card';
import cardHandler from '../../api/kkti-card';
import shareHandler, { escapeHtml, shareHtml, sharePage } from '../../api/kkti-share';
import { KKTI_AXES, KKTI_CODES, KKTI_MATCH_TIERS, KKTI_QUESTIONS, KKTI_TYPES, computeKkti, kktiMatch } from '@/lib/kkti';

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
const SITE = 'https://mylovecoach.vercel.app';

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

const share = (query: Record<string, string>, headers: Record<string, string> = { host: 'mylovecoach.vercel.app' }, method = 'GET') => {
  const res = fakeRes();
  shareHandler({ method, query, headers } as never, res as never);
  return res;
};

/** HTML 에서 og:… 값을 읽는다 (& 같은 글자는 풀어서) */
function meta(html: string, property: string): string | null {
  const found = new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`).exec(html);
  return found ? found[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null;
}

describe('공유 페이지 내용', () => {
  it('내 결과 — 유형 이름과 유형 카드 그림, 결과 화면으로', () => {
    const page = sharePage(me.encoded, SITE);
    expect(page.title).toContain(me.type.name);
    expect(page.title).toContain(me.code);
    expect(page.description).toContain('궁합');
    expect(page.target).toBe(`/kkti/result?a=${me.encoded}`);
    expect(page.image).toBe(`${SITE}/api/kkti-card?a=${me.encoded}`);
    expect(page.url).toBe(`${SITE}/k/${me.encoded}`);
  });

  it('둘의 궁합 — 퍼센트와 궁합 카드 그림, 궁합 화면으로', () => {
    const page = sharePage(`${me.encoded}-${friend.encoded}`, SITE);
    const match = kktiMatch(me, friend);
    expect(page.title).toContain(`${match.percent}%`);
    expect(page.title).toContain(match.tier.label);
    expect(page.description).toContain(me.type.name);
    expect(page.description).toContain(friend.type.name);
    expect(page.target).toBe(`/kkti/result?a=${me.encoded}&w=${friend.encoded}`);
    expect(page.image).toBe(`${SITE}/api/kkti-card?a=${me.encoded}&w=${friend.encoded}`);
  });

  it('코드가 없거나 잘못됐으면 테스트 소개 — 테스트 첫 화면으로', () => {
    for (const code of ['', 'nope', 'zzzzzz', '<script>']) {
      const page = sharePage(code, SITE);
      expect(page.title).toContain('KKTI');
      expect(page.target).toBe('/kkti');
      expect(page.image).toBe(`${SITE}/api/kkti-card`);
    }
  });

  it('게시물 링크의 유입 표시(utm)를 앱 화면까지 싣는다', () => {
    const utm = { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'kkti-w1' };
    expect(sharePage('', SITE, utm).target).toBe('/kkti?utm_source=instagram&utm_medium=social&utm_campaign=kkti-w1');
    expect(sharePage(me.encoded, SITE, { utm_source: 'threads' }).target).toBe(`/kkti/result?a=${me.encoded}&utm_source=threads`);
  });
});

describe('공유 페이지 HTML', () => {
  it('og·트위터 미리보기 태그와 넘어가는 주소가 들어 있다', () => {
    const page = sharePage(`${me.encoded}-${friend.encoded}`, SITE);
    const html = shareHtml(page);
    expect(meta(html, 'og:title')).toBe(page.title);
    expect(meta(html, 'og:description')).toBe(page.description);
    expect(meta(html, 'og:image')).toBe(page.image);
    expect(meta(html, 'og:url')).toBe(page.url);
    expect(meta(html, 'og:image:width')).toBe('1200');
    expect(meta(html, 'og:image:height')).toBe('630');
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
    expect(meta(html, 'twitter:image')).toBe(page.image);
    expect(html).toContain(`location.replace(${JSON.stringify(page.target)});`);
    // 스크립트를 끈 곳에서도 넘어간다
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('noindex');
  });

  it('글자를 안전하게 바꿔 넣는다', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    const html = shareHtml({ title: '"><script>alert(1)</script>', description: 'd', target: '/kkti?x=</script><script>alert(2)</script>', image: 'i', url: 'u' });
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('</script><script>');
  });
});

describe('GET /k/코드', () => {
  it('미리보기 페이지를 돌려주고 CDN 에 잠깐 둔다', () => {
    const res = share({ c: me.encoded });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['cache-control']).toContain('s-maxage');
    expect(meta(String(res.body), 'og:image')).toBe(`${SITE}/api/kkti-card?a=${me.encoded}`);
  });

  it('들어온 주소(전용 주소 포함)를 그대로 미리보기 주소에 쓴다', () => {
    const res = share({ c: me.encoded }, { host: 'internal', 'x-forwarded-host': 'kkti.example.com' });
    expect(meta(String(res.body), 'og:image')).toBe(`https://kkti.example.com/api/kkti-card?a=${me.encoded}`);
    // 주소 모양이 아니면 기본 주소로
    const odd = share({ c: me.encoded }, { host: 'evil.com/"><script>' });
    expect(meta(String(odd.body), 'og:url')).toBe(`${SITE}/k/${me.encoded}`);
  });

  it('유입 표시는 정해진 세 가지, 안전한 글자만 받는다', () => {
    const res = share({ c: '', utm_source: 'tiktok', utm_medium: '<b>', utm_campaign: 'w1', ref: 'x' });
    expect(String(res.body)).toContain('location.replace("/kkti?utm_source=tiktok&utm_campaign=w1");');
  });

  it('GET 이 아니면 405', () => {
    expect(share({ c: me.encoded }, { host: 'mylovecoach.vercel.app' }, 'POST').statusCode).toBe(405);
  });
});

describe('결과 카드 그림', () => {
  it('카드에 쓰는 이모지 그림이 빠짐없이 들어 있다 (바꿨으면 scripts/make-kkti-emoji.ts 를 다시 돌린다)', () => {
    const wanted = [...KKTI_CODES.map((code) => KKTI_TYPES[code].emoji), ...KKTI_MATCH_TIERS.map((t) => t.emoji), ...KKTI_AXES.map((a) => a.emoji), ...CARD_EXTRA_EMOJI];
    for (const emoji of wanted) expect(emojiImage(emoji)).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(emojiImage('🦄')).toBeNull();
  });

  it('모양마다 뼈대가 나온다 (혼자·둘·소개)', () => {
    for (const shape of ['og', 'story', 'square'] as const) {
      for (const tree of [cardTree(shape, me), cardTree(shape, me, friend), cardTree(shape, null)]) {
        expect(tree.type).toBe('div');
        const json = JSON.stringify(tree);
        expect(json).toContain('KKTI');
        expect(json).toContain('Pretendard');
      }
      expect(JSON.stringify(cardTree(shape, me))).toContain(me.type.name);
      expect(JSON.stringify(cardTree(shape, me, friend))).toContain(String(kktiMatch(me, friend).percent));
    }
  });

  /** PNG 머리말에서 가로·세로 읽기 */
  const pngSize = (png: Buffer) => ({ signature: png.subarray(1, 4).toString('latin1'), width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

  it('실제로 PNG 를 그린다 (글꼴·이모지 포함)', async () => {
    for (const [shape, a, w] of [
      ['og', me, null],
      ['story', me, friend],
      ['square', null, null],
    ] as const) {
      const png = await renderCard(shape, a, w);
      expect(pngSize(png)).toEqual({ signature: 'PNG', ...CARD_SIZE[shape] });
      expect(png.length).toBeGreaterThan(20_000);
    }
  }, 60_000);

  it('GET /api/kkti-card — 코드가 잘못돼도 소개 카드로 답한다', async () => {
    const call = async (query: Record<string, string>, method = 'GET') => {
      const res = fakeRes();
      await cardHandler({ method, query, headers: {} } as never, res as never);
      return res;
    };
    const ok = await call({ a: me.encoded, w: friend.encoded, s: 'square' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/png');
    expect(ok.headers['cache-control']).toContain('immutable');
    expect(pngSize(ok.body as Buffer)).toEqual({ signature: 'PNG', ...CARD_SIZE.square });

    const fallback = await call({ a: 'nope', s: 'weird' });
    expect(fallback.statusCode).toBe(200);
    expect(pngSize(fallback.body as Buffer)).toEqual({ signature: 'PNG', ...CARD_SIZE.og });

    expect((await call({ a: me.encoded }, 'POST')).statusCode).toBe(405);
  }, 60_000);
});
