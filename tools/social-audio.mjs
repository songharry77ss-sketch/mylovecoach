// 실행: node tools/social-audio.mjs [검색어]
// 릴스에 붙일 수 있는 인스타 음원 목록을 표로 낸다 (검색어가 없으면 지금 인기 음원). 바꾸는 것은 없다(읽기만).
// 「인스타 음원 찾기」 실행(social-audio.yml)이 부른다. 표의 audio_id 를 queue.json 항목의 "audio": { "id": "…" } 에 넣으면 그 곡으로 고정된다.
// 토큰: IG_ACCESS_TOKEN — 페이스북 로그인 토큰만 된다 (Audio API). 다른 앱에서 쓰도록 허가된 곡만 나와서 인스타 앱 목록과 다를 수 있다.
import { appendFileSync, readFileSync } from 'node:fs';

import { igAudioSearch, igMe } from './lib/meta-publish.mjs';
import { assertAccount, recentAudioIds } from './lib/social.mjs';

const query = process.argv.slice(2).join(' ').trim();
const summary = process.env.GITHUB_STEP_SUMMARY;
const out = (line = '') => {
  console.log(line);
  if (summary) appendFileSync(summary, `${line}\n`);
};
const token = process.env.IG_ACCESS_TOKEN;
if (!token) throw new Error('IG_ACCESS_TOKEN 이 없어요');

const me = await igMe(token);
assertAccount('instagram', me.username, process.env.SOCIAL_EXPECT_IG);
const list = await igAudioSearch({ userId: me.id, token, query: query || undefined });
const sec = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}` : '–');
const cell = (s) => String(s ?? '').replace(/\|/g, '/').slice(0, 40);

out(`## 인스타 음원 — ${query ? `「${cell(query)}」 검색` : '지금 인기 음원'} (@${me.username})`);
if (!list.length) {
  out('쓸 수 있는 곡이 없어요. 다른 검색어로 찾아 보세요 (다른 앱용으로 허가된 곡만 나와요).');
  process.exit(0);
}
let used = new Set();
try {
  used = recentAudioIds(JSON.parse(readFileSync(process.env.POSTED_JSON ?? 'queue/marketing/social/posted.json', 'utf8')), 20);
} catch {
  // 게시 기록이 없으면 넘어간다
}
out('| # | 제목 | 가수 | 길이 | audio_id | 미리 듣기 |');
out('|---|---|---|---|---|---|');
list.slice(0, 30).forEach((a, i) => {
  const mark = used.has(a.id) ? ' (최근 씀)' : '';
  out(`| ${i + 1} | ${cell(a.title)}${mark} | ${cell(a.artist)} | ${sec(a.durationMs)} | \`${a.id}\` | ${a.preview ? `[듣기](${a.preview})` : '–'} |`);
});
out();
out('곡을 고정하려면 queue.json 항목에 `"audio": { "id": "<audio_id>", "videoVolume": 1 }` 을 넣으세요.');
