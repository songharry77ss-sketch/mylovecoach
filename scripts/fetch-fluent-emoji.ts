/**
 * 채널 게시용 그림에 쓰는 3D 이모지(Microsoft Fluent Emoji, MIT)를 scripts/assets/fluent/ 에 받는다.
 *   npx tsx scripts/fetch-fluent-emoji.ts
 * 앱 화면·공유 카드(api/_kkti-card)는 Twemoji 를 그대로 쓰고, 이것은 scripts/make-channel-assets.ts 만 쓴다.
 * 출처: https://github.com/microsoft/fluentui-emoji (MIT License)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** 이모지 → Fluent 폴더 이름 (CLDR 짧은 이름). 피부색이 있는 이모지는 Default 를 쓴다 */
export const FLUENT_NAMES: Record<string, string> = {
  '🚜': 'Tractor',
  '🦊': 'Fox',
  '📅': 'Calendar',
  '😼': 'Cat with wry smile',
  '🌊': 'Water wave',
  '🧚': 'Person fairy',
  '🗿': 'Moai',
  '🎣': 'Fishing pole',
  '🐶': 'Dog face',
  '🐹': 'Hamster',
  '⏱️': 'Stopwatch',
  '🐈': 'Cat',
  '📝': 'Memo',
  '🌙': 'Crescent moon',
  '🧊': 'Ice',
  '🔮': 'Crystal ball',
  '💍': 'Ring',
  '💘': 'Heart with arrow',
  '💛': 'Yellow heart',
  '🌗': 'Last quarter moon',
  '🔥': 'Fire',
  '📲': 'Mobile phone with arrow',
  '⚡': 'High voltage',
  '🎉': 'Party popper',
  '🚀': 'Rocket',
  '💬': 'Speech balloon',
  '💞': 'Revolving hearts',
  '🎨': 'Artist palette',
  '🧬': 'Dna',
  '🔢': 'Input numbers',
  '👀': 'Eyes',
  '✨': 'Sparkles',
  '🔒': 'Locked',
  '💌': 'Love letter',
  '🫶': 'Heart hands',
  '👉': 'Backhand index pointing right',
  '😳': 'Flushed face',
  '🥹': 'Face holding back tears',
  // 영상 04(읽씹 역전극)·05(AI 플러팅 연습)
  '😏': 'Smirking face',
  '🍒': 'Cherries',
  '🌡️': 'Thermometer',
  '💭': 'Thought balloon',
  '🫠': 'Melting face',
  '⭐': 'Star',
};

export const fluentFile = (emoji: string) => path.join(__dirname, 'assets', 'fluent', `${[...emoji].map((c) => c.codePointAt(0)!.toString(16)).filter((c) => c !== 'fe0f').join('-')}.png`);

async function list(dir: string): Promise<{ name: string; download_url: string }[]> {
  const res = await fetch(`https://api.github.com/repos/microsoft/fluentui-emoji/contents/assets/${encodeURIComponent(dir).replace(/%2F/g, '/')}`, {
    headers: { 'user-agent': 'mylovecoach-assets', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
  });
  if (!res.ok) throw new Error(`${dir}: ${res.status}`);
  return (await res.json()) as { name: string; download_url: string }[];
}

async function main() {
  mkdirSync(path.join(__dirname, 'assets', 'fluent'), { recursive: true });
  for (const [emoji, name] of Object.entries(FLUENT_NAMES)) {
    const out = fluentFile(emoji);
    if (existsSync(out)) continue;
    let files = await list(`${name}/3D`).catch(() => null);
    if (!files) files = await list(`${name}/Default/3D`);
    const png = files.find((f) => f.name.endsWith('.png'));
    if (!png) throw new Error(`${emoji} ${name}: 3D 그림 없음`);
    const res = await fetch(png.download_url);
    if (!res.ok) throw new Error(`${emoji} ${name}: ${res.status}`);
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    console.log('받음', emoji, name);
  }
  console.log(`3D 이모지 ${Object.keys(FLUENT_NAMES).length}개 준비됨`);
}

if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
