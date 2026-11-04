import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STALE_HOURS, assertAccount, dueEntries, kst, mediaUrl, normalizeText, problems, queueProblems } from './social.mjs';

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
      { ...base, id: 'earlier', at: '2026-11-04 12:00' },
    ],
  };
  assert.deepEqual(dueEntries(q, new Date(at - 1)).map((e) => e.id), ['earlier']);
  assert.deepEqual(dueEntries(q, new Date(at + 60_000)).map((e) => e.id), ['earlier', 'd3-ig']);
  assert.deepEqual(dueEntries(q, new Date(at + 60_000), new Set(['d3-ig'])).map((e) => e.id), ['earlier']);
  // 예약 실행이 오래 멈췄다가 돌아오면 지난 글을 몰아 올리지 않는다
  assert.deepEqual(dueEntries(q, new Date(at + (STALE_HOURS + 1) * 3600_000)).map((e) => e.id), ['later']);
});

test('같은 글 판단은 공백 차이를 무시', () => {
  assert.equal(normalizeText('a  \nb\n\n\n\nc\r\n'), 'a\nb\n\nc');
});

test('다른 계정 토큰이면 멈춘다', () => {
  assert.doesNotThrow(() => assertAccount('instagram', 'My.LoveCoach', 'my.lovecoach'));
  assert.throws(() => assertAccount('instagram', 'wolha.en', 'my.lovecoach'), /wolha\.en/);
  assert.doesNotThrow(() => assertAccount('instagram', 'anything', ''));
});

test('인스타 토큰 종류에 따라 API 주소가 갈린다 (통합 로그인 토큰은 연장 안 함)', async () => {
  const { igBase, igMe, refreshToken } = await import('./meta-publish.mjs');
  assert.equal(igBase('IGAAfake'), 'https://graph.instagram.com/v23.0');
  assert.equal(igBase('EAAfake'), 'https://graph.facebook.com/v23.0');
  assert.deepEqual(await refreshToken('instagram', 'EAAfake'), { token: 'EAAfake', expiresInDays: null });
  await assert.rejects(() => igMe('EAAfake', 'abc'), /숫자 id/);
});
