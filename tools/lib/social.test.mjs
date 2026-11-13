import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FEED_PER_DAY, STALE_DAYS, assertAccount, dueEntries, igApiFor, kst, mediaUrl, normalizeText, pickAudio, problems, queueProblems, recentAudioIds } from './social.mjs';

const carousel = (n, ext = 'jpg') => Array.from({ length: n }, (_, i) => `marketing/social/d3/${String(i + 1).padStart(2, '0')}.${ext}`);
const base = { id: 'd3-ig', at: '2026-11-04 21:00', channel: 'instagram', kind: 'carousel', media: carousel(10), caption: '캡션 #KKTI', approved: true };

test('한국 시간 → UTC', () => {
  assert.equal(kst('2026-11-04 21:00').toISOString(), '2026-11-04T12:00:00.000Z');
  assert.equal(kst('2026-11-05T08:30').toISOString(), '2026-11-04T23:30:00.000Z');
  assert.throws(() => kst('11/4 9pm'), /시간 형식/);
});

test('그림 주소는 커밋에 고정된 jsDelivr 주소 (한글·공백은 인코딩)', () => {
  assert.equal(mediaUrl('marketing/social/d3/01.jpg', 'abc1234'), 'https://cdn.jsdelivr.net/gh/songharry77ss-sketch/mylovecoach@abc1234/marketing/social/d3/01.jpg');
  assert.equal(mediaUrl('/a/릴스 1.mp4', 'abc1234'), 'https://cdn.jsdelivr.net/gh/songharry77ss-sketch/mylovecoach@abc1234/a/%EB%A6%B4%EC%8A%A4%201.mp4');
  assert.throws(() => mediaUrl('a.jpg', 'main'), /커밋 해시/);
  assert.throws(() => mediaUrl('../x.jpg', 'abc1234'), /잘못된 경로/);
});

test('항목 검사 — 채널별 제한', () => {
  assert.deepEqual(problems(base), []);
  assert.match(problems({ ...base, media: carousel(11) }).join(), /2~10장/);
  assert.match(problems({ ...base, media: carousel(3, 'png') }).join(), /\.jpg 만/);
  assert.match(problems({ ...base, caption: '가'.repeat(2201) }).join(), /너무 길어요/);
  assert.match(problems({ ...base, caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ') }).join(), /해시태그/);
  assert.match(problems({ ...base, kind: 'reel', media: ['a.jpg'] }).join(), /mp4/);
  assert.deepEqual(problems({ ...base, kind: 'reel', media: ['marketing/social/d4/reel.mp4'] }), []);
  assert.deepEqual(problems({ ...base, kind: 'story', media: ['marketing/social/d4/story-1.jpg'], caption: '' }), []);
  assert.deepEqual(problems({ ...base, kind: 'story', media: ['marketing/social/d4/story-2.mp4'], caption: '' }), []);
  assert.match(problems({ ...base, kind: 'story', media: ['a.png'] }).join(), /스토리/);
  assert.match(problems({ ...base, kind: 'story', media: ['a.jpg', 'b.jpg'] }).join(), /스토리/);
  assert.match(problems({ ...base, channel: 'threads', kind: 'story', media: ['a.jpg'] }).join(), /kind/);
  assert.deepEqual(problems({ ...base, channel: 'threads', kind: 'text', media: [], caption: '질문 글' }), []);
  assert.match(problems({ ...base, channel: 'threads', kind: 'text', media: [], caption: 'a '.repeat(260) }).join(), /500자/);
  assert.match(problems({ ...base, channel: 'threads', kind: 'reel' }).join(), /kind/);
  assert.match(problems({ ...base, id: 'Bad Id' }).join(), /id/);
});

test('큐 검사 — id 중복도 잡는다', () => {
  assert.deepEqual(queueProblems({ entries: [base] }), []);
  assert.match(queueProblems({ entries: [base, base] }).join(), /겹쳐요/);
  assert.match(queueProblems({}).join(), /entries/);
});

const ids = (list) => list.map((e) => e.id);
const posts = (...list) => ({ posts: list.map(([id, at]) => ({ id, channel: 'instagram', at: kst(at).toISOString() })) });

test('올릴 항목 — 허락 · 이미 올림 · 하루 하나 · 예정 시각 순서', () => {
  const q = {
    entries: [
      base, // 11-04 21:00
      { ...base, id: 'not-approved', approved: false },
      { ...base, id: 'later', at: '2026-11-05 21:00' },
      { ...base, id: 'earlier', at: '2026-11-04 20:00' },
    ],
  };
  assert.equal(FEED_PER_DAY, 1);
  // 21:00 항목은 그날 12시부터 — 먼저 예정된 것 하나만
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-04 12:00'))), ['earlier']);
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-04 21:30'))), ['earlier']);
  // 오늘 이미 하나 올렸으면 더 안 올린다 → 다음 날 하나씩
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-04 22:00'), posts(['earlier', '2026-11-04 18:40']))), []);
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-05 13:00'), posts(['earlier', '2026-11-04 18:40']))), ['d3-ig']);
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-06 13:00'), posts(['earlier', '2026-11-04 18:40'], ['d3-ig', '2026-11-05 13:00']))), ['later']);
  // id 집합만 주면 하루 개수는 세지 않는다 (예전 호출 방식)
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-04 21:30'), new Set(['earlier']))), ['d3-ig']);
  // 예정일에서 STALE_DAYS 넘게 지난 것은 버린다
  assert.deepEqual(ids(dueEntries({ entries: [base] }, new Date(kst(base.at).getTime() + STALE_DAYS * 86_400_000 + 60_000))), []);
});

test('예약 실행이 아무 때나 돌아도 — 새벽엔 안 올리고, 그날 낮 12시~자정 실행이면 올린다', () => {
  const q = { entries: [base] };
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-04 11:59'))), []); // 12시 전
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-04 11:10'))), []);
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-04 18:55'))), ['d3-ig']); // 2026-11-10 실제 실행 시각 — 예전 규칙(21~24시)이면 놓침
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-04 23:59'))), ['d3-ig']);
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-05 00:17'))), []); // 자정 넘음 (2026-11-11 실제로 17분 늦어 놓친 시각)
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-05 04:30'))), []);
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-05 15:33'))), ['d3-ig']); // 다음 날 낮에 이어서
});

test('스토리는 하루 개수에 세지 않는다', () => {
  const story = { ...base, id: 'd3-story', kind: 'story', media: ['marketing/social/d3/story.jpg'] };
  const q = { entries: [base, story] };
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-04 21:00'))), ['d3-ig', 'd3-story']);
  assert.deepEqual(ids(dueEntries(q, kst('2026-11-04 22:00'), posts(['d3-ig', '2026-11-04 21:00']))), ['d3-story']);
  const q2 = { entries: [{ ...base, id: 'other' }, story] };
  assert.deepEqual(ids(dueEntries(q2, kst('2026-11-04 22:00'), posts(['d3-story', '2026-11-04 21:00']))), ['other']);
});

test('같은 글 판단은 공백 차이를 무시', () => {
  assert.equal(normalizeText('a  \nb\n\n\n\nc\r\n'), 'a\nb\n\nc');
});

test('다른 계정 토큰이면 멈춘다', () => {
  assert.doesNotThrow(() => assertAccount('instagram', 'My.LoveCoach', 'my.lovecoach'));
  assert.throws(() => assertAccount('instagram', 'wolha.en', 'my.lovecoach'), /wolha\.en/);
  assert.doesNotThrow(() => assertAccount('instagram', 'anything', ''));
});

const reel = { ...base, id: 'd4-ig-reel', kind: 'reel', media: ['marketing/social/d4/reel.mp4'] };

test('릴스 음원 항목 검사', () => {
  assert.deepEqual(problems({ ...reel, audio: { trending: true, videoVolume: 1, minSeconds: 10 } }), []);
  assert.deepEqual(problems({ ...reel, audio: { id: '587784541076604' } }), []);
  assert.deepEqual(problems({ ...reel, audio: { search: ['체포하겠어 ILLIT', 'IVE'], trending: true, required: false } }), []);
  assert.match(problems({ ...reel, audio: {} }).join(), /id · search · trending/);
  assert.match(problems({ ...reel, audio: { id: 'abc' } }).join(), /audio\.id/);
  assert.match(problems({ ...reel, audio: { trending: true, videoVolume: 0 } }).join(), /videoVolume/);
  assert.match(problems({ ...reel, audio: { trending: true, audioVolume: 101 } }).join(), /audioVolume/);
  assert.match(problems({ ...reel, audio: { search: '' } }).join(), /audio\.search/);
  assert.match(problems({ ...base, audio: { trending: true } }).join(), /릴스에만/);
  assert.match(problems({ ...reel, audio: 'trending' }).join(), /객체/);
});

test('토큰 종류 — IG 로 시작하면 인스타 로그인, 아니면 페이스북 로그인, IG_API 가 있으면 그것', () => {
  assert.equal(igApiFor('IGAAxyz'), 'instagram');
  assert.equal(igApiFor('EAAGxyz'), 'facebook');
  assert.equal(igApiFor('IGAAxyz', 'facebook'), 'facebook');
  assert.equal(igApiFor('EAAGxyz', ''), 'facebook');
  assert.throws(() => igApiFor('EAAG', 'tiktok'), /IG_API/);
});

const songs = [
  { id: '1', title: '체포하겠어 (Preview)', artist: 'ILLIT', durationMs: 25_000 },
  { id: '2', title: 'Love Is All', artist: '검정치마', durationMs: 200_000 },
  { id: '3', title: 'Short Clip', artist: 'X', durationMs: 8_000 },
];

test('음원 고르기 — 검색어 낱말이 제목·가수에 다 있는 첫 곡, 최근에 쓴 곡·짧은 곡은 뺀다', () => {
  assert.equal(pickAudio(songs, { query: '체포하겠어 illit' })?.id, '1');
  assert.equal(pickAudio(songs, { query: '검정치마' })?.id, '2');
  assert.equal(pickAudio(songs, { query: '없는 곡' }), null);
  assert.equal(pickAudio(songs)?.id, '1');
  assert.equal(pickAudio(songs, { avoid: new Set(['1']) })?.id, '2');
  assert.equal(pickAudio(songs, { avoid: new Set(['1', '2']), minSeconds: 10 }), null);
  assert.equal(pickAudio([], {}), null);
});

test('최근에 쓴 음원 id', () => {
  const posted = { posts: [{ id: 'a', audio: { id: '1' } }, { id: 'b' }, { id: 'c', audio: { id: '2' } }, { id: 'd', audio: { id: '3' } }] };
  assert.deepEqual([...recentAudioIds(posted, 2)], ['2', '3']);
  assert.deepEqual([...recentAudioIds({}, 5)], []);
});
