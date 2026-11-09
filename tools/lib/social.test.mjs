import assert from 'node:assert/strict';
import { test } from 'node:test';

import { POST_WINDOW_HOURS, STALE_HOURS, assertAccount, dueEntries, igApiFor, kst, mediaUrl, normalizeText, pickAudio, problems, queueProblems, recentAudioIds } from './social.mjs';

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

test('올릴 항목 — 허락 · 시간 · 이미 올림 · 너무 오래됨', () => {
  const at = kst(base.at).getTime();
  const q = {
    entries: [
      base,
      { ...base, id: 'not-approved', approved: false },
      { ...base, id: 'later', at: '2026-11-05 21:00' },
      { ...base, id: 'earlier', at: '2026-11-04 20:00' },
    ],
  };
  const h = 3600_000;
  assert.deepEqual(dueEntries(q, new Date(at - 1)).map((e) => e.id), ['earlier']);
  assert.deepEqual(dueEntries(q, new Date(at + 60_000)).map((e) => e.id), ['earlier', 'd3-ig']);
  assert.deepEqual(dueEntries(q, new Date(at + 60_000), new Set(['d3-ig'])).map((e) => e.id), ['earlier']);
  // 예약 실행이 오래 멈췄다가 돌아오면 지난 글을 몰아 올리지 않는다 (11-06 22:00 — 이틀 전 것은 버리고 어제 것만)
  assert.ok(STALE_HOURS < 48);
  assert.deepEqual(dueEntries(q, new Date(at + 49 * h)).map((e) => e.id), ['later']);
});

test('예약 실행이 밀려도 새벽에 올리지 않고 다음 날 같은 시간대로', () => {
  const at = kst(base.at).getTime();
  const q = { entries: [base] };
  assert.deepEqual(dueEntries(q, new Date(at + (POST_WINDOW_HOURS * 3600_000) - 1)).map((e) => e.id), ['d3-ig']); // 23:59
  assert.deepEqual(dueEntries(q, new Date(at + POST_WINDOW_HOURS * 3600_000)), []); // 00:00
  assert.deepEqual(dueEntries(q, new Date(at + 7.5 * 3600_000)), []); // 04:30 (2026-11 에 실제로 밀린 시각)
  assert.deepEqual(dueEntries(q, new Date(at + 24.5 * 3600_000)).map((e) => e.id), ['d3-ig']); // 다음 날 21:30
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
