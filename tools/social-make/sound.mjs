// 릴스 소리: 효과음(직접 합성) + 목소리·특수 효과음(일레븐랩스).
// 사장님 지시(11-23·11-26): 「음성·효과음은 일레븐랩스로 … 최대한 무료로」
//   - 기본 효과음(sfx)은 ffmpeg 로 직접 합성한다. 돈이 들지 않고 라이선스 걱정도 없다.
//   - 목소리(say)와 특수 효과음(fx)은 일레븐랩스로 만든다.
//     한 번 만든 소리는 <폴더>/sound/ 에 남긴다. 같은 글·목소리·모델이면 다시 부르지 않아 크레딧을 아낀다.
//   - 키(ELEVENLABS_API_KEY)가 없거나 부르기에 실패하면 그 소리만 빼고 영상은 그대로 만든다.
//     토요일 자동 생산이 멈추지 않게 하려는 것이다.
//
// 창고 항목: sound: [ { at, sfx } | { at, say, voice? } | { at, fx, seconds? } ] (각 항목에 volume? 0.05~2)
//   at: 초(음수는 끝에서부터) 또는 구간 이름. 구간 이름은 포맷이 알려 줄 때만 쓸 수 있다.
//       ai-reel 의 구간 이름: start · other · app · sent · reply · end
//   sfx: 아래 SFX 이름 · say: 읽을 글(한 줄 60자까지) · voice: 'f'(기본) | 'm' | 일레븐랩스 목소리 id
//   fx: 일레븐랩스 효과음 설명(영어가 잘 맞음) · seconds: 0.5~10
//   sound: false 면 소리를 붙이지 않는다(기본 효과음도 뺌)
// 설정(환경 변수): ELEVENLABS_API_KEY · ELEVENLABS_VOICE_F · ELEVENLABS_VOICE_M · ELEVENLABS_MODEL
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ffmpegPath } from './kit.mjs';

const str = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * 직접 합성하는 효과음. src 는 ffmpeg lavfi 소리 원본, chain 은 그 뒤에 붙는 필터.
 * 모두 수식으로 만든 소리라 외부 파일이 없고 저작권도 없다.
 */
export const SFX = {
  // 말풍선 「톡」(video.mjs 의 것과 같은 소리)
  pop: { src: "aevalsrc='0.35*sin(2*PI*(1250-500*t)*t)*exp(-38*t)':s=44100:d=0.16" },
  // 메시지 알림 「띠링」: 두 음이 차례로 울린다
  ding: { src: "aevalsrc='0.28*sin(2*PI*1568*t)*exp(-10*t)+0.28*sin(2*PI*2093*(t-0.12))*exp(-8*(t-0.12))*gte(t,0.12)':s=44100:d=0.7" },
  // 장면 넘어갈 때 「휙」
  whoosh: { src: 'anoisesrc=d=0.55:c=pink:a=0.6:r=44100', chain: 'highpass=f=500,lowpass=f=5000,afade=t=in:d=0.3:curve=exp,afade=t=out:st=0.3:d=0.25' },
  // 반전 「둥」: 낮게 떨어지는 울림
  sting: { src: "aevalsrc='0.8*sin(2*PI*(62-20*t)*t)*exp(-3.2*t)+0.25*sin(2*PI*124*t)*exp(-6*t)':s=44100:d=1.4" },
  // 휴대폰 진동 「드르륵」
  buzz: { src: "aevalsrc='0.35*sin(2*PI*170*t)*(0.6+0.4*sin(2*PI*28*t))*lt(mod(t,0.55),0.38)':s=44100:d=1.1" },
  // 두근 「쿵쿵」
  heart: { src: "aevalsrc='0.9*sin(2*PI*52*t)*exp(-22*t)+0.7*sin(2*PI*48*(t-0.24))*exp(-22*(t-0.24))*gte(t,0.24)':s=44100:d=0.7" },
  // 자판 치는 소리 「타닥타닥」
  typing: { src: "aevalsrc='0.5*(random(0)*2-1)*exp(-90*mod(t,0.13))*lt(mod(t,0.13),0.04)':s=44100:d=1.2", chain: 'highpass=f=1500' },
  // 긴장이 차오르는 「위이잉」
  rise: { src: "aevalsrc='0.22*sin(2*PI*(180+260*t)*t)*min(1,t/1.2)':s=44100:d=1.5", chain: 'afade=t=out:st=1.3:d=0.2' },
};

/** ai-reel 기본 소리 — 시작에 휙, 반전(상대) 장면에 둥, 답장이 올 때 띠링 */
export function defaultSound(format, anchors = {}) {
  if (format !== 'ai-reel') return [];
  return [{ at: 'start', sfx: 'whoosh' }, ...(anchors.other !== undefined ? [{ at: 'other', sfx: 'sting' }] : []), { at: 'reply', sfx: 'ding' }];
}

const ANCHOR_NAMES = ['start', 'other', 'app', 'sent', 'reply', 'end'];

/** 창고 항목의 sound 검사 — 문제 목록. anchors: 이 포맷이 구간 이름을 쓸 수 있는지 */
export function soundProblems(it, { anchors = false } = {}) {
  const s = it.sound;
  if (s === undefined || s === false) return [];
  if (!Array.isArray(s)) return ['sound 는 [ { at, sfx | say | fx } ] 목록이나 false'];
  const out = [];
  if (s.length > 12) out.push('sound 는 12개까지');
  s.forEach((c, i) => {
    const at = `sound[${i}]`;
    if (!c || typeof c !== 'object') return out.push(`${at} 는 { at, sfx | say | fx }`);
    const kinds = ['sfx', 'say', 'fx'].filter((k) => c[k] !== undefined);
    if (kinds.length !== 1) out.push(`${at} 에는 sfx · say · fx 중 하나만`);
    if (typeof c.at === 'number') {
      if (!Number.isFinite(c.at) || Math.abs(c.at) > 90) out.push(`${at}.at 은 -90~90 초`);
    } else if (typeof c.at === 'string') {
      if (!anchors) out.push(`${at}.at 구간 이름은 ai-reel 에서만 — 여기서는 초로`);
      else if (!ANCHOR_NAMES.includes(c.at)) out.push(`${at}.at 은 ${ANCHOR_NAMES.join('·')} 중 하나나 초`);
    } else out.push(`${at}.at(언제)이 필요해요`);
    if (c.sfx !== undefined && !SFX[c.sfx]) out.push(`${at}.sfx 는 ${Object.keys(SFX).join('·')} 중 하나`);
    if (c.say !== undefined) {
      if (!str(c.say)) out.push(`${at}.say 가 비었어요`);
      else if ([...c.say].length > 60 || c.say.includes('\n')) out.push(`${at}.say 는 한 줄 60자까지`);
    }
    if (c.voice !== undefined && !(c.voice === 'f' || c.voice === 'm' || /^[A-Za-z0-9]{16,40}$/.test(String(c.voice)))) out.push(`${at}.voice 는 f · m · 일레븐랩스 목소리 id`);
    if (c.fx !== undefined && !(str(c.fx) && c.fx.length <= 200)) out.push(`${at}.fx 는 200자까지 설명`);
    if (c.seconds !== undefined && !(typeof c.seconds === 'number' && c.seconds >= 0.5 && c.seconds <= 10)) out.push(`${at}.seconds 는 0.5~10`);
    if (c.volume !== undefined && !(typeof c.volume === 'number' && c.volume >= 0.05 && c.volume <= 2)) out.push(`${at}.volume 은 0.05~2`);
  });
  // AI 목소리라는 걸 캡션에서 밝힌다 (사람 장면 AI 표시와 같은 원칙)
  if (s.some((c) => c && c.say !== undefined) && !/AI/.test(String(it.caption ?? ''))) out.push('목소리(say)를 넣으면 caption 에 AI 목소리라고 써 주세요 (예: 「목소리는 AI」)');
  return out;
}

/**
 * sound 목록 → 실제 초로 바꾼 소리 목록 (영상 길이 안의 것만, 시간 순).
 * anchors: { start, other?, app, sent, reply, end } (초) · seconds: 영상 길이
 */
export function resolveCues(list, { anchors = {}, seconds }) {
  const out = [];
  for (const c of list ?? []) {
    let t = typeof c.at === 'number' ? c.at : anchors[c.at];
    if (typeof t !== 'number' || !Number.isFinite(t)) continue; // 이 영상에 없는 구간 (예: 상대 장면이 없는데 other)
    if (t < 0) t = seconds + t;
    if (t < 0 || t >= seconds - 0.05) continue;
    out.push({ ...c, t: Math.round(t * 1000) / 1000 });
  }
  return out.sort((a, b) => a.t - b.t);
}

// ───────────── 일레븐랩스 ─────────────

const ELEVEN = 'https://api.elevenlabs.io/v1';
// 목소리 기본값은 일레븐랩스 기본 제공 목소리(여러 언어를 읽음). 한국어가 더 자연스러운 목소리를 고르면
// 저장소 변수 ELEVENLABS_VOICE_F · ELEVENLABS_VOICE_M 에 그 id 를 넣는다.
export const DEFAULT_VOICES = { f: 'EXAVITQu4vr4xnSDxMaL', m: 'TX3LPaxmHKxFdv7VOQHJ' };
// flash v2.5 는 글자당 크레딧이 가장 적다(무료 한도로 더 많이 만들기). 더 자연스러운 목소리가 필요하면 eleven_multilingual_v2.
export const DEFAULT_MODEL = 'eleven_flash_v2_5';

export const voiceId = (v, env = process.env) => {
  if (v === undefined || v === 'f') return env.ELEVENLABS_VOICE_F || DEFAULT_VOICES.f;
  if (v === 'm') return env.ELEVENLABS_VOICE_M || DEFAULT_VOICES.m;
  return v;
};

/** 같은 요청이면 같은 파일 이름 — 다시 만들지 않으려고 */
export const soundKey = (obj) => createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);

/** 일레븐랩스 한 번 부르기 → mp3 Buffer. 오류 글에는 키가 들어가지 않는다 */
async function eleven(pathname, body, { key, fetchImpl = fetch }) {
  const res = await fetchImpl(`${ELEVEN}${pathname}${pathname.includes('?') ? '&' : '?'}output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`일레븐랩스 ${res.status}: ${String(await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error(`일레븐랩스 응답이 너무 짧아요 (${buf.length}바이트)`);
  return buf;
}

/** 일레븐랩스 요청 모양 — say(목소리) 또는 fx(효과음) */
export function elevenRequest(cue, env = process.env) {
  if (cue.say !== undefined) {
    const model = env.ELEVENLABS_MODEL || DEFAULT_MODEL;
    const voice = voiceId(cue.voice, env);
    // 언어 고정은 v2.5·v3 모델만 받는다
    const lang = /v2_5|v3/.test(model) ? { language_code: 'ko' } : {};
    return {
      kind: 'say',
      path: `/text-to-speech/${encodeURIComponent(voice)}`,
      body: { text: cue.say.trim(), model_id: model, ...lang, voice_settings: { stability: 0.45, similarity_boost: 0.8 } },
      key: { kind: 'say', text: cue.say.trim(), voice, model },
      chars: [...cue.say.trim()].length,
    };
  }
  const seconds = cue.seconds ?? 2;
  return {
    kind: 'fx',
    path: '/sound-generation',
    body: { text: cue.fx.trim(), duration_seconds: seconds, prompt_influence: 0.5 },
    key: { kind: 'fx', text: cue.fx.trim(), seconds },
    chars: 0,
  };
}

/** 일레븐랩스 소리 파일 — 저장해 둔 게 있으면 그것, 없으면 만들어 저장. 키가 없으면 null */
export async function elevenFile(cue, dir, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const req = elevenRequest(cue, env);
  const file = path.join(dir, `${req.kind}-${soundKey(req.key)}.mp3`);
  if (existsSync(file)) return { file, source: 'cache' };
  const key = env.ELEVENLABS_API_KEY;
  if (!str(key)) {
    log(`  소리: ${req.kind === 'say' ? `목소리 「${cue.say}」` : `효과음 「${cue.fx}」`} 건너뜀 — ELEVENLABS_API_KEY 가 없어요`);
    return null;
  }
  const buf = await eleven(req.path, req.body, { key, fetchImpl });
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, buf);
  writeFileSync(`${file}.json`, `${JSON.stringify({ at: new Date().toISOString(), ...req.key, note: '일레븐랩스로 만든 소리' }, null, 2)}\n`);
  log(`  소리: 일레븐랩스 ${req.kind === 'say' ? `목소리 ${req.chars}자` : `효과음 ${req.key.seconds}초`} 만듦`);
  return { file, source: 'eleven' };
}

// ───────────── ffmpeg ─────────────

function ff(args) {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg 실패: ${String(r.stderr).slice(-600)}`);
}

/** 합성 효과음 → wav 파일 (한 번 만들면 다시 씀) */
export function sfxFile(name, dir) {
  const s = SFX[name];
  if (!s) throw new Error(`효과음 ${name} 이 없어요`);
  const file = path.join(dir, `sfx-${name}.wav`);
  if (existsSync(file)) return file;
  mkdirSync(dir, { recursive: true });
  ff(['-f', 'lavfi', '-i', s.src, ...(s.chain ? ['-af', s.chain] : []), '-ac', '2', '-ar', '44100', file]);
  return file;
}

const hasAudio = (file) => /Stream #.*Audio:/.test(String(spawnSync(ffmpegPath(), ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr));

/**
 * 영상의 소리 위에 소리 파일들을 정해진 시각에 얹는다. 영상은 다시 인코딩하지 않는다(-c:v copy).
 * 끝없는 소리(무음 원본·apad)와 -shortest 를 같이 쓰면 ffmpeg 가 안 끝나는 경우가 있어 길이를 못 박는다
 */
export function mixInto(video, layers, seconds) {
  if (!layers.length) return;
  if (!(seconds > 0)) throw new Error('영상 길이를 알아야 소리를 얹어요');
  const len = seconds.toFixed(3);
  const tmp = `${video}.sound.mp4`;
  const base = hasAudio(video);
  const inputs = ['-i', video];
  if (!base) inputs.push('-f', 'lavfi', '-t', len, '-i', 'anullsrc=r=44100:cl=stereo');
  const first = base ? 1 : 2;
  for (const l of layers) inputs.push('-i', l.file);
  const ms = (t) => Math.max(0, Math.round(t * 1000));
  const parts = layers.map((l, i) => `[${first + i}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${l.volume.toFixed(2)},adelay=${ms(l.t)}:all=1[c${i}]`);
  const baseLabel = base ? '[0:a]' : '[1:a]';
  const filter = [
    ...parts,
    // 바탕 소리를 영상 길이에 딱 맞춘다 (짧으면 늘이고 길면 자름) — 섞은 소리 길이 = 영상 길이
    `${baseLabel}aresample=44100,aformat=channel_layouts=stereo,apad=whole_dur=${len},atrim=0:${len}[b]`,
    `[b]${layers.map((_, i) => `[c${i}]`).join('')}amix=inputs=${layers.length + 1}:normalize=0:duration=first,alimiter=limit=0.95[a]`,
  ].join(';');
  ff([...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-t', len, '-movflags', '+faststart', tmp]);
  rmSync(video, { force: true });
  renameSync(tmp, video);
}

/**
 * 만든 릴스에 소리를 입힌다. made: { media: [reel.mp4], seconds, anchors? }
 * 돌려주는 값: { cues: 붙인 수, voice: 목소리가 들어갔는지, skipped: 못 붙인 수 }
 */
export async function addSound(it, made, dir, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const video = made.media?.[0];
  if (!video || it.sound === false) return { cues: 0, voice: false, skipped: 0 };
  const list = it.sound ?? defaultSound(it.format, made.anchors);
  const cues = resolveCues(list, { anchors: made.anchors ?? {}, seconds: made.seconds ?? 0 });
  if (!cues.length) return { cues: 0, voice: false, skipped: 0 };
  const soundDir = path.join(dir, 'sound');
  const layers = [];
  let skipped = 0;
  for (const c of cues) {
    try {
      if (c.sfx) layers.push({ file: sfxFile(c.sfx, soundDir), t: c.t, volume: c.volume ?? 0.8, kind: 'sfx' });
      else {
        const got = await elevenFile(c, soundDir, { env, fetchImpl, log });
        if (got) layers.push({ file: got.file, t: c.t, volume: c.volume ?? (c.say ? 1.15 : 0.7), kind: c.say ? 'say' : 'fx' });
        else skipped++;
      }
    } catch (e) {
      // 소리 하나가 안 돼도 영상은 낸다 (자동 생산이 멈추지 않게)
      skipped++;
      log(`  소리: ${c.say ? '목소리' : c.fx ? '효과음' : c.sfx} 못 붙임 — ${e.message}`);
    }
  }
  mixInto(video, layers, made.seconds);
  const voice = layers.some((l) => l.kind === 'say');
  log(`  소리: ${layers.length}개 붙임${skipped ? ` · ${skipped}개 건너뜀` : ''} (${layers.map((l) => `${l.kind === 'sfx' ? path.basename(l.file, '.wav').replace('sfx-', '') : l.kind} ${l.t.toFixed(1)}초`).join(', ')})`);
  return { cues: layers.length, voice, skipped };
}

/** 게시할 때 인스타 음원과 섞는 음량 — 목소리가 있으면 영상 소리를 키우고 음원을 낮춘다 */
export function reelAudio(it, made, sound) {
  if (it.audio) return it.audio;
  const minSeconds = Math.ceil(made.seconds ?? 10);
  if (sound?.voice) return { trending: true, videoVolume: 100, audioVolume: 20, minSeconds };
  if (sound?.cues) return { trending: true, videoVolume: 60, minSeconds };
  return { trending: true, videoVolume: 25, minSeconds };
}
