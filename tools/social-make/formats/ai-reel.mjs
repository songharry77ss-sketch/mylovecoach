// 「AI 인물 + 실제 앱」 릴스 — 사람이 실제로 쓰는 것처럼:
//   카페에서 썸 카톡을 받고 고민하는 사람(AI 영상) → 받은 카톡 → 폰 틀 안의 실제 앱(진짜 AI 답장 3개)
//   → 골라서 보내고 답을 받아 웃는 사람(AI 영상) → 예상 반응 카톡 → 끝 카드
// 정직: 사람 장면은 AI로 만든 연출이라 그 장면 내내 「AI로 만든 장면」을 붙이고, 캡션에도 꼭 쓴다(검사가 막음).
//       앱 화면과 답장은 운영 코치 서버의 실제 결과다 (app-reel 과 같음).
// 사람 장면은 Gemini Omni Flash 로 한 번에 12초를 만들고(omni.mjs), 앞부분(고민)과 뒷부분(보내고 답 받음)을 잘라 쓴다 — 같은 사람·같은 자리라 이어 보인다.
//
// 항목 (bank.json): app-reel 항목 + format: 'ai-reel', person: {
//   hook: '썸남이 먼저\n크리스마스 물어봄'(앞 장면 자막) · sent: '센딧이 골라 준 걸로 보냄' · reply: '답 왔다…'(뒷 장면 자막 둘),
//   who?, place?(영어 — 사람·장소 묘사) | prompt?(통째로), seconds? (6~15, 기본 12), resolution? ('720p' | '1080p'),
//   cuts?: { a: [시작, 끝], b: [시작, 끝], replyAt } (영상 속 초 — 기본 a 0.2~3.8 · b 4.2~끝 · replyAt 8.2),
//   image? (저장소 안 그림 경로 — 주인공 기준 그림. 시리즈에서 같은 사람이 나오게 영상 모델에 함께 넘긴다.
//           실제 인물 사진은 넣지 않는다 — AI로 만든 가상 인물 그림만),
//   other? — 상대 인물 장면 하나를 앞 장면 바로 뒤(앱 앞)에 끼운다 (드라마 시리즈: 두 사람이 번갈아 나오게):
//     { caption(자막), prompt(영어, 통째로), image?, seconds? (6~15, 기본 8), resolution?, cut?: [시작, 끝] (기본 0.2~4.6) }
//     → <폴더>/other.mp4 · other.json 으로 남겨 둔다 }
//   stills? — 돈 안 드는 정지 그림 모드 (2026-11-23 사장님 「무료로」): { a: 고민(훅) 그림, b: 답장 치는 그림, c?: 답 받고 반응 그림 (없으면 b) }
//     영상 모델 대신 그림을 천천히 다가가며(흔들림 조금) 4초씩 이어 12초 사람 영상을 만든다. other 는 { still } 로 — 흰 번쩍임 + 확 다가가기(반전).
//     그림은 Codex 그림 생성으로 만든 가상 인물만 (samples/<시리즈>/). prompt·image 는 안 쓴다.
//   motion? — 정지 그림 대신 쓸 움직이는 토막 (2026-11-26 사장님 「사람이 진짜 사람처럼 움직이게 · 무료로」): { a?, b?, c? } 저장소 안 mp4.
//     같은 이름의 정지 그림을 무료 Wan 2.2(허깅페이스 ZeroGPU 무료 할당, Apache-2.0 · 워터마크 없음)로 3~5초 움직이게 만든 것. 없는 칸은 정지 그림 그대로.
//     other 는 { still, motion? }. 토막이 장면보다 조금 짧으면 살짝 느리게(최대 1.3배) 늘리고, 그래도 모자라면 마지막 장면을 잡아 둔다.
//   badge? — 「AI로 만든 장면」 아래 작은 꼬리표 (예: '센딧 고민 1위 재연' — 앱 집계에 근거한 말만)
// 사람 영상은 <폴더>/person.mp4 로 남겨 두고 다시 만들지 않는다 (만들려면 SOCIAL_AI_VIDEO=on — 돈이 듦). 정지 그림 모드는 돈이 안 들어 매번 새로 만든다.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { coachRequestOf, demoUser, realAnalysis, requestMismatch, typedText } from '../coach-call.mjs';
import { box, col, ffmpegPath, png, text } from '../kit.mjs';
import { OMNI_MODEL, omniVideo } from '../omni.mjs';
import { recordApp } from '../record-app.mjs';
import { checkAppReel, makeAppReel, pickIndex } from './app-reel.mjs';

const W = 1080;
const H = 1920;
const str = (v) => typeof v === 'string' && v.trim().length > 0;

export const DEFAULT_WHO = 'a Korean woman in her mid-20s with natural makeup and shoulder-length dark hair, wearing a cream knit sweater';
export const DEFAULT_PLACE = 'a cozy Seoul café in the evening with warm string lights and a small Christmas tree far in the background';

/** 사람 장면을 만들 글 (영어가 모델이 더 잘 따른다) — 0~4초 고민 · 4~8초 답장 쳐서 보냄 · 8~12초 답 받고 웃음 */
export function personPrompt(it) {
  const p = it.person ?? {};
  if (str(p.prompt)) return p.prompt.trim();
  return [
    'Vertical 9:16 smartphone video in the style of a casual Instagram vlog: filmed on a phone propped up on the table facing her, natural indoor light, a tiny handheld wobble, realistic skin texture, no beauty filter, true-to-life colors.',
    `${p.who ?? DEFAULT_WHO} sits alone at a small wooden table in ${p.place ?? DEFAULT_PLACE}, an iced latte beside her. She holds her own smartphone in portrait orientation; the back of her phone faces the camera the whole time and its screen is never visible.`,
    '0-4s: a message arrives; she reads it, her eyebrows rise, then she frowns slightly and bites her lip, unsure how to reply, glancing up while thinking.',
    '4-8s: she types with both thumbs, focused; a small satisfied smile appears; she taps once firmly to send, puts the phone face-down on the table and sips her latte, glancing at the phone nervously.',
    '8-12s: the phone buzzes on the table; she picks it up, reads, covers her mouth with her hand and laughs with excitement, then looks into the camera with a delighted, slightly shy smile.',
    'Audio: quiet café ambience, cups clinking, soft background chatter. No music. She does not speak: no dialogue, no voice-over.',
    'No on-screen text, captions, subtitles, logos or watermarks.',
  ].join('\n');
}

const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** 기준 그림 — 저장소 기준 경로(실행 위치)에서 읽는다. 없으면 null */
function imageAt(rel, label, root = process.cwd()) {
  if (!str(rel)) return null;
  const file = path.resolve(root, rel);
  const mime = IMAGE_MIME[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`${label} 는 png·jpg·webp (${rel})`);
  if (!existsSync(file)) throw new Error(`${label} 파일이 없어요 (${rel})`);
  const data = readFileSync(file);
  return { data, mime, rel, sha: createHash('sha256').update(data).digest('hex').slice(0, 16) };
}

/** 주인공 기준 그림 (person.image) */
export const personImage = (it, root = process.cwd()) => imageAt(it.person?.image, 'person.image', root);
/** 상대 인물 기준 그림 (person.other.image) */
export const otherImage = (it, root = process.cwd()) => imageAt(it.person?.other?.image, 'person.other.image', root);

/** 정지 그림 모드의 그림들 — { a, b, c } (c 가 없으면 b). 정지 그림 모드가 아니면 null */
export function personStills(it, root = process.cwd()) {
  const s = it.person?.stills;
  if (!s) return null;
  const a = imageAt(s.a, 'person.stills.a', root);
  const b = imageAt(s.b, 'person.stills.b', root);
  const c = str(s.c) ? imageAt(s.c, 'person.stills.c', root) : b;
  if (!a || !b) throw new Error('person.stills 는 { a, b, c? } 그림 경로');
  return { a, b, c };
}
/** 상대 장면 정지 그림 (person.other.still) */
export const otherStill = (it, root = process.cwd()) => imageAt(it.person?.other?.still, 'person.other.still', root);

/** 움직이는 토막(mp4) — 저장소 기준 경로. 없으면 null */
function videoAt(rel, label, root = process.cwd()) {
  if (!str(rel)) return null;
  const file = path.resolve(root, rel);
  if (path.extname(file).toLowerCase() !== '.mp4') throw new Error(`${label} 는 mp4 (${rel})`);
  if (!existsSync(file)) throw new Error(`${label} 파일이 없어요 (${rel})`);
  return { rel, sha: createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16) };
}
/** 정지 그림 칸마다 바꿔 쓸 움직이는 토막 — { a?, b?, c? } (person.motion) */
export function personMotion(it, root = process.cwd()) {
  const m = it.person?.motion;
  if (m === undefined) return {};
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('person.motion 은 { a?, b?, c? } mp4 경로');
  const bad = Object.keys(m).filter((k) => !['a', 'b', 'c'].includes(k));
  if (bad.length) throw new Error(`person.motion 칸은 a·b·c 만 (${bad.join(', ')})`);
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, videoAt(v, `person.motion.${k}`, root)]).filter(([, v]) => v));
}
/** 상대 장면 움직이는 토막 (person.other.motion) */
export const otherMotion = (it, root = process.cwd()) => videoAt(it.person?.other?.motion, 'person.other.motion', root);

// ───────────── 자막 그림 (투명 PNG) ─────────────

/** 숏폼에서 흔한 흰 띠 자막 — 줄마다 흰 상자 */
function captionLines(value, top) {
  return col(
    { position: 'absolute', left: 0, right: 0, top, alignItems: 'center' },
    ...String(value)
      .split('\n')
      .map((line) => text(line, { marginTop: 8, padding: '10px 28px', borderRadius: 18, backgroundColor: '#FFFFFF', color: '#191F28', fontSize: 64, fontWeight: 800, letterSpacing: -2, lineHeight: 1.25 })),
  );
}
const aiTag = () =>
  box(
    { position: 'absolute', left: 44, top: 168, padding: '10px 22px', borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' },
    text('AI로 만든 장면', { fontSize: 30, fontWeight: 700, color: '#FFFFFF', letterSpacing: -0.5 }),
  );
/** 「AI로 만든 장면」 아래 꼬리표 (예: 센딧 고민 1위 재연) */
const badgeTag = (value) =>
  box(
    { position: 'absolute', left: 44, top: 236, padding: '10px 22px', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)' },
    text(value, { fontSize: 30, fontWeight: 800, color: '#191F28', letterSpacing: -0.5 }),
  );
/** 사람 장면 자막 위치(px, 1920 기준 위쪽 끝) — 기본 300(머리 위쪽). 얼굴을 보여 줘야 하면 person.captionTop 으로 가슴께(1150 안팎)로 내린다 */
export const CAPTION_TOP = 300;
export const overlayTree = (value, top = CAPTION_TOP, badge = null) =>
  box({ width: W, height: H, fontFamily: 'Pretendard' }, aiTag(), ...(str(badge) ? [badgeTag(badge)] : []), captionLines(value, top));

// ───────────── ffmpeg ─────────────

function ff(args) {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg 실패: ${String(r.stderr).slice(-600)}`);
}

/** 길이(초)와 소리 유무 — ffmpeg -i 의 안내 글에서 읽는다 (ffprobe 가 없는 곳도 있어서) */
export function probe(file) {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const s = String(r.stderr);
  const m = s.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return { seconds: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0, audio: /Stream #.*Audio:/.test(s) };
}

/** 자르기 구간 — 영상 길이에 맞춰 안전하게 */
export function resolveCuts(cuts = {}, seconds = 12) {
  const end = Math.max(1, seconds - 0.05);
  // 기본은 글(personPrompt)의 12초 순서 — 영상이 짧게 나오면 같은 비율로 당긴다
  const k = Math.min(1, seconds / 12);
  const a = cuts.a ?? [0.2, 3.8 * k];
  const b = cuts.b ?? [4.2 * k, end];
  const out = { a: [Math.max(0, a[0]), Math.min(end, a[1])], b: [Math.max(0, b[0]), Math.min(end, b[1])] };
  out.replyAt = Math.min(out.b[1] - 0.5, Math.max(out.b[0] + 0.5, cuts.replyAt ?? 8.2 * k));
  if (!(out.a[1] - out.a[0] >= 1) || !(out.b[1] - out.b[0] >= 2)) throw new Error(`사람 장면 자르기 구간이 너무 짧아요 (a ${out.a} · b ${out.b} · 영상 ${seconds.toFixed(1)}초)`);
  return out;
}

/** 정지 그림 모드의 기본 자르기 — 그림 a 0~4초(훅) · b 4~8초(보냄) · c 8~12초(답 받음) */
export const STILL_CUTS = { a: [0, 3.95], b: [4, 11.95], replyAt: 8.05 };

/** 상대 인물 장면 자르기 — 기본 0.2~4.6초, 영상 길이 안으로 */
export function resolveOtherCut(cut, seconds = 8) {
  const end = Math.max(1, seconds - 0.05);
  const c = cut ?? [0.2, 4.6];
  const out = [Math.max(0, c[0]), Math.min(end, c[1])];
  if (!(out[1] - out[0] >= 1)) throw new Error(`상대 장면 자르기 구간이 너무 짧아요 (${out} · 영상 ${seconds.toFixed(1)}초)`);
  return out;
}

const V = (label) => `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1${label ? `[${label}]` : ''}`;
const A = 'aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';

/**
 * 사람(앞) [+ 상대 인물] + 앱(훅·녹화) + 사람(뒤) + 끝(보내면?·끝 카드) → 한 편.
 * 인스타 게시 큐 가지가 커지지 않게 4~5MB 안팎으로 (영상은 파일째 올라간다)
 */
export function composeAiReel({ person, cuts, head, tail, ovA, ovB1, ovB2, other = null, out }) {
  const info = probe(person);
  const [a0, a1] = cuts.a;
  const [b0, b1] = cuts.b;
  const sw = (cuts.replyAt - b0).toFixed(3);
  const inputs = ['-i', person, '-i', person, '-i', ovA, '-i', ovB1, '-i', ovB2, '-i', head, '-i', tail];
  // 7·8번: 상대 인물 영상·자막 (있을 때만), 그 뒤: 소리 없는 영상용 무음
  const oInfo = other ? probe(other.file) : null;
  if (other) inputs.push('-i', other.file, '-i', other.ov);
  const silent = inputs.filter((x) => x === '-i').length;
  if (!info.audio || (oInfo && !oInfo.audio)) inputs.push('-f', 'lavfi', '-t', '30', '-i', 'anullsrc=r=44100:cl=stereo');
  const pa = info.audio ? '0:a' : `${silent}:a`;
  const pb = info.audio ? '1:a' : `${silent}:a`;
  const otherParts = [];
  if (other) {
    const [o0, o1] = other.cut;
    const od = (o1 - o0).toFixed(3);
    otherParts.push(
      `[7:v]trim=start=${o0}:end=${o1},setpts=PTS-STARTPTS,${V('po')}`,
      '[po][8:v]overlay=0:0,format=yuv420p[vo]',
      `[${oInfo.audio ? '7:a' : `${silent}:a`}]atrim=start=${o0}:end=${o1},asetpts=PTS-STARTPTS,volume=0.8,${A},apad=whole_dur=${od},atrim=0:${od}[ao]`,
    );
  }
  const filter = [
    `[0:v]trim=start=${a0}:end=${a1},setpts=PTS-STARTPTS,${V('pa')}`,
    '[pa][2:v]overlay=0:0,format=yuv420p[va]',
    `[1:v]trim=start=${b0}:end=${b1},setpts=PTS-STARTPTS,${V('pb')}`,
    `[pb][3:v]overlay=0:0:enable='lt(t,${sw})'[pb1]`,
    `[pb1][4:v]overlay=0:0:enable='gte(t,${sw})',format=yuv420p[vb]`,
    `[${pa}]atrim=start=${a0}:end=${a1},asetpts=PTS-STARTPTS,volume=0.8,${A},apad=whole_dur=${(a1 - a0).toFixed(3)},atrim=0:${(a1 - a0).toFixed(3)}[aa]`,
    `[${pb}]atrim=start=${b0}:end=${b1},asetpts=PTS-STARTPTS,volume=0.8,${A},apad=whole_dur=${(b1 - b0).toFixed(3)},atrim=0:${(b1 - b0).toFixed(3)}[ab]`,
    `[5:v]${V('vh0')}`,
    '[vh0]format=yuv420p[vh]',
    `[5:a]${A}[ah]`,
    `[6:v]${V('vt0')}`,
    '[vt0]format=yuv420p[vt]',
    `[6:a]${A}[at]`,
    ...otherParts,
    other ? '[va][aa][vo][ao][vh][ah][vb][ab][vt][at]concat=n=5:v=1:a=1[v][a]' : '[va][aa][vh][ah][vb][ab][vt][at]concat=n=4:v=1:a=1[v][a]',
  ].join(';');
  ff([...inputs, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-maxrate', '2200k', '-bufsize', '4400k', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', out]);
  return probe(out).seconds;
}

// ───────────── 사람 장면 ─────────────

/** AI 영상 한 토막 — <폴더>/<name>.mp4 와 <name>.json(만든 글·기준 그림) 으로 남겨 두고, 글·그림이 같으면 다시 만들지 않는다 */
async function aiClip(dir, name, { prompt, seconds, resolution, image }) {
  const file = path.join(dir, `${name}.mp4`);
  const metaFile = path.join(dir, `${name}.json`);
  if (existsSync(file)) {
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null;
    // 글·기준 그림을 고쳤어도 만들기가 꺼져 있으면(돈 안 씀) 있던 영상을 그대로 쓴다
    const same = meta && meta.prompt === prompt && (meta.image?.sha ?? null) === (image?.sha ?? null);
    if (!meta || same || process.env.SOCIAL_AI_VIDEO !== 'on') return { file, source: 'cache' };
  }
  const images = image ? [{ data: image.data, mime: image.mime }] : [];
  const buf = await omniVideo({ prompt, images, seconds, resolution, log: (m) => console.log(m) });
  writeFileSync(file, buf);
  const imageMeta = image ? { image: { file: image.rel, sha: image.sha } } : {};
  writeFileSync(metaFile, `${JSON.stringify({ at: new Date().toISOString(), model: OMNI_MODEL, seconds, resolution, note: 'AI로 만든 사람 장면 — 영상에 「AI로 만든 장면」 표시', ...imageMeta, prompt }, null, 2)}\n`);
  return { file, source: 'ai' };
}

/**
 * 정지 그림 한 장 → 움직이는 토막의 ffmpeg 필터 (천천히 다가가기 + 손에 든 듯 살짝 흔들림).
 * punch: 처음 0.25초에 흰 번쩍임 + 확 다가가기 (반전 장면). 출력 [label] 은 1080×1920·30fps
 */
export function stillFilter(input, seconds, label, { punch = false } = {}) {
  const n = Math.round(seconds * 30);
  const zoom = punch ? `if(lt(on,8),1+0.16*on/8,1.16+0.06*(on-8)/${n})` : `1+0.09*on/${n}`;
  return [
    `[${input}:v]scale=2240:3982:force_original_aspect_ratio=increase,crop=2240:3982`,
    `zoompan=z='${zoom}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)*0.42':d=1:s=1124x1998:fps=30`,
    `crop=1080:1920:x='22+12*sin(2*PI*t*0.61)':y='39+14*sin(2*PI*t*0.47)'`,
    ...(punch ? ['fade=t=in:st=0:d=0.25:color=white'] : []),
    `trim=end_frame=${n},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[${label}]`,
  ].join(',');
}

/**
 * 움직이는 토막(무료 Wan 2.2 — 560×832·16fps 안팎) → 1080×1920·30fps 토막의 ffmpeg 필터.
 * 장면보다 짧으면 최대 1.3배까지 느리게 늘리고, 그래도 모자라면 마지막 장면을 잡아 둔다. 아주 천천히 다가가고(반전은 punch),
 * 16→30fps 는 움직임 보간(mci)으로 — 그냥 늘리면 뚝뚝 끊겨 보인다
 */
export function motionFilter(input, seconds, clipSeconds, label, { punch = false } = {}) {
  const n = Math.round(seconds * 30);
  const k = Math.min(1.3, Math.max(1, seconds / Math.max(0.5, clipSeconds)));
  const zoom = punch ? `if(lt(on,8),1+0.14*on/8,1.14+0.04*(on-8)/${n})` : `1+0.05*on/${n}`;
  return [
    `[${input}:v]setpts=${k.toFixed(4)}*(PTS-STARTPTS)`,
    'minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1',
    'scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,unsharp=5:5:0.6',
    `zoompan=z='${zoom}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)*0.42':d=1:s=1080x1920:fps=30`,
    ...(punch ? ['fade=t=in:st=0:d=0.25:color=white'] : []),
    'tpad=stop_mode=clone:stop_duration=3',
    `trim=end_frame=${n},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[${label}]`,
  ].join(',');
}

/** 정지 그림(·움직이는 토막)들 → 소리 없는(무음 트랙) 영상 하나. parts: [{ image, video?, seconds, punch? }] — video 가 있으면 그림 대신 쓴다 */
export function stillClip(dir, name, parts, note) {
  const file = path.join(dir, `${name}.mp4`);
  const inputs = parts.flatMap((p) => (p.video ? ['-i', path.resolve(p.video.rel)] : ['-loop', '1', '-framerate', '30', '-t', String(p.seconds + 0.5), '-i', path.resolve(p.image.rel)]));
  const total = parts.reduce((s, p) => s + p.seconds, 0);
  inputs.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=r=44100:cl=stereo');
  const filters = parts.map((p, i) => (p.video ? motionFilter(i, p.seconds, probe(path.resolve(p.video.rel)).seconds, `s${i}`, { punch: p.punch }) : stillFilter(i, p.seconds, `s${i}`, { punch: p.punch })));
  const filter = [...filters, `${parts.map((_, i) => `[s${i}]`).join('')}concat=n=${parts.length}:v=1:a=0[v]`].join(';');
  ff([...inputs, '-filter_complex', filter, '-map', '[v]', '-map', `${parts.length}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-t', String(total), file]);
  const moving = parts.filter((p) => p.video).length;
  const meta = { at: new Date().toISOString(), mode: moving ? 'stills+motion' : 'stills', seconds: total, note, stills: parts.map((p) => ({ file: p.image.rel, sha: p.image.sha, seconds: p.seconds, punch: Boolean(p.punch), ...(p.video ? { motion: { file: p.video.rel, sha: p.video.sha } } : {}) })) };
  writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(meta, null, 2)}\n`);
  if (moving) console.log(`  ${name}: 움직이는 토막 ${moving}/${parts.length}칸 (무료 Wan 2.2)`);
  return { file, source: 'stills' };
}

function personClip(it, dir) {
  const s = personStills(it);
  if (s) {
    const m = personMotion(it);
    const note = m.a || m.b || m.c ? 'AI로 만든 가상 인물 그림(Codex) + 그 그림을 움직인 토막(Wan 2.2) — 영상에 「AI로 만든 장면」 표시' : 'AI로 만든 가상 인물 그림(Codex) — 영상에 「AI로 만든 장면」 표시';
    return stillClip(dir, 'person', ['a', 'b', 'c'].map((k) => ({ image: s[k], video: m[k] ?? null, seconds: 4 })), note);
  }
  return aiClip(dir, 'person', { prompt: personPrompt(it), seconds: it.person.seconds ?? 12, resolution: it.person.resolution ?? '1080p', image: personImage(it) });
}

function otherClip(it, dir) {
  const o = it.person.other;
  const still = otherStill(it);
  if (still) return stillClip(dir, 'other', [{ image: still, video: otherMotion(it), seconds: o.seconds ?? 5, punch: true }], 'AI로 만든 가상 인물 그림(Codex) — 반전 장면');
  return aiClip(dir, 'other', { prompt: o.prompt.trim(), seconds: o.seconds ?? 8, resolution: o.resolution ?? it.person.resolution ?? '1080p', image: otherImage(it) });
}

// ───────────── 검사 · 만들기 (formats/index.mjs 가 부름) ─────────────

export function checkAiReel(it, msgProblems) {
  const out = checkAppReel(it, msgProblems);
  const p = it.person;
  if (!p || typeof p !== 'object') return [...out, 'person(사람 장면: hook·sent·reply)이 필요해요'];
  for (const k of ['hook', 'sent', 'reply']) {
    if (!str(p[k])) out.push(`person.${k}(사람 장면 자막)이 비었어요`);
    else if (p[k].split('\n').some((l) => [...l].length > 14)) out.push(`person.${k} 한 줄은 14자까지 (\\n 으로 나누기)`);
    else if (p[k].split('\n').length > 3) out.push(`person.${k} 는 3줄까지`);
  }
  if (p.seconds !== undefined && !(Number.isInteger(p.seconds) && p.seconds >= 6 && p.seconds <= 15)) out.push('person.seconds 는 6~15');
  if (p.resolution !== undefined && !['720p', '1080p'].includes(p.resolution)) out.push('person.resolution 은 720p·1080p');
  if (p.cuts !== undefined) {
    const ok = (r) => Array.isArray(r) && r.length === 2 && r.every((x) => typeof x === 'number' && x >= 0) && r[1] > r[0];
    if (p.cuts.a !== undefined && !ok(p.cuts.a)) out.push('person.cuts.a 는 [시작, 끝] 초');
    if (p.cuts.b !== undefined && !ok(p.cuts.b)) out.push('person.cuts.b 는 [시작, 끝] 초');
  }
  if (p.image !== undefined) {
    try {
      personImage(it);
    } catch (e) {
      out.push(e.message);
    }
  }
  if (p.other !== undefined) {
    const o = p.other;
    if (!o || typeof o !== 'object') out.push('person.other 는 { caption, prompt, image?, seconds?, cut? }');
    else {
      if (!str(o.caption)) out.push('person.other.caption(상대 장면 자막)이 비었어요');
      else if (o.caption.split('\n').some((l) => [...l].length > 14)) out.push('person.other.caption 한 줄은 14자까지 (\\n 으로 나누기)');
      else if (o.caption.split('\n').length > 3) out.push('person.other.caption 은 3줄까지');
      if (!str(o.prompt) && !str(o.still)) out.push('person.other.prompt(상대 장면 글, 영어)나 still(정지 그림)이 필요해요');
      if (o.still !== undefined) {
        try {
          otherStill(it);
        } catch (e) {
          out.push(e.message);
        }
      }
      if (o.motion !== undefined) {
        if (!str(o.still)) out.push('person.other.motion 은 still(정지 그림)과 같이 써요');
        try {
          otherMotion(it);
        } catch (e) {
          out.push(e.message);
        }
      }
      const minSec = str(o.still) ? 3 : 6; // 정지 그림은 짧게 끊어도 된다 (영상 모델은 6초부터)
      if (o.seconds !== undefined && !(Number.isInteger(o.seconds) && o.seconds >= minSec && o.seconds <= 15)) out.push(`person.other.seconds 는 ${minSec}~15`);
      if (o.resolution !== undefined && !['720p', '1080p'].includes(o.resolution)) out.push('person.other.resolution 은 720p·1080p');
      if (o.cut !== undefined && !(Array.isArray(o.cut) && o.cut.length === 2 && o.cut.every((x) => typeof x === 'number' && x >= 0) && o.cut[1] > o.cut[0])) out.push('person.other.cut 은 [시작, 끝] 초');
      if (o.image !== undefined) {
        try {
          otherImage(it);
        } catch (e) {
          out.push(e.message);
        }
      }
    }
  }
  if (p.stills !== undefined) {
    try {
      personStills(it);
    } catch (e) {
      out.push(e.message);
    }
  }
  if (p.motion !== undefined) {
    if (p.stills === undefined) out.push('person.motion 은 stills(정지 그림 모드)와 같이 써요');
    try {
      personMotion(it);
    } catch (e) {
      out.push(e.message);
    }
  }
  if (p.badge !== undefined && !(str(p.badge) && [...p.badge].length <= 16)) out.push('person.badge 는 16자까지 한 줄');
  // 자막 3줄(줄마다 약 100px)이 인스타 아래 글·버튼 자리(1600px 아래)에 닿지 않게
  if (p.captionTop !== undefined && !(Number.isInteger(p.captionTop) && p.captionTop >= 160 && p.captionTop <= 1300)) out.push('person.captionTop 은 160~1300 (px)');
  // 사람 장면이 AI 라는 걸 캡션에서도 밝힌다
  if (!/AI\s*로\s*만든|AI\s*연출|AI\s*생성/.test(String(it.caption ?? ''))) out.push('caption 에 사람 장면이 AI로 만든 것이라고 써 주세요 (예: 「사람 나오는 장면은 AI로 만든 연출」)');
  return out;
}

export async function makeAiReelItem(it, dir) {
  const made = (s) => ({ ai: '새로 만듦', stills: '정지 그림으로 만듦' })[s] ?? '만들어 둔 것';
  const person = await personClip(it, dir);
  console.log(`  ${it.id}: 사람 장면 ${made(person.source)}`);
  const info = probe(person.file);
  // 정지 그림은 4초씩 딱 잘려 있어 첫 프레임부터 얼굴(훅)이 나오게 — 기본 구간을 그림 경계에 맞춘다
  const cuts = resolveCuts(it.person.cuts ?? (person.source === 'stills' ? STILL_CUTS : undefined), info.seconds);
  const otherV = it.person.other ? await otherClip(it, dir) : null;
  if (otherV) console.log(`  ${it.id}: 상대 장면 ${made(otherV.source)}`);
  const otherSec = otherV ? probe(otherV.file).seconds : 0;
  const otherCut = otherV ? resolveOtherCut(it.person.other.cut ?? (otherV.source === 'stills' ? [0, otherSec - 0.05] : undefined), otherSec) : null;

  const real = await realAnalysis(it, dir);
  console.log(`  ${it.id}: 진짜 AI 결과 ${real.source === 'api' ? '서버에서 받음' : real.source === 'cache' ? '저장해 둔 것' : '창고의 것'}`);
  const rec = await recordApp({ user: demoUser(it), name: it.name, gender: it.gender ?? 'male', relationship: it.relationship ?? 'talking', text: typedText(it), analysis: real.analysis, pick: pickIndex(it, real.analysis) });
  const diff = requestMismatch(real.request ?? coachRequestOf(it), rec.request);
  if (diff.length) throw new Error(`${it.id}: 앱이 만든 질문이 결과를 받을 때와 달라요 — ${diff.join(' / ')}`);
  if (rec.errors.length) console.warn(`  ${it.id}: 앱 오류 ${rec.errors.length}개 — ${rec.errors[0]}`);

  const tmp = (n) => path.join(dir, n);
  const head = tmp('_part-app.mp4');
  const tail = tmp('_part-end.mp4');
  // 사람 장면이 앞뒤로 들어가니 앱 쪽은 조금 짧게
  await makeAppReel(it, real.analysis, rec, null, { split: { head, tail }, total: 17 });
  const ovA = tmp('_ov-a.png');
  const ovB1 = tmp('_ov-b1.png');
  const ovB2 = tmp('_ov-b2.png');
  const top = it.person.captionTop ?? CAPTION_TOP;
  const badge = it.person.badge ?? null;
  writeFileSync(ovA, await png(overlayTree(it.person.hook, top, badge), W, H));
  writeFileSync(ovB1, await png(overlayTree(it.person.sent, top), W, H));
  writeFileSync(ovB2, await png(overlayTree(it.person.reply, top), W, H));
  const ovO = tmp('_ov-o.png');
  if (otherV) writeFileSync(ovO, await png(overlayTree(it.person.other.caption, top, badge), W, H));

  const file = path.join(dir, 'reel.mp4');
  const seconds = composeAiReel({ person: person.file, cuts, head, tail, ovA, ovB1, ovB2, other: otherV ? { file: otherV.file, cut: otherCut, ov: ovO } : null, out: file });
  // 표지: 고민하는 얼굴 + 첫 자막 (사람 얼굴이 격자에서 눈에 띈다)
  const cover = path.join(dir, 'cover.jpg');
  ff(['-ss', Math.min(1.2, cuts.a[1] - cuts.a[0] - 0.1).toFixed(2), '-i', file, '-frames:v', '1', '-q:v', '2', cover]);
  // 소리를 얹을 구간 시각 (sound.mjs 의 at: 'other' · 'reply' 같은 이름)
  const anchors = reelAnchors({ cuts, otherCut, headSeconds: probe(head).seconds });
  for (const f of [head, tail, ovA, ovB1, ovB2, ovO]) rmSync(f, { force: true });
  console.log(`  ${it.id}: ${seconds.toFixed(1)}초 · ${(readFileSync(file).length / 1e6).toFixed(1)}MB (사람 ${cuts.a.join('~')}초${otherCut ? ` + 상대 ${otherCut.map((x) => x.toFixed(1)).join('~')}초` : ''} + 앱 + 사람 ${cuts.b.map((x) => x.toFixed(1)).join('~')}초)`);
  return { media: [file], cover, seconds, anchors };
}

/**
 * 한 편 안에서 구간이 시작되는 시각(초) — composeAiReel 이 잇는 순서 그대로:
 * 사람(앞) → [상대 인물] → 앱 → 사람(뒤: 보냄 → 답 받음) → 끝 카드
 */
export function reelAnchors({ cuts, otherCut = null, headSeconds }) {
  const r = (x) => Math.round(x * 1000) / 1000;
  const a = cuts.a[1] - cuts.a[0];
  const o = otherCut ? otherCut[1] - otherCut[0] : 0;
  const app = a + o;
  const sent = app + headSeconds;
  return {
    start: 0,
    ...(otherCut ? { other: r(a) } : {}),
    app: r(app),
    sent: r(sent),
    reply: r(sent + (cuts.replyAt - cuts.b[0])),
    end: r(sent + (cuts.b[1] - cuts.b[0])),
  };
}
