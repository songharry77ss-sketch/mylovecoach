// app-reel(실제 앱 사용 영상)의 계산 부분 — node --test tools/social-make/app-reel.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { analysisProblems, coachRequestOf, requestMismatch, todayLabel, typedText } from './coach-call.mjs';
import { FORMATS } from './formats/index.mjs';
import { pickIndex, timeline } from './formats/app-reel.mjs';

const item = {
  id: 'a-test',
  format: 'app-reel',
  hook: '"주말에 뭐해?"\n이렇게 답하면',
  name: '민준',
  avatar: '🐶',
  gender: 'male',
  messages: [
    { day: '11월 16일 월요일' },
    { from: 'them', text: '오늘 하루 어땠어?' },
    { from: 'me', text: '그냥 그랬지 ㅎㅎ' },
    { from: 'them', text: '주말에 뭐해?' },
  ],
  caption: '너라면 뭐라고 보낼래?\n\n#썸',
};

const analysis = {
  summary: '좋은 신호예요.',
  replies: [
    { text: 'a', expectedReaction: 'x', successRate: 70 },
    { text: 'b', expectedReaction: 'y', successRate: 82 },
    { text: 'c', expectedReaction: 'z', successRate: 64 },
  ],
};

test('앱 입력창에 칠 글 — 받은 카톡을 「이름: 말」 줄로 (날짜 줄은 뺌)', () => {
  assert.equal(typedText(item), '민준: 오늘 하루 어땠어?\n나: 그냥 그랬지 ㅎㅎ\n민준: 주말에 뭐해?');
  assert.equal(typedText({ ...item, typed: '  직접 쓴 글  ' }), '직접 쓴 글');
});

test('코칭 요청은 앱이 새 채팅방에서 보내는 모양과 같다', () => {
  const req = coachRequestOf(item, new Date('2026-11-17T12:00:00+09:00'));
  // 녹화에서 앱(hooks/use-coach)이 실제로 만든 요청 (2026-11-17 데모 웹에서 읽음)
  const fromApp = {
    crush: { name: '민준', gender: 'male', relationship: 'talking', style: [], notes: '', heat: 0 },
    user: { name: '', gender: 'female', style: [] },
    tone: 'natural',
    emoji: 'on',
    toneChosen: false,
    emojiChosen: false,
    text: '민준: 오늘 하루 어땠어?\n나: 그냥 그랬지 ㅎㅎ\n민준: 주말에 뭐해?',
    history: [],
    today: '11/17(화)',
  };
  assert.deepEqual(req, fromApp);
  assert.deepEqual(requestMismatch(req, fromApp), []);
  assert.equal(requestMismatch(req, { ...fromApp, text: '다른 글' }).length, 1);
  assert.equal(requestMismatch(req, { ...fromApp, crush: { ...fromApp.crush, relationship: 'ex' } }).length, 1);
});

test('오늘 날짜 표시는 한국 시각', () => {
  assert.equal(todayLabel(new Date('2026-11-16T16:00:00Z')), '11/17(화)');
});

test('결과 검사 — 답장 3개·예상 반응이 있어야 하고 데모 표시는 안 됨', () => {
  assert.deepEqual(analysisProblems(analysis), []);
  assert.ok(analysisProblems({ ...analysis, summary: '(데모 샘플) 좋아요' }).some((p) => p.includes('데모')));
  assert.ok(analysisProblems({ ...analysis, replies: analysis.replies.slice(0, 2) }).length);
  assert.ok(analysisProblems({ ...analysis, replies: [...analysis.replies.slice(0, 2), { text: 'c' }] }).length);
});

test('고를 답장 — 정하지 않으면 성공 확률이 가장 높은 것', () => {
  assert.equal(pickIndex(item, analysis), 1);
  assert.equal(pickIndex({ ...item, pick: 2 }, analysis), 2);
});

test('녹화 시각 ↔ 영상 시각 — 구간마다 최대 길이, 넘으면 빨리 감기', () => {
  const marks = { home: 0, form: 0.7, typing: 5.8, typed: 8.9, sent: 9.6, result: 11.9, scroll: 13.6, replies: 14.7, pick: 16.3, end: 18.2 };
  const tl = timeline(marks, 11);
  assert.ok(tl.total <= 11 + 1e-9);
  assert.ok(tl.total > 9);
  assert.equal(tl.rawAt(0), 0);
  // 보낸 순간은 영상에서도 같은 순간으로 돌아온다
  assert.ok(Math.abs(tl.rawAt(tl.outAt(marks.sent)) - marks.sent) < 1e-6);
  // 시간은 거꾸로 가지 않는다
  let prev = -1;
  for (let o = 0; o < tl.total; o += 0.05) {
    const r = tl.rawAt(o);
    assert.ok(r >= prev);
    prev = r;
  }
  // 예산이 작으면 같은 비율로 줄인다
  assert.ok(Math.abs(timeline(marks, 6).total - 6) < 1e-9);
});

test('창고 검사 규칙', () => {
  const check = FORMATS['app-reel'].check;
  assert.deepEqual(check(item), []);
  assert.ok(check({ ...item, hook: '열세 글자가 넘는 아주 긴 훅이에요' }).length);
  assert.ok(check({ ...item, messages: [{ from: 'them', text: '안녕' }, { from: 'me', text: '응' }] }).some((p) => p.includes('마지막')));
  assert.ok(check({ ...item, relationship: 'boss' }).length);
  assert.ok(check({ ...item, typed: '가'.repeat(91) }).some((p) => p.includes('90')));
  assert.ok(check({ ...item, pick: 3 }).length);
  assert.ok(check({ ...item, analysis: { ...analysis, summary: '(데모 샘플)' } }).length);
});
