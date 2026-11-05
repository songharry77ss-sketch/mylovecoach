/**
 * 채널 게시용 그림에 쓰는 3D 이모지(Microsoft Fluent Emoji, MIT)를 scripts/assets/fluent/ 에 받는다.
 *   npx tsx scripts/fetch-fluent-emoji.ts
 * 게시용 그림(scripts/make-channel-assets.ts)이 쓰고, 공유 카드(api/_kkti-card)가 쓰는 것만 api/_assets/fluent/ 에도 복사한다
 * (카드는 함수와 함께 배포된 그림만 읽고 외부로 나가지 않는다). 유형·등급 이모지를 바꾸면 여기 FLUENT_NAMES 에 넣고 다시 돌린다.
 * 출처: https://github.com/microsoft/fluentui-emoji (MIT License)
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CARD_EXTRA_EMOJI } from '../api/_kkti-card';
import { KKTI_AXES, KKTI_CODES, KKTI_MATCH_TIERS, KKTI_TYPES } from '../src/lib/kkti';

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
};

/** 파일 이름: 코드포인트를 - 로 잇고 변형 선택자(FE0F)는 뺀다 (api/_kkti-card 의 fluentName 과 같은 규칙) */
export const fluentName = (emoji: string) => `${[...emoji].map((c) => c.codePointAt(0)!.toString(16)).filter((c) => c !== 'fe0f').join('-')}.png`;
export const fluentFile = (emoji: string) => path.join(__dirname, 'assets', 'fluent', fluentName(emoji));

/** 공유 카드가 쓰는 이모지 — 유형·궁합 등급·축 + 카드 장식 */
export const CARD_EMOJI = [...new Set([...KKTI_CODES.map((code) => KKTI_TYPES[code].emoji), ...KKTI_MATCH_TIERS.map((t) => t.emoji), ...KKTI_AXES.map((a) => a.emoji), ...CARD_EXTRA_EMOJI])];

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
  const cardDir = path.join(__dirname, '..', 'api', '_assets', 'fluent');
  mkdirSync(cardDir, { recursive: true });
  for (const emoji of CARD_EMOJI) {
    if (!FLUENT_NAMES[emoji]) throw new Error(`공유 카드 이모지 ${emoji} 가 FLUENT_NAMES 에 없습니다`);
    copyFileSync(fluentFile(emoji), path.join(cardDir, fluentName(emoji)));
  }
  console.log(`공유 카드용 ${CARD_EMOJI.length}개 → ${cardDir}`);
}

if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
