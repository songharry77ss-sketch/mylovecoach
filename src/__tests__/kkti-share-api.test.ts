/**
 * api/_kkti-share.ts · api/kkti-card.ts — KKTI 공유 링크(/k/코드)의 미리보기 페이지와 결과 카드 그림.
 * 카톡·인스타는 이 페이지의 og 태그만 읽어 미리보기를 만든다.
 */
import { CARD_EXTRA_EMOJI, CARD_SIZE, cardTree, emojiImage, renderCard } from '../../api/_kkti-card';
import cardHandler from '../../api/kkti-card';
import shareHandler, { allowedHost, escapeHtml, shareHtml, sharePage } from '../../api/_kkti-share';
import vercelConfig from '../../vercel.json';
import { KKTI_AXES, KKTI_CODES, KKTI_MATCH_TIERS, KKTI_QUESTIONS, KKTI_TYPES, computeKkti, kktiFromCode, kktiMatch } from '@/lib/kkti';

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
    // 미리보기 제목은 누구나 아는 「진짜 MBTI」로 시작하고, KKTI 코드는 설명에 둔다
    expect(page.title.startsWith(`내 카톡 속 진짜 MBTI는 ${me.mbti.type}`)).toBe(true);
    expect(page.description).toContain(`KKTI ${me.code}`);
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
    expect(page.title).toContain('MBTI 궁합');
    expect(page.description).toContain(`${me.mbti.type} ${me.type.emoji} ${me.type.name}`);
    expect(page.description).toContain(`${friend.mbti.type} ${friend.type.emoji} ${friend.type.name}`);
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
    // 공유 주소(/k…)에서만 넘어간다 (앱 화면 주소에서 같은 주소로 끝없이 넘어가지 않게)
    const guard = /<script>if\((.+?)\)location\.replace/.exec(html)?.[1] ?? '';
    const runs = (pathname: string) => Function('location', `return ${guard}`)({ pathname }) as boolean;
    expect(['/k', '/k/abc123', '/k/abc123-def456'].every(runs)).toBe(true);
    expect(['/kkti', '/kkti/result', '/', '/kk'].some(runs)).toBe(false);
    // 미리보기 수집기가 따라가 og 태그 없는 앱 화면을 읽지 않게, 넘어가기는 스크립트로만 (스크립트를 끈 곳은 본문 링크로)
    expect(html).not.toContain('http-equiv');
    expect(html).toContain(`<a href="${page.target.replace(/&/g, '&amp;')}">`);
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

  it('미리보기 주소에는 우리 주소만 쓴다 (배포별 주소·로컬은 그대로, 그 밖은 운영 주소로)', () => {
    for (const host of ['mylovecoach.vercel.app', 'MyLoveCoach.vercel.app', 'mylovecoach-abc123-harrys-projects.vercel.app', 'localhost:8123']) expect(allowedHost(host)).toBe(true);
    for (const host of ['', 'evil.com', 'mylovecoach.vercel.app.evil.com', 'xmylovecoach-a.vercel.app', 'evil.com/"><script>', 'localhost.evil.com']) expect(allowedHost(host)).toBe(false);

    const preview = share({ c: me.encoded }, { host: 'mylovecoach-abc123.vercel.app' });
    expect(meta(String(preview.body), 'og:image')).toBe(`https://mylovecoach-abc123.vercel.app/api/kkti-card?a=${me.encoded}`);
    // 남이 넣은 전달 헤더는 믿지 않고, 모르는 호스트는 운영 주소로
    const forwarded = share({ c: me.encoded }, { host: 'mylovecoach.vercel.app', 'x-forwarded-host': 'evil.com' });
    expect(meta(String(forwarded.body), 'og:image')).toBe(`${SITE}/api/kkti-card?a=${me.encoded}`);
    const odd = share({ c: me.encoded }, { host: 'evil.com' });
    expect(meta(String(odd.body), 'og:url')).toBe(`${SITE}/k/${me.encoded}`);
    expect(meta(String(share({ c: me.encoded }, { host: 'localhost:8123' }).body), 'og:url')).toBe(`http://localhost:8123/k/${me.encoded}`);
  });

  it('유입 표시는 정해진 세 가지, 안전한 글자만 받는다', () => {
    const res = share({ c: '', utm_source: 'tiktok', utm_medium: '<b>', utm_campaign: 'w1', ref: 'x' });
    expect(String(res.body)).toContain('location.replace("/kkti?utm_source=tiktok&utm_campaign=w1");');
  });

  it('앱 화면 주소에서 넘어온 요청은 a·w 쿼리로 받는다 (/kkti/result?a=…&w=…)', () => {
    const solo = share({ a: me.encoded });
    expect(meta(String(solo.body), 'og:image')).toBe(`${SITE}/api/kkti-card?a=${me.encoded}`);
    const pair = share({ a: me.encoded, w: friend.encoded });
    expect(meta(String(pair.body), 'og:image')).toBe(`${SITE}/api/kkti-card?a=${me.encoded}&w=${friend.encoded}`);
    expect(meta(String(pair.body), 'og:title')).toContain('궁합');
    // 친구 코드만 들고 온 테스트 첫 화면(/kkti?w=…)은 소개 카드
    expect(meta(String(share({ w: friend.encoded }).body), 'og:image')).toBe(`${SITE}/api/kkti-card`);
    // 이 응답은 어디에도 남기지 않는다 — 같은 주소를 사람이 열면 앱 화면이 나가야 한다
    expect(share({ a: me.encoded, via: 'app' }).headers['cache-control']).toBe('no-store');
    expect(share({ c: me.encoded }).headers['cache-control']).toContain('s-maxage');
  });

  it('GET 이 아니면 405', () => {
    expect(share({ c: me.encoded }, { host: 'mylovecoach.vercel.app' }, 'POST').statusCode).toBe(405);
  });
});

describe('배포 설정', () => {
  it('사람·검색 로봇은 /kkti·/kkti/result 에서 KKTI 머리말이 든 앱 화면을 받는다 (미리보기 수집기 규칙 뒤, 앱 화면 넘기기 앞)', () => {
    const rw = vercelConfig.rewrites as { source: string; destination: string; has?: unknown[] }[];
    const fallback = rw.findIndex((r) => r.destination === '/index.html');
    for (const [source, dest] of [
      ['/kkti', '/kkti.html'],
      ['/kkti/result', '/kkti-result.html'],
    ]) {
      const bot = rw.findIndex((r) => r.source === source && r.has);
      const plain = rw.findIndex((r) => r.source === source && !r.has);
      expect(bot).toBeGreaterThanOrEqual(0);
      expect(plain).toBeGreaterThan(bot);
      expect(plain).toBeLessThan(fallback);
      expect(rw[plain].destination).toBe(dest);
    }
  });

  it('검색용 정적 페이지(/kkti/types·/kkti/type/:mbti·/guide·/guide/:slug)는 앱 화면 넘기기보다 먼저 제 파일로 간다', () => {
    const rw = vercelConfig.rewrites as { source: string; destination: string; has?: unknown[] }[];
    const fallback = rw.findIndex((r) => r.destination === '/index.html');
    for (const [source, dest] of [
      ['/kkti/types', '/kkti/types/index.html'],
      ['/kkti/type/:mbti', '/kkti/type/:mbti/index.html'],
      ['/guide', '/guide/index.html'],
      ['/guide/:slug', '/guide/:slug/index.html'],
    ]) {
      const index = rw.findIndex((r) => r.source === source && !r.has);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(fallback);
      expect(rw[index].destination).toBe(dest);
    }
  });

  it('공유 주소(/k)는 앱 화면으로 넘기는 규칙보다 먼저 서버 함수로 간다', () => {
    const sources = vercelConfig.rewrites.map((r) => r.source);
    const fallback = vercelConfig.rewrites.findIndex((r) => r.destination === '/index.html');
    expect(sources.indexOf('/k')).toBeGreaterThanOrEqual(0);
    expect(sources.indexOf('/k')).toBeLessThan(fallback);
    expect(sources.indexOf('/k/:code')).toBeLessThan(fallback);
    expect(vercelConfig.rewrites.find((r) => r.source === '/k/:code')?.destination).toBe('/api/kkti-card?route=share&c=:code');
  });

  it('주소창에서 복사한 KKTI 주소는 미리보기 수집기에게만 공유 페이지로 넘긴다', () => {
    const fallback = vercelConfig.rewrites.findIndex((r) => r.destination === '/index.html');
    for (const source of ['/kkti/result', '/kkti']) {
      const index = vercelConfig.rewrites.findIndex((r) => r.source === source);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(fallback);
      const rule = vercelConfig.rewrites[index] as { destination: string; has?: { type: string; key: string; value: string }[] };
      expect(rule.destination).toBe('/api/kkti-card?route=share&via=app');
      expect(rule.has).toHaveLength(1);
      expect(rule.has?.[0]).toMatchObject({ type: 'header', key: 'user-agent' });
      // Vercel 은 이 값을 헤더 전체와 맞춰 본다
      const bots = new RegExp(`^${rule.has?.[0].value}$`);
      for (const ua of [
        'facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33984',
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
        'Twitterbot/1.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
        'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      ])
        expect(bots.test(ua)).toBe(true);
      // 사람과 검색 엔진은 앱 화면을 그대로 받는다 (공유 페이지는 noindex 라 검색에 잡히면 안 된다)
      for (const ua of [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 KAKAOTALK 11.0.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)',
        '',
      ])
        expect(bots.test(ua)).toBe(false);
    }
  });

  it('카드 그림 함수에 글꼴·이모지 파일을 함께 싣는다', () => {
    expect(vercelConfig.functions['api/kkti-card.ts'].includeFiles).toBe('api/_assets/**');
  });

  it('배포 확인(vercel.yml)이 쓰는 답 코드는 맞는 코드다 — 문항을 바꿔 코드가 달라지면 워크플로도 고친다', () => {
    expect(kktiFromCode('000006')).not.toBeNull();
    expect(kktiFromCode('9zldr5')).not.toBeNull();
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
      // 혼자 카드는 맨 위에 「카톡 속 진짜 MBTI는 ○○○○」, 궁합 카드는 두 사람의 MBTI
      expect(JSON.stringify(cardTree(shape, me))).toContain(`카톡 속 진짜 MBTI는 ${me.mbti.type}`);
      expect(JSON.stringify(cardTree(shape, me, friend))).toContain(`${me.mbti.type} · ${me.code}`);
      expect(JSON.stringify(cardTree(shape, me, friend))).toContain(`${friend.mbti.type} · ${friend.code}`);
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
