// ai-reel(AI 인물 + 실제 앱)의 계산 부분 — node --test tools/social-make/ai-reel.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FORMATS } from './formats/index.mjs';
import { personPrompt, resolveCuts } from './formats/ai-reel.mjs';
import { findVideo, omniVideo, pending } from './omni.mjs';

const sample = JSON.parse(readFileSync(new URL('./samples/ai-reel.json', import.meta.url), 'utf8')).items[0];

test('예시 항목은 검사를 통과한다', () => {
  assert.deepEqual(FORMATS['ai-reel'].check(sample), []);
  assert.equal(FORMATS['ai-reel'].kind, 'reel');
});

test('캡션에 AI 연출이라는 말이 없으면 막는다', () => {
  const bad = { ...sample, caption: '센딧 써 봤어 #센딧' };
  assert.ok(FORMATS['ai-reel'].check(bad).some((p) => p.includes('AI로 만든')));
});

test('사람 장면 자막이 없거나 길면 막는다', () => {
  const p = FORMATS['ai-reel'].check({ ...sample, person: { hook: '아주아주아주아주아주아주 긴 한 줄 자막', sent: '보냄' } });
  assert.ok(p.some((x) => x.includes('14자')));
  assert.ok(p.some((x) => x.includes('person.reply')));
});

test('자르기 구간 — 기본값과 영상 길이에 맞춘 조정', () => {
  const c = resolveCuts({}, 12);
  assert.deepEqual(c.a, [0.2, 3.8]);
  assert.equal(c.b[0], 4.2);
  assert.ok(c.b[1] <= 12 && c.b[1] > 11.9);
  assert.ok(c.replyAt > c.b[0] && c.replyAt < c.b[1]);
  // 영상이 짧게 나와도 끝을 넘지 않는다
  const s = resolveCuts({ a: [0, 3], b: [4, 20], replyAt: 30 }, 10);
  assert.ok(s.b[1] < 10 && s.replyAt < s.b[1]);
  assert.throws(() => resolveCuts({ a: [0, 0.5] }, 12), /너무 짧아요/);
});

test('사람 장면 글 — 화면이 안 보이게 · 말 없이 · 글자 없이', () => {
  const p = personPrompt(sample);
  assert.match(p, /screen is never visible/);
  assert.match(p, /no dialogue/);
  assert.match(p, /No on-screen text/);
  assert.equal(personPrompt({ person: { prompt: ' 직접 쓴 글 ' } }), '직접 쓴 글');
});

test('응답에서 영상 찾기 — 안쪽 어디에 있든', () => {
  const inline = { id: 'x', status: 'completed', steps: [{ type: 'user_input' }, { type: 'model_output', content: [{ type: 'text', text: 'ok' }, { type: 'video', mime_type: 'video/mp4', data: 'AAAA' }] }] };
  assert.equal(findVideo(inline).data, 'AAAA');
  assert.equal(findVideo({ output_video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc' } }).uri, 'https://generativelanguage.googleapis.com/v1beta/files/abc');
  assert.equal(findVideo({ steps: [{ content: [{ type: 'text', text: 'no' }] }] }), null);
  assert.ok(pending('in_progress') && !pending('completed') && !pending('failed'));
});

test('만들기 스위치가 꺼져 있으면 돈 드는 호출을 하지 않는다', async () => {
  const before = process.env.SOCIAL_AI_VIDEO;
  delete process.env.SOCIAL_AI_VIDEO;
  await assert.rejects(omniVideo({ prompt: 'x', key: 'k' }), /꺼져 있어요/);
  if (before !== undefined) process.env.SOCIAL_AI_VIDEO = before;
});
