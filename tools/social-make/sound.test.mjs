// 릴스 소리(sound.mjs) — node --test tools/social-make/sound.test.mjs
// ffmpeg 가 있으면(FFMPEG=<경로> 또는 PATH) 실제로 합성·섞기까지 확인한다
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { reelAnchors } from './formats/ai-reel.mjs';
import { ffmpegPath } from './kit.mjs';
import { DEFAULT_MODEL, DEFAULT_VOICES, SFX, addSound, defaultSound, elevenFile, elevenRequest, reelAudio, resolveCues, soundProblems } from './sound.mjs';

const caption = '읽씹 3시간… 사람 나오는 장면은 AI로 만든 연출, 목소리는 AI #센딧';

test('맞게 쓴 sound 는 통과한다', () => {
  const it = { format: 'ai-reel', caption, sound: [{ at: 'start', sfx: 'whoosh' }, { at: 0.4, say: '3시간째 읽씹…', voice: 'f' }, { at: 'reply', fx: 'phone buzzing on a wooden table', seconds: 1.5 }, { at: -2, sfx: 'ding', volume: 0.6 }] };
  assert.deepEqual(soundProblems(it, { anchors: true }), []);
  assert.deepEqual(soundProblems({ caption: 'x', sound: false }), []);
  assert.deepEqual(soundProblems({ caption: 'x' }), []);
});

test('잘못 쓴 sound 는 막는다', () => {
  const p = (sound, opt = { anchors: true }, cap = caption) => soundProblems({ caption: cap, sound }, opt).join(' / ');
  assert.match(p('ding'), /목록/);
  assert.match(p([{ at: 1, sfx: 'boom' }]), /sfx 는/);
  assert.match(p([{ at: 1, sfx: 'ding', say: '안녕' }]), /하나만/);
  assert.match(p([{ sfx: 'ding' }]), /at\(언제\)/);
  assert.match(p([{ at: 'middle', sfx: 'ding' }]), /start·other/);
  assert.match(p([{ at: 'reply', sfx: 'ding' }], { anchors: false }), /ai-reel 에서만/);
  assert.match(p([{ at: 1, say: '가'.repeat(61) }]), /60자/);
  assert.match(p([{ at: 1, say: '안녕', voice: 'x' }]), /voice/);
  assert.match(p([{ at: 1, fx: 'rain', seconds: 20 }]), /0\.5~10/);
  assert.match(p([{ at: 1, sfx: 'ding', volume: 3 }]), /volume/);
  // AI 목소리는 캡션에서 밝힌다
  assert.match(p([{ at: 1, say: '안녕' }], { anchors: true }, '센딧 써 봤어'), /AI 목소리/);
});

test('구간 이름·음수 시각을 실제 초로 바꾸고, 없는 구간·영상 밖은 뺀다', () => {
  const anchors = { start: 0, app: 4, sent: 14.5, reply: 18.5, end: 22.5 };
  const cues = resolveCues([{ at: 'reply', sfx: 'ding' }, { at: 'start', sfx: 'whoosh' }, { at: 'other', sfx: 'sting' }, { at: -1, sfx: 'pop' }, { at: 40, sfx: 'pop' }], { anchors, seconds: 26 });
  assert.deepEqual(cues.map((c) => [c.sfx, c.t]), [['whoosh', 0], ['ding', 18.5], ['pop', 25]]);
});

test('ai-reel 기본 소리 — 상대 장면이 있을 때만 반전 「둥」', () => {
  assert.deepEqual(defaultSound('ai-reel', { start: 0, reply: 18 }).map((c) => c.sfx), ['whoosh', 'ding']);
  assert.deepEqual(defaultSound('ai-reel', { start: 0, other: 4, reply: 18 }).map((c) => c.sfx), ['whoosh', 'sting', 'ding']);
  assert.deepEqual(defaultSound('chat-reel', {}), []);
});

test('구간 시각은 composeAiReel 이 잇는 순서를 따른다', () => {
  const cuts = { a: [0, 3.95], b: [4, 11.95], replyAt: 8.05 };
  assert.deepEqual(reelAnchors({ cuts, otherCut: null, headSeconds: 10 }), { start: 0, app: 3.95, sent: 13.95, reply: 18, end: 21.9 });
  const withOther = reelAnchors({ cuts, otherCut: [0, 4.95], headSeconds: 10 });
  assert.equal(withOther.other, 3.95);
  assert.equal(withOther.app, 8.9);
  assert.equal(withOther.reply, 22.95);
});

test('일레븐랩스 요청 — 목소리는 기본 모델·한국어 고정, 효과음은 길이', () => {
  const say = elevenRequest({ say: ' 3시간째 읽씹… ' }, {});
  assert.equal(say.path, `/text-to-speech/${DEFAULT_VOICES.f}`);
  assert.equal(say.body.model_id, DEFAULT_MODEL);
  assert.equal(say.body.language_code, 'ko');
  assert.equal(say.body.text, '3시간째 읽씹…');
  assert.equal(say.chars, 8);
  const m = elevenRequest({ say: '응', voice: 'm' }, { ELEVENLABS_VOICE_M: 'abcdefghijklmnop1234', ELEVENLABS_MODEL: 'eleven_multilingual_v2' });
  assert.equal(m.path, '/text-to-speech/abcdefghijklmnop1234');
  assert.equal(m.body.language_code, undefined); // v2 는 언어 고정을 받지 않는다
  const fx = elevenRequest({ fx: 'phone buzz', seconds: 1.5 }, {});
  assert.deepEqual([fx.path, fx.body.duration_seconds], ['/sound-generation', 1.5]);
});

/** 가짜 fetch — 부른 횟수와 마지막 요청을 남긴다 */
function fakeFetch({ status = 200, bytes = 2000, body = '' } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 400, status, text: async () => body, arrayBuffer: async () => new Uint8Array(bytes).fill(7).buffer };
  };
  return { fn, calls };
}

test('일레븐랩스 소리는 한 번 만들면 저장해 다시 쓰고, 키가 없으면 건너뛴다', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sound-'));
  const log = () => {};
  const none = fakeFetch();
  assert.equal(await elevenFile({ say: '안녕' }, dir, { env: {}, fetchImpl: none.fn, log }), null);
  assert.equal(none.calls.length, 0);

  const ok = fakeFetch();
  const env = { ELEVENLABS_API_KEY: 'test-key' };
  const first = await elevenFile({ say: '안녕' }, dir, { env, fetchImpl: ok.fn, log });
  assert.equal(first.source, 'eleven');
  assert.ok(existsSync(first.file) && existsSync(`${first.file}.json`));
  assert.match(ok.calls[0].url, /\/text-to-speech\/.+output_format=mp3_44100_128/);
  assert.equal(ok.calls[0].init.headers['xi-api-key'], 'test-key');
  assert.ok(!readFileSync(`${first.file}.json`, 'utf8').includes('test-key'));
  const again = await elevenFile({ say: '안녕' }, dir, { env, fetchImpl: ok.fn, log });
  assert.deepEqual([again.source, again.file, ok.calls.length], ['cache', first.file, 1]);

  const bad = fakeFetch({ status: 401, body: '{"detail":"invalid api key"}' });
  await assert.rejects(elevenFile({ say: '다른 말' }, dir, { env, fetchImpl: bad.fn, log }), (e) => /일레븐랩스 401/.test(e.message) && !e.message.includes('test-key'));
});

test('게시 음량 — 목소리가 있으면 영상 소리를 키우고 음원을 낮춘다', () => {
  const made = { seconds: 21.2 };
  assert.deepEqual(reelAudio({}, made, { voice: true, cues: 3 }), { trending: true, videoVolume: 100, audioVolume: 20, minSeconds: 22 });
  assert.deepEqual(reelAudio({}, made, { voice: false, cues: 3 }), { trending: true, videoVolume: 60, minSeconds: 22 });
  assert.deepEqual(reelAudio({}, made, null), { trending: true, videoVolume: 25, minSeconds: 22 });
  assert.deepEqual(reelAudio({ audio: { id: '1' } }, made, { voice: true }), { id: '1' });
});

// ───────────── ffmpeg 로 실제 확인 ─────────────

let ff = null;
try {
  ff = ffmpegPath();
} catch {
  ff = null;
}

/** 구간의 최대 음량(dB) */
function maxDb(file, from, to) {
  const r = spawnSync(ff, ['-hide_banner', '-ss', String(from), '-to', String(to), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = String(r.stderr).match(/max_volume: (-?[\d.]+|-inf) dB/);
  return m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : NaN;
}
const duration = (file) => {
  const m = String(spawnSync(ff, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr).match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
};

test('합성 효과음을 정한 시각에 얹고, 영상 길이는 그대로 둔다', { skip: !ff && 'ffmpeg 없음' }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sound-mix-'));
  const video = path.join(dir, 'reel.mp4');
  // 소리 없는 3초 검은 영상 (만든 릴스 대신)
  const r = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=3:r=30', '-c:v', 'mpeg4', video], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const logs = [];
  const res = await addSound({ format: 'chat-reel', caption: 'x', sound: [{ at: 0.2, sfx: 'whoosh' }, { at: 1.8, sfx: 'ding' }, { at: 2.2, say: '목소리' }] }, { media: [video], seconds: 3 }, dir, { env: {}, log: (m) => logs.push(m) });
  // 키가 없으니 목소리만 빠지고 효과음 둘은 붙는다
  assert.deepEqual(res, { cues: 2, voice: false, skipped: 1 });
  assert.ok(logs.some((l) => l.includes('ELEVENLABS_API_KEY')));
  assert.ok(Math.abs(duration(video) - 3) < 0.15, `길이 ${duration(video)}`);
  assert.ok(maxDb(video, 1.8, 2.2) > -25, '띠링이 들려야 해요');
  assert.ok(maxDb(video, 1.0, 1.6) < -50, '소리 없는 구간은 조용해야 해요');
  assert.ok(existsSync(path.join(dir, 'sound', 'sfx-ding.wav')));
});

test('효과음은 모두 합성된다', { skip: !ff && 'ffmpeg 없음' }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sound-sfx-'));
  const video = path.join(dir, 'reel.mp4');
  const n = Object.keys(SFX).length;
  const r = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=64x64:d=${2 * n}:r=30`, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'mpeg4', '-c:a', 'aac', video], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const sound = Object.keys(SFX).map((name, i) => ({ at: i * 2, sfx: name }));
  const res = await addSound({ format: 'app-reel', caption: 'x', sound }, { media: [video], seconds: 2 * n }, dir, { env: {}, log: () => {} });
  assert.equal(res.cues, n);
  Object.keys(SFX).forEach((name, i) => assert.ok(maxDb(video, i * 2, i * 2 + 1) > -40, `${name} 이 들려야 해요`));
});
