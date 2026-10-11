/**
 * KKTI 결과 카드에 쓰는 이모지 그림(Twemoji SVG)을 받아 api/_assets/emoji.json 에 모은다.
 *   npx tsx scripts/make-kkti-emoji.ts
 * 유형·궁합 등급·축의 이모지를 바꿨을 때 다시 돌린다. 카드를 그릴 때는 이 파일만 읽고 외부로 나가지 않는다.
 * 그림 출처: Twemoji (jdecked/twemoji), CC-BY 4.0 — https://github.com/jdecked/twemoji
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { CARD_EXTRA_EMOJI } from '../api/_kkti-card';
import { KKTI_AXES, KKTI_CODES, KKTI_MATCH_TIERS, KKTI_TYPES } from '../src/lib/kkti';

const TWEMOJI_VERSION = '16.0.1';
const base = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets/svg`;

/** Twemoji 파일 이름 규칙 — 코드포인트를 - 로 잇고, 결합 문자(ZWJ)가 없으면 변형 선택자(FE0F)는 뺀다 */
function fileName(emoji: string): string {
  const source = emoji.includes('‍') ? emoji : emoji.replace(/️/g, '');
  return Array.from(source, (ch) => ch.codePointAt(0)!.toString(16)).join('-');
}

async function main() {
  const wanted = [...new Set([...KKTI_CODES.map((code) => KKTI_TYPES[code].emoji), ...KKTI_MATCH_TIERS.map((t) => t.emoji), ...KKTI_AXES.map((a) => a.emoji), ...CARD_EXTRA_EMOJI])];
  const out: Record<string, string> = {};
  for (const emoji of wanted) {
    const res = await fetch(`${base}/${fileName(emoji)}.svg`);
    if (!res.ok) throw new Error(`${emoji} (${fileName(emoji)}) 그림을 받지 못했어요: ${res.status}`);
    out[emoji] = (await res.text()).trim();
  }
  const file = path.join(__dirname, '..', 'api', '_assets', 'emoji.json');
  writeFileSync(file, `${JSON.stringify(out, null, 0)}\n`);
  console.log(`이모지 ${wanted.length}개 → ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
