#!/usr/bin/env node
// 자동 생산 결과(made.json) → 미리 보기 글(마크다운). GitHub 이슈로 열려 휴대폰 GitHub 앱에 알림이 간다.
//   node tools/social-make/preview.mjs made.json <social-queue 커밋>
import { readFileSync } from 'node:fs';

import { mediaUrl } from '../lib/social.mjs';

const [file, ref] = process.argv.slice(2);
const made = JSON.parse(readFileSync(file, 'utf8'));
const KIND = { reel: '릴스', carousel: '캐러셀', image: '사진', story: '스토리' };
const lines = [
  `이번 주에 올라갈 인스타 게시물 ${made.added.length}개입니다. 아직 **허락 전**이라 올라가지 않아요.`,
  '',
  '괜찮으면 **Actions → 「인스타·쓰레드 게시 허락」 → Run workflow → `all`** 을 눌러 주세요 (휴대폰 GitHub 앱에서도 됨).',
  '빼고 싶은 게 있으면 이 이슈에 댓글로 id 를 남겨 주세요.',
  '',
];
for (const e of made.added) {
  lines.push(`### ${e.at} · ${KIND[e.kind] ?? e.kind} · \`${e.id}\``);
  const look = e.cover ?? (e.kind === 'reel' ? null : e.media[0]);
  if (look) lines.push(`<img src="${mediaUrl(look, ref)}" width="280">`);
  if (e.kind === 'reel') lines.push(`[영상 보기](${mediaUrl(e.media[0], ref)})`);
  else if (e.media.length > 1) lines.push(e.media.slice(1).map((m, i) => `[${i + 2}장](${mediaUrl(m, ref)})`).join(' · '));
  lines.push('', '<details><summary>글</summary>', '', '```', e.caption, '```', '</details>', '');
}
if (made.left < 7) lines.push(`> ⚠️ 콘텐츠 창고에 새 항목이 ${made.left}개 남았어요. 다음 주 전에 채워 주세요 (\`marketing/content/bank.json\`).`);
console.log(lines.join('\n'));
