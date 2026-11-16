import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickForDays } from '../social-make/plan.mjs';
import { addSnapshot, inWindow, learnModel, planWeek, rankItems, reportMarkdown, scorePosts, scoreSnap, spreadOf, topicsOf } from './learn.mjs';

const H = 3_600_000;
const at = (iso) => new Date(iso);

/** 성과 표 만들기 — [id, format, kind, views, shares, saved, topics] 를 3일(72시간) 스냅숏으로 */
function stats(rows) {
  const s = { posts: {} };
  for (const [id, format, kind, views, shares = 0, saved = 0, topics = []] of rows) {
    const postedAt = '2026-11-01T12:00:00Z';
    addSnapshot(s, id, { postedAt, format, kind, topics }, { views, reach: views, shares, saved, comments: 0 }, new Date(at(postedAt).getTime() + 72 * H));
  }
  return s;
}

test('주제 — 해시태그 묶음 + 첫 줄 모양, 창고에 topics 가 있으면 그것', () => {
  assert.deepEqual(topicsOf({ hook: '아프다고 했을 때\nT 여친 vs F 남친', caption: '... #TF #커플카톡 #연애' }).sort(), ['꼴: 대비', '성향·궁합', '커플'].sort());
  assert.deepEqual(topicsOf({ hook: '"다음에 밥 한번\n먹자"의 진짜 뜻', caption: '#썸 #카톡답장 #소개팅' }).sort(), ['꼴: 받은 카톡', '썸', '약속·데이트'].sort());
  assert.deepEqual(topicsOf({ topics: ['재회·전 애인'], caption: '#썸' }), ['재회·전 애인']);
  assert.deepEqual(topicsOf({ caption: '#연애 #카톡답장' }), []);
});

test('스냅숏 — 같은 날 다시 돌면 바꿔 끼우고, 점수는 60시간 이상 중 가장 이른 것', () => {
  const s = {};
  const meta = { postedAt: '2026-11-10T12:00:00Z', format: 'chat-reel' };
  addSnapshot(s, 'a', meta, { views: 50 }, at('2026-11-11T01:00:00Z'));
  addSnapshot(s, 'a', meta, { views: 60 }, at('2026-11-11T05:00:00Z'));
  assert.equal(s.posts.a.snaps.length, 1);
  assert.equal(s.posts.a.snaps[0].views, 60);
  assert.equal(scoreSnap(s.posts.a.snaps), null); // 17시간 — 재는 중
  addSnapshot(s, 'a', meta, { views: 120 }, at('2026-11-13T01:00:00Z')); // 61시간
  addSnapshot(s, 'a', meta, { views: 150 }, at('2026-11-14T01:00:00Z')); // 85시간
  assert.equal(scoreSnap(s.posts.a.snaps).views, 120);
  // 오래 쌓여도 기준 스냅숏은 남는다
  for (let d = 1; d <= 25; d++) addSnapshot(s, 'a', meta, { views: 200 }, new Date(at('2026-11-14T01:00:00Z').getTime() + d * 24 * H));
  assert.ok(s.posts.a.snaps.length <= 12);
  assert.equal(scoreSnap(s.posts.a.snaps).views, 120);
});

test('점수 — 계정 중앙값 대비 조회·퍼짐, 공유가 많으면 조회가 같아도 위', () => {
  assert.equal(spreadOf({ reach: 100, shares: 1, saved: 1, comments: 1 }), 6);
  assert.equal(spreadOf({ reach: 5, shares: 1 }), 10); // 도달이 너무 작으면 30명으로 본다
  const { rows, base } = scorePosts(stats([['a', 'chat-reel', 'reel', 200, 3], ['b', 'chat-reel', 'reel', 200, 0], ['c', 'kkti-pair', 'carousel', 20, 0]]));
  assert.equal(base.views, 200);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.ok(by.a.score > by.b.score);
  assert.ok(by.b.score > by.c.score);
});

test('배우기 — 표본이 적으면 평균 쪽으로, 새 포맷은 같은 종류(릴스·캐러셀) 성적에서 시작', () => {
  const s = stats([
    ['r1', 'chat-reel', 'reel', 300, 2],
    ['r2', 'chat-reel', 'reel', 250, 1],
    ['r3', 'old-reel', 'reel', 180],
    ['c1', 'kkti-pair', 'carousel', 15],
    ['c2', 'old-carousel', 'carousel', 12],
  ]);
  const m = learnModel(s, { formats: ['chat-reel', 'kkti-pair', 'app-reel', 'list-carousel'], now: at('2026-11-17T01:00:00Z') });
  assert.equal(m.scored, 5);
  assert.ok(m.formats['chat-reel'].score > 0);
  assert.ok(m.formats['chat-reel'].score < m.formats['chat-reel'].mean); // 당겨짐
  assert.equal(m.formats['app-reel'].n, 0);
  assert.ok(m.formats['app-reel'].score > 0); // 릴스 종류 성적
  assert.ok(m.formats['list-carousel'].score < 0); // 캐러셀 종류 성적
  assert.equal(m.best[0].id, 'r1');
  assert.equal(m.week.length, 7);
});

test('한 주 구성 — 7칸, 한 포맷 3칸까지, 덜 해 본 포맷은 한 칸 시험, 같은 포맷 연달아 없음', () => {
  const model = { formats: { a: { n: 9, score: 2 }, b: { n: 9, score: 0.5 }, c: { n: 9, score: -1 }, d: { n: 0, score: -2 }, e: { n: 5, score: -3 } } };
  const week = planWeek(model, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(week.length, 7);
  const count = (f) => week.filter((x) => x === f).length;
  assert.equal(count('a'), 3);
  assert.ok(count('d') >= 1); // 시험 칸
  assert.ok(count('b') >= count('c'));
  for (let i = 1; i < week.length; i++) assert.notEqual(week[i], week[i - 1]);
  // 포맷이 둘뿐이어도 7칸
  assert.equal(planWeek({ formats: { a: { n: 3, score: 0 }, b: { n: 3, score: 0 } } }, ['a', 'b']).length, 7);
});

test('같은 포맷 안 고를 순서 — 잘 된 주제 먼저, 최근 주제와 겹치면 뒤로, 나머지는 창고 순서', () => {
  const model = { topics: { 커플: { score: 0.8 }, 썸: { score: 0 }, '연락 텀·읽씹': { score: -0.6 } } };
  const items = [
    { id: 'read', caption: '#읽씹' },
    { id: 'none', caption: '#연애' },
    { id: 'couple', caption: '#커플' },
    { id: 'couple2', caption: '#장기연애' },
  ];
  assert.deepEqual(rankItems(items, model).map((x) => x.id), ['couple', 'couple2', 'none', 'read']);
  // 조금 나은 주제는 연달아 나오지 않게 미루고, 훨씬 나은 주제는 연달아도 먼저
  const slight = { topics: { ...model.topics, 커플: { score: 0.2 } } };
  assert.deepEqual(rankItems(items, slight, ['커플']).map((x) => x.id), ['none', 'couple', 'couple2', 'read']);
  assert.equal(rankItems(items, model, ['커플'])[0].id, 'couple');
});

test('날짜 창 — 크리스마스 항목은 그 전에만, 창 밖이면 다른 항목', () => {
  const xmas = { id: 'x', format: 'chat-reel', until: '2026-12-24' };
  assert.ok(inWindow(xmas, '2026-12-24'));
  assert.ok(!inWindow(xmas, '2026-12-25'));
  assert.ok(inWindow({ from: '2026-12-01' }, '2026-12-01'));
  const items = [xmas, { id: 'y', format: 'chat-reel' }];
  assert.deepEqual(pickForDays(items, new Set(), ['2026-12-26'], ['chat-reel']).map((p) => p.item.id), ['y']);
  assert.deepEqual(pickForDays(items, new Set(), ['2026-12-20', '2026-12-21'], ['chat-reel']).map((p) => p.item.id), ['x', 'y']);
});

test('보고 — 배운 게 없으면 그렇게, 있으면 포맷 표와 다음 주 구성', () => {
  assert.match(reportMarkdown({ scored: 0 }), /배운 게 없어요/);
  const s = stats([['r1', 'chat-reel', 'reel', 300, 2, 0, ['커플']], ['r2', 'chat-reel', 'reel', 100, 0, 0, ['커플']], ['c1', 'kkti-pair', 'carousel', 15]]);
  const md = reportMarkdown(learnModel(s, { formats: ['chat-reel', 'kkti-pair'] }));
  assert.match(md, /카톡 재현 릴스/);
  assert.match(md, /다음 주 구성/);
  assert.match(md, /커플/);
});
