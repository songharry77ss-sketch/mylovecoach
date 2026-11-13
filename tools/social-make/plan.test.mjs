import assert from 'node:assert/strict';
import { test } from 'node:test';

import { kst } from '../lib/social.mjs';
import { WEEK, firstFreeDay, nextDay, pickByPattern, pickNext } from './plan.mjs';

const it = (id, format) => ({ id, format });

test('다음 날 — 달·해 넘김', () => {
  assert.equal(nextDay('2026-11-30'), '2026-12-01');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
});

test('포맷이 번갈아 나오게 고른다 (창고 순서 유지, 이미 큐에 있는 건 뺌)', () => {
  const bank = [it('a', 'reel'), it('b', 'reel'), it('c', 'quiz'), it('d', 'reel'), it('e', 'list')];
  assert.deepEqual(pickNext(bank, new Set(), 5).map((x) => x.id), ['a', 'c', 'b', 'e', 'd']);
  assert.deepEqual(pickNext(bank, new Set(['a']), 2, 'quiz').map((x) => x.id), ['b', 'c']);
  // 같은 포맷만 남으면 그대로
  assert.deepEqual(pickNext([it('x', 'reel'), it('y', 'reel')], new Set(), 2, 'reel').map((x) => x.id), ['x', 'y']);
  assert.deepEqual(pickNext(bank, new Set(bank.map((x) => x.id)), 3), []);
});

test('한 주 구성대로 — 포맷이 바닥나면 다른 포맷으로 채움', () => {
  assert.equal(WEEK.filter((f) => f.endsWith('-reel')).length, 4);
  const bank = [it('r1', 'chat-reel'), it('r2', 'chat-reel'), it('p1', 'pick-carousel'), it('k1', 'kkti-pair'), it('k2', 'kkti-pair'), it('l1', 'list-carousel')];
  const pattern = ['chat-reel', 'pick-carousel', 'chat-reel', 'kkti-pair', 'chat-reel', 'list-carousel', 'pick-carousel'];
  // 세 번째 릴스 칸은 릴스가 없어서 바로 앞(kkti)과 다른 첫 항목, 마지막 pick 칸도 바닥 → 남은 kkti
  assert.deepEqual(pickByPattern(bank, new Set(), 7, pattern).map((x) => x.id), ['r1', 'p1', 'r2', 'k1', 'l1', 'k2']);
  assert.deepEqual(pickByPattern(bank, new Set(['r1', 'r2']), 2, pattern).map((x) => x.id), ['p1', 'k1']);
});

test('넣기 시작할 날 — 큐 마지막 피드 다음 날, 지났으면 내일 (스토리는 안 셈)', () => {
  const now = kst('2026-11-13 20:00');
  assert.equal(firstFreeDay([], now), '2026-11-14');
  assert.equal(firstFreeDay([{ at: '2026-11-12 21:00', kind: 'carousel' }], now), '2026-11-14');
  assert.equal(firstFreeDay([{ at: '2026-11-18 21:00', kind: 'reel' }, { at: '2026-11-20 21:00', kind: 'story' }], now), '2026-11-19');
});
