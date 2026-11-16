#!/usr/bin/env node
// 자동 생산 결과(made.json) → 미리 보기 글(마크다운). GitHub 이슈로 열려 휴대폰 GitHub 앱에 알림이 간다.
//   node tools/social-make/preview.mjs made.json <social-queue 커밋>
import { readFileSync } from 'node:fs';

import { FORMAT_NAMES } from '../lib/learn.mjs';
import { mediaUrl } from '../lib/social.mjs';

const [file, ref] = process.argv.slice(2);
const made = JSON.parse(readFileSync(file, 'utf8'));
const KIND = { reel: '릴스', carousel: '캐러셀', image: '사진', story: '스토리' };
const auto = made.added.length > 0 && made.added.every((e) => e.approved === true);
const lines = auto
  ? [
      `이번 주에 올라갈 인스타 게시물 ${made.added.length}개입니다. **자동 허락이 켜져 있어** 날마다 하나씩 그대로 올라가요.`,
      '',
      '빼고 싶은 게 있으면 이 이슈에 `빼기 <id>` 라고 댓글을 달아 주세요 (여러 개는 쉼표로). 자동 허락을 끄려면 저장소 변수 `SOCIAL_AUTO_APPROVE` 를 지우면 돼요.',
      '',
    ]
  : [
      `이번 주에 올라갈 인스타 게시물 ${made.added.length}개입니다. 아직 **허락 전**이라 올라가지 않아요.`,
      '',
      '괜찮으면 이 이슈에 **`허락`** 이라고 댓글만 달아 주세요 (휴대폰 GitHub 앱에서도 돼요). 날짜가 지난 것은 오늘부터 하루 하나씩으로 다시 잡혀요.',
      '- 몇 개만: `허락 id1,id2` · 빼기: `빼기 id1,id2`',
      '',
    ];
if (made.report) lines.push('<details><summary>지난 성과로 배운 것 · 이번 주 구성</summary>', '', made.report, '', '</details>', '');
for (const e of made.added) {
  lines.push(`### ${e.at} · ${FORMAT_NAMES[e.format] ?? KIND[e.kind] ?? e.kind} · \`${e.id}\``);
  const look = e.cover ?? (e.kind === 'reel' ? null : e.media[0]);
  if (look) lines.push(`<img src="${mediaUrl(look, ref)}" width="280">`);
  if (e.kind === 'reel') lines.push(`[영상 보기](${mediaUrl(e.media[0], ref)})`);
  else if (e.media.length > 1) lines.push(e.media.slice(1).map((m, i) => `[${i + 2}장](${mediaUrl(m, ref)})`).join(' · '));
  lines.push('', '<details><summary>글</summary>', '', '```', e.caption, '```', '</details>', '');
}
if (made.left < 7) lines.push(`> ⚠️ 콘텐츠 창고에 새 항목이 ${made.left}개 남았어요. 다음 주 전에 채워 주세요 (\`marketing/content/bank.json\`).`);
console.log(lines.join('\n'));
