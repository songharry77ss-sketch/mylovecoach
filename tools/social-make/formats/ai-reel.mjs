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
//   cuts?: { a: [시작, 끝], b: [시작, 끝], replyAt } (영상 속 초 — 기본 a 0.2~3.8 · b 4.2~끝 · replyAt 8.2) }
// 사람 영상은 <폴더>/person.mp4 로 남겨 두고 다시 만들지 않는다 (만들려면 SOCIAL_AI_VIDEO=on — 돈이 듦)
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
export const overlayTree = (value) => box({ width: W, height: H, fontFamily: 'Pretendard' }, aiTag(), captionLines(value, 300));

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

const V = (label) => `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1${label ? `[${label}]` : ''}`;
const A = 'aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';

/**
 * 사람(앞) + 앱(훅·녹화) + 사람(뒤) + 끝(보내면?·끝 카드) → 한 편.
 * 인스타 게시 큐 가지가 커지지 않게 4~5MB 안팎으로 (영상은 파일째 올라간다)
 */
export function composeAiReel({ person, cuts, head, tail, ovA, ovB1, ovB2, out }) {
  const info = probe(person);
  const [a0, a1] = cuts.a;
  const [b0, b1] = cuts.b;
  const sw = (cuts.replyAt - b0).toFixed(3);
  const inputs = ['-i', person, '-i', person, '-i', ovA, '-i', ovB1, '-i', ovB2, '-i', head, '-i', tail];
  if (!info.audio) inputs.push('-f', 'lavfi', '-t', '30', '-i', 'anullsrc=r=44100:cl=stereo');
  const pa = info.audio ? '0:a' : '7:a';
  const pb = info.audio ? '1:a' : '7:a';
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
    '[va][aa][vh][ah][vb][ab][vt][at]concat=n=4:v=1:a=1[v][a]',
  ].join(';');
  ff([...inputs, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-maxrate', '2200k', '-bufsize', '4400k', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', out]);
  return probe(out).seconds;
}

// ───────────── 사람 장면 ─────────────

async function personClip(it, dir) {
  const file = path.join(dir, 'person.mp4');
  const metaFile = path.join(dir, 'person.json');
  const prompt = personPrompt(it);
  const seconds = it.person.seconds ?? 12;
  const resolution = it.person.resolution ?? '1080p';
  if (existsSync(file)) {
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null;
    // 글을 고쳤어도 만들기가 꺼져 있으면(돈 안 씀) 있던 영상을 그대로 쓴다
    if (!meta || meta.prompt === prompt || process.env.SOCIAL_AI_VIDEO !== 'on') return { file, source: 'cache' };
  }
  const buf = await omniVideo({ prompt, seconds, resolution, log: (m) => console.log(m) });
  writeFileSync(file, buf);
  writeFileSync(metaFile, `${JSON.stringify({ at: new Date().toISOString(), model: OMNI_MODEL, seconds, resolution, note: 'AI로 만든 사람 장면 — 영상에 「AI로 만든 장면」 표시', prompt }, null, 2)}\n`);
  return { file, source: 'ai' };
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
  // 사람 장면이 AI 라는 걸 캡션에서도 밝힌다
  if (!/AI\s*로\s*만든|AI\s*연출|AI\s*생성/.test(String(it.caption ?? ''))) out.push('caption 에 사람 장면이 AI로 만든 것이라고 써 주세요 (예: 「사람 나오는 장면은 AI로 만든 연출」)');
  return out;
}

export async function makeAiReelItem(it, dir) {
  const person = await personClip(it, dir);
  console.log(`  ${it.id}: 사람 장면 ${person.source === 'ai' ? '새로 만듦' : '만들어 둔 것'}`);
  const info = probe(person.file);
  const cuts = resolveCuts(it.person.cuts, info.seconds);

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
  writeFileSync(ovA, await png(overlayTree(it.person.hook), W, H));
  writeFileSync(ovB1, await png(overlayTree(it.person.sent), W, H));
  writeFileSync(ovB2, await png(overlayTree(it.person.reply), W, H));

  const file = path.join(dir, 'reel.mp4');
  const seconds = composeAiReel({ person: person.file, cuts, head, tail, ovA, ovB1, ovB2, out: file });
  // 표지: 고민하는 얼굴 + 첫 자막 (사람 얼굴이 격자에서 눈에 띈다)
  const cover = path.join(dir, 'cover.jpg');
  ff(['-ss', Math.min(1.2, cuts.a[1] - cuts.a[0] - 0.1).toFixed(2), '-i', file, '-frames:v', '1', '-q:v', '2', cover]);
  for (const f of [head, tail, ovA, ovB1, ovB2]) rmSync(f, { force: true });
  console.log(`  ${it.id}: ${seconds.toFixed(1)}초 · ${(readFileSync(file).length / 1e6).toFixed(1)}MB (사람 ${cuts.a.join('~')}초 + 앱 + 사람 ${cuts.b.map((x) => x.toFixed(1)).join('~')}초)`);
  return { media: [file], cover, seconds };
}
