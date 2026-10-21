/**
 * Vercel Hobby 요금제는 배포 하나에 서버 함수 12개까지다 (넘으면 배포가 ERROR 로 끝나고 운영은 예전 판에 머문다 — 2026-10-21).
 * api/ 아래 밑줄(_)로 시작하지 않는 파일 하나가 함수 하나다. 그래서 KKTI 서버 일(카드·공유 미리보기·횟수 집계)은
 * api/kkti-card.ts 하나가 route 로 나눠 맡고, 바깥 주소는 vercel.json rewrites 로 그대로 둔다.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

import cardHandler from '../../api/kkti-card';
import vercelConfig from '../../vercel.json';
import { computeKkti, KKTI_AXES, KKTI_QUESTIONS } from '@/lib/kkti';

const HOBBY_FUNCTION_LIMIT = 12;
const API_DIR = path.join(__dirname, '..', '..', 'api');

/** Vercel 이 함수로 만드는 파일 (밑줄·점으로 시작하는 폴더·파일은 빠진다) */
function functionFiles(dir = API_DIR, prefix = 'api'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) return [];
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return functionFiles(path.join(dir, entry.name), rel);
    return /\.(ts|js|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [rel] : [];
  });
}

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
  setHeader: (name: string, value: string) => FakeRes;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
  send: (body: unknown) => FakeRes;
  end: () => FakeRes;
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
  res.end = () => res;
  return res;
}

const call = async (query: Record<string, string>, method = 'GET') => {
  const res = fakeRes();
  await cardHandler({ method, query, headers: { host: 'mylovecoach.vercel.app' } } as never, res as never);
  return res;
};

function answersFor(code: string): number[] {
  const letters = Array.from(code);
  return KKTI_QUESTIONS.map((q) => {
    const axisIndex = KKTI_AXES.findIndex((a) => a.key === q.axis);
    const sign = letters[axisIndex] === KKTI_AXES[axisIndex].plus.letter ? 1 : -1;
    return q.options.findIndex((o) => o.score === sign * 2);
  });
}

describe('Vercel 함수 개수', () => {
  it(`배포 하나의 함수가 ${HOBBY_FUNCTION_LIMIT}개를 넘지 않는다 — 새 api 파일을 만들기 전에 기존 함수에 합칠 수 있는지 본다`, () => {
    const files = functionFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files.length).toBeLessThanOrEqual(HOBBY_FUNCTION_LIMIT);
  });

  it('functions 설정은 실제 함수 파일을 가리킨다 (합치며 이름이 바뀌면 글꼴·메모리 설정이 빠진다)', () => {
    const files = functionFiles();
    for (const key of Object.keys(vercelConfig.functions)) expect(files).toContain(key);
  });
});

describe('KKTI 함수 하나로 합치기', () => {
  const rewrites = vercelConfig.rewrites as { source: string; destination: string; has?: unknown[] }[];
  const fallback = rewrites.findIndex((r) => r.destination === '/index.html');

  it('바깥 주소(/k, /k/코드, /api/kkti-stat, /api/kkti-share)는 앱 화면 넘기기보다 먼저 합친 함수로 간다', () => {
    const expected: Record<string, string> = {
      '/k': '/api/kkti-card?route=share',
      '/k/:code': '/api/kkti-card?route=share&c=:code',
      '/api/kkti-stat': '/api/kkti-card?route=stat',
      '/api/kkti-share': '/api/kkti-card?route=share',
    };
    for (const [source, destination] of Object.entries(expected)) {
      const index = rewrites.findIndex((r) => r.source === source && !r.has);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(fallback);
      expect(rewrites[index].destination).toBe(destination);
    }
    // 예전 함수 주소로 가는 규칙이 남아 있으면 그 주소엔 함수가 없어 404 가 난다
    for (const r of rewrites) expect(r.destination.startsWith('/api/kkti-share') || r.destination.startsWith('/api/kkti-stat')).toBe(false);
  });

  it('route=share 는 공유 미리보기 페이지로 답하고, route 값은 넘어가는 주소에 싣지 않는다', async () => {
    const me = computeKkti(answersFor('선빠폭밀'));
    const res = await call({ route: 'share', c: me.encoded, utm_source: 'x' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(String(res.body)).toContain(`location.replace("/kkti/result?a=${me.encoded}&utm_source=x");`);
    expect(String(res.body)).not.toContain('route=');
    // 미리보기 수집기용(via=app)은 어디에도 남기지 않는다
    expect((await call({ route: 'share', a: me.encoded, via: 'app' })).headers['cache-control']).toBe('no-store');
  });

  it('route=stat 은 횟수 집계로 간다 — GET 은 405', async () => {
    const res = await call({ route: 'stat' });
    expect(res.statusCode).toBe(405);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('route 가 없으면 지금처럼 카드 그림 (POST 는 405)', async () => {
    expect((await call({}, 'POST')).statusCode).toBe(405);
  });
});
