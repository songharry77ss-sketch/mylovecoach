// 장면 목록 → MP4 (1080×1920 · 30fps · H.264 · AAC). 장면마다 길이를 주면 같은 그림은 한 번만 그린다.
// 소리: 말풍선이 뜰 때 짧은 「톡」(합성음). 인스타 음원을 붙이면(videoVolume 1) 거의 안 들린다.
import { spawn } from 'node:child_process';

import { ffmpegPath, pixels } from './kit.mjs';

export const FPS = 30;

/**
 * frames: [{ tree, dur (초), pop? (이 장면이 시작될 때 톡 소리) }]
 */
export async function saveMp4(frames, width, height, file) {
  const total = frames.reduce((a, f) => a + Math.max(1, Math.round(f.dur * FPS)), 0);
  const pops = [];
  let at = 0;
  for (const f of frames) {
    if (f.pop) pops.push(at / FPS);
    at += Math.max(1, Math.round(f.dur * FPS));
  }
  const seconds = total / FPS;
  const audio = pops.length
    ? [
        '-f', 'lavfi', '-i', `aevalsrc='0.35*sin(2*PI*(1250-500*t)*t)*exp(-38*t)':s=44100:d=0.16`,
        '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono:d=${seconds.toFixed(3)}`,
      ]
    : ['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono:d=${seconds.toFixed(3)}`];
  const filter = pops.length
    ? `[1:a]asplit=${pops.length}${pops.map((_, i) => `[p${i}]`).join('')};${pops.map((t, i) => `[p${i}]adelay=${Math.round(t * 1000)}[d${i}]`).join(';')};[2:a]${pops.map((_, i) => `[d${i}]`).join('')}amix=inputs=${pops.length + 1}:normalize=0,atrim=0:${seconds.toFixed(3)}[a]`
    : null;
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(FPS), '-i', '-',
    ...audio,
    ...(filter ? ['-filter_complex', filter, '-map', '0:v', '-map', '[a]'] : ['-map', '0:v', '-map', '1:a']),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-shortest', '-movflags', '+faststart', file,
  ];
  const ff = spawn(ffmpegPath(), args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 실패 (${code})`))));
  });
  const write = (buf) => new Promise((resolve) => (ff.stdin.write(buf) ? resolve() : ff.stdin.once('drain', resolve)));
  for (const f of frames) {
    const raw = await pixels(f.tree, width, height);
    for (let i = 0; i < Math.max(1, Math.round(f.dur * FPS)); i++) await write(raw);
  }
  ff.stdin.end();
  await done;
  return seconds;
}
