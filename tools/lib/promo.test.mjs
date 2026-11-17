import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergePromo, promoTotals } from './promo.mjs';

const now = new Date('2026-11-17T15:00:00Z');

test('처음 읽으면 그대로 쌓고 최신 날짜부터 정렬', () => {
  const out = mergePromo(null, {
    clicks: [
      { day: '2026-11-16', code: 'disquiet', device: 'w', count: 2 },
      { day: '2026-11-17', code: 'everytime-ku', device: 'a', count: 5 },
    ],
    opens: [{ day: '2026-11-17', code: 'everytime-ku', platform: 'web', count: 1 }],
  }, now);
  assert.equal(out.updatedAt, '2026-11-17T15:00:00.000Z');
  assert.deepEqual(out.clicks.map((r) => r.day), ['2026-11-17', '2026-11-16']);
  assert.equal(out.opens.length, 1);
});

test('같은 날·코드·기기는 큰 값을 남기고, 서버에서 사라진 옛날 기록은 그대로 둔다', () => {
  const prev = {
    clicks: [
      { day: '2026-11-01', code: 'old', device: 'a', count: 9 },
      { day: '2026-11-17', code: 'everytime-ku', device: 'a', count: 5 },
    ],
    opens: [],
  };
  const out = mergePromo(prev, { clicks: [{ day: '2026-11-17', code: 'everytime-ku', device: 'a', count: 8 }], opens: [] }, now);
  assert.deepEqual(out.clicks, [
    { day: '2026-11-17', code: 'everytime-ku', device: 'a', count: 8 },
    { day: '2026-11-01', code: 'old', device: 'a', count: 9 },
  ]);
  const again = mergePromo(out, { clicks: [{ day: '2026-11-17', code: 'everytime-ku', device: 'a', count: 3 }], opens: [] }, now);
  assert.equal(again.clicks[0].count, 8);
});

test('코드별 합계 — 기기별·앱 연 수·처음/마지막 날', () => {
  const totals = promoTotals({
    clicks: [
      { day: '2026-11-17', code: 'everytime-ku', device: 'a', count: 5 },
      { day: '2026-11-16', code: 'everytime-ku', device: 'i', count: 2 },
      { day: '2026-11-16', code: 'disquiet', device: 'w', count: 1 },
    ],
    opens: [{ day: '2026-11-17', code: 'everytime-ku', platform: 'web', count: 1 }],
  });
  assert.deepEqual(totals[0], { code: 'everytime-ku', clicks: 7, android: 5, ios: 2, web: 0, opens: 1, first: '2026-11-16', last: '2026-11-17' });
  assert.equal(totals[1].code, 'disquiet');
});
