// ai-reel(AI 인물 + 실제 앱)의 계산 부분 — node --test tools/social-make/ai-reel.test.mjs
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FORMATS } from './formats/index.mjs';
import { personImage, personPrompt, resolveCuts } from './formats/ai-reel.mjs';
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

test('막장 연애 3부작 예시 — 셋 다 검사를 통과하고 같은 가상 주인공 그림을 쓴다', () => {
  const series = JSON.parse(readFileSync(new URL('./samples/makjang-series.json', import.meta.url), 'utf8')).items;
  assert.equal(series.length, 3);
  for (const it of series) {
    assert.deepEqual(FORMATS['ai-reel'].check(it), [], it.id);
    assert.ok(it.person.image.startsWith('tools/social-make/samples/makjang/'), it.person.image);
    assert.match(it.caption, /지어낸 이야기/);
  }
});

test('주인공 기준 그림 — 읽어서 영상 모델에 넘길 모양으로, 없거나 형식이 틀리면 막는다', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ai-reel-'));
  writeFileSync(path.join(dir, 'a.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const got = personImage({ person: { image: 'a.jpg' } }, dir);
  assert.equal(got.mime, 'image/jpeg');
  assert.equal(got.data.length, 4);
  assert.match(got.sha, /^[0-9a-f]{16}$/);
  assert.equal(personImage({ person: {} }, dir), null);
  assert.throws(() => personImage({ person: { image: 'nope.png' } }, dir), /파일이 없어요/);
  assert.throws(() => personImage({ person: { image: 'a.gif' } }, dir), /png·jpg·webp/);
  assert.ok(FORMATS['ai-reel'].check({ ...sample, person: { ...sample.person, image: 'tools/없는-그림.jpg' } }).some((p) => p.includes('파일이 없어요')));
});

test('사람 장면 자막 위치(captionTop) — 얼굴을 가리지 않게 내릴 수 있고, 인스타 아래 글 자리는 넘지 않는다', () => {
  assert.deepEqual(FORMATS['ai-reel'].check({ ...sample, person: { ...sample.person, captionTop: 1150 } }), []);
  assert.ok(FORMATS['ai-reel'].check({ ...sample, person: { ...sample.person, captionTop: 1500 } }).some((p) => p.includes('captionTop')));
  assert.ok(FORMATS['ai-reel'].check({ ...sample, person: { ...sample.person, captionTop: '1150' } }).some((p) => p.includes('captionTop')));
});

test('상대 인물 장면(other) — 드라마 시리즈 예시는 검사를 통과하고, 빠진 칸은 막는다', async () => {
  const { resolveOtherCut } = await import('./formats/ai-reel.mjs');
  const drama = JSON.parse(readFileSync(new URL('./samples/drama-series.json', import.meta.url), 'utf8')).items[0];
  assert.deepEqual(FORMATS['ai-reel'].check(drama), []);
  const bad = { ...drama, person: { ...drama.person, other: { caption: '아주아주아주아주아주아주 긴 자막', seconds: 30, image: 'nope.gif' } } };
  const p = FORMATS['ai-reel'].check(bad);
  assert.ok(p.some((x) => x.includes('person.other.caption')));
  assert.ok(p.some((x) => x.includes('person.other.prompt')));
  assert.ok(p.some((x) => x.includes('person.other.seconds')));
  assert.ok(p.some((x) => x.includes('person.other.image')));
  // 자르기 — 기본 0.2~4.6, 영상보다 길면 끝에 맞춤, 너무 짧으면 막음
  assert.deepEqual(resolveOtherCut(undefined, 8), [0.2, 4.6]);
  assert.ok(resolveOtherCut([1, 20], 6)[1] < 6);
  assert.throws(() => resolveOtherCut([0, 0.5], 8), /너무 짧아요/);
});

test('영상은 앱 코칭 키(GEMINI_API_KEY)로 대신 만들지 않는다 — 영상용 키가 없으면 멈춘다', async () => {
  const keep = { on: process.env.SOCIAL_AI_VIDEO, app: process.env.GEMINI_API_KEY, video: process.env.GEMINI_VIDEO_API_KEY };
  process.env.SOCIAL_AI_VIDEO = 'on';
  process.env.GEMINI_API_KEY = 'app-coach-key';
  delete process.env.GEMINI_VIDEO_API_KEY;
  try {
    await assert.rejects(omniVideo({ prompt: 'x' }), /GEMINI_VIDEO_API_KEY/);
  } finally {
    for (const [k, v] of [['SOCIAL_AI_VIDEO', keep.on], ['GEMINI_API_KEY', keep.app], ['GEMINI_VIDEO_API_KEY', keep.video]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
