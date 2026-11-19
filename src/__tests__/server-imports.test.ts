/**
 * 서버 함수(api/*.ts)가 불러오는 파일은 상대 경로로만 서로를 부른다.
 * Vercel 함수는 앱의 경로 별칭(@/…)을 풀지 못해서, 하나라도 섞이면 함수가 켜지지 못하고 모든 요청이 500(FUNCTION_INVOCATION_FAILED)이 된다
 * (2026-11-20 0시 src/lib/ai-backup.ts 로 운영 코치가 8분 멈춤). jest 는 별칭을 풀어 주므로 다른 시험으로는 잡히지 않는다.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'api');

/** 줄 머리의 import·export … from '…' 경로들 — 타입만 부르는 것(import type …)은 실행 전에 지워지므로 뺀다 */
const specifiers = (source: string) =>
  [...source.matchAll(/^\s*(?:import|export)(\s+type\b)?[^'"]*?from\s*['"]([^'"]+)['"]/gm)].filter((m) => !m[1]).map((m) => m[2]);

function resolveLocal(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && candidate.match(/\.tsx?$/)) return candidate;
  }
  return null;
}

it('서버 함수가 닿는 파일에는 @/ 별칭이 없다', () => {
  const entries = readdirSync(API).filter((f) => f.endsWith('.ts')).map((f) => path.join(API, f));
  const seen = new Set<string>();
  const bad: string[] = [];
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('@/')) bad.push(`${path.relative(ROOT, file)} → ${spec}`);
      else if (spec.startsWith('.')) {
        const next = resolveLocal(file, spec);
        if (next) queue.push(next);
      }
    }
  }
  expect(seen.size).toBeGreaterThan(10);
  expect(bad).toEqual([]);
});
