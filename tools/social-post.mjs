// 실행: node tools/social-post.mjs --queue <queue.json> --ref <커밋> (--due | --id <항목>) [--dry-run]
//   --due     : 허락받고 시간이 된 항목을 모두 올린다 (예약 실행이 매일 21:00 KST 에 부른다)
//   --id X    : 그 항목 하나만 (시간·허락 여부와 상관없이 — 손으로 돌릴 때만)
//   --dry-run : 올리지 않고, 검사·그림 주소 확인·계정 확인까지만
//   --check   : 큐 검사만 (토큰 없이)
// 토큰: 환경변수 IG_ACCESS_TOKEN · THREADS_ACCESS_TOKEN (없는 채널은 건너뜀). 계정 이름은 SOCIAL_EXPECT_IG · SOCIAL_EXPECT_THREADS 와 같아야 한다.
// 올린 기록은 --posted <posted.json> 에 남긴다 (예약 실행이 social-queue 가지에 다시 넣는다). 자세한 흐름: docs/SOCIAL_AUTOPOST.md
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';

import { igApi, igAudioById, igAudioSearch, igMe, igPost, igRecent, thMe, thPost, thRecent } from './lib/meta-publish.mjs';
import { assertAccount, dueEntries, mediaUrl, normalizeText, pickAudio, queueProblems, recentAudioIds } from './lib/social.mjs';

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const argOf = (n) => (has(n) ? args[args.indexOf(n) + 1] : undefined);

const queuePath = argOf('--queue') ?? 'marketing/social/queue.json';
const postedPath = argOf('--posted') ?? queuePath.replace(/queue\.json$/, 'posted.json');
const ref = argOf('--ref');
const only = argOf('--id');
const dry = has('--dry-run');
const summary = process.env.GITHUB_STEP_SUMMARY;
const note = (line) => {
  console.log(line);
  if (summary) appendFileSync(summary, `${line}\n`);
};

const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
const issues = queueProblems(queue);
if (issues.length) {
  for (const i of issues) console.error(`✗ ${i}`);
  throw new Error(`큐에 문제가 ${issues.length}개 있어요`);
}
if (has('--check')) {
  note(`큐 검사 통과 — 항목 ${queue.entries.length}개 (허락 ${queue.entries.filter((e) => e.approved === true).length}개)`);
  process.exit(0);
}
if (!ref) throw new Error('--ref <커밋 해시> 가 필요해요 (그림 주소를 그 커밋에 고정)');

const posted = existsSync(postedPath) ? JSON.parse(readFileSync(postedPath, 'utf8')) : { posts: [] };

let targets;
if (only) {
  if (!/^[a-z0-9-]+$/.test(only)) throw new Error('id 형식이 잘못됐어요');
  targets = queue.entries.filter((e) => e.id === only);
  if (!targets.length) throw new Error(`큐에 ${only} 가 없어요`);
} else if (has('--due')) {
  targets = dueEntries(queue, new Date(), posted);
} else {
  throw new Error('--due 또는 --id <항목> 중 하나를 주세요');
}
if (!targets.length) {
  note('지금 올릴 항목이 없어요 (허락·시간·이미 올림 확인).');
  process.exit(0);
}

const accounts = {};
async function account(channel) {
  if (accounts[channel]) return accounts[channel];
  const token = channel === 'instagram' ? process.env.IG_ACCESS_TOKEN : process.env.THREADS_ACCESS_TOKEN;
  if (!token) return (accounts[channel] = null);
  const me = channel === 'instagram' ? await igMe(token) : await thMe(token);
  assertAccount(channel, me.username, channel === 'instagram' ? process.env.SOCIAL_EXPECT_IG : process.env.SOCIAL_EXPECT_THREADS);
  return (accounts[channel] = { ...me, token });
}

/** 그림·영상 주소가 실제로 열리는지 (인스타가 가져가기 전에 먼저 확인) */
async function checkMedia(urls) {
  for (const url of urls) {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^(image\/jpeg|image\/png|video\/mp4)/.test(type)) throw new Error(`그림 주소가 안 열려요: ${url} (${res.status} ${type})`);
  }
}

/**
 * 릴스 음원 고르기 (queue 항목의 audio). id → search 차례로 → trending. 못 찾으면 required 일 때만 실패,
 * 아니면 null(음원 없이 영상 소리 그대로). 인기 음원은 최근에 쓴 곡을 건너뛴다.
 */
async function resolveAudio(entry, acc) {
  const spec = entry.audio;
  const label = (a) => `${a.title || '(제목 없음)'}${a.artist ? ` — ${a.artist}` : ''}`;
  const miss = (why) => {
    if (spec.required) throw new Error(`음원을 못 붙여요: ${why}`);
    note(`- ${entry.id}: 음원 없이 올림 — ${why}`);
    return null;
  };
  if (igApi(acc.token) !== 'facebook') return miss('인스타 로그인 토큰이라 음원 API 를 못 씀 (페이스북 로그인 토큰 필요)');
  const volumes = { audioVolume: spec.audioVolume, videoVolume: spec.videoVolume };
  if (spec.id) {
    const a = await igAudioById({ userId: acc.id, token: acc.token, id: spec.id }).catch(() => null);
    if (a?.id) return { ...a, ...volumes, label: label(a) };
    note(`- ${entry.id}: 음원 ${spec.id} 를 못 찾아 다음 후보로`);
  }
  for (const query of [].concat(spec.search ?? [])) {
    const a = pickAudio(await igAudioSearch({ userId: acc.id, token: acc.token, query }), { query, minSeconds: spec.minSeconds });
    if (a) return { ...a, ...volumes, label: label(a) };
    note(`- ${entry.id}: 「${query}」 는 쓸 수 있는 곡이 없어 다음 후보로`);
  }
  if (spec.trending) {
    const a = pickAudio(await igAudioSearch({ userId: acc.id, token: acc.token }), { avoid: recentAudioIds(posted), minSeconds: spec.minSeconds });
    if (a) return { ...a, ...volumes, label: `${label(a)} (인기 음원)` };
  }
  return miss('조건에 맞는 곡이 없음');
}

let failed = 0;
for (const entry of targets) {
  const urls = (entry.media ?? []).map((m) => mediaUrl(m, ref));
  try {
    await checkMedia(urls);
    const acc = await account(entry.channel);
    if (!acc) {
      note(`- ${entry.id}: ${entry.channel} 토큰이 없어 건너뜀`);
      continue;
    }
    // 이미 같은 글이 올라가 있으면 다시 올리지 않는다 (기록이 빠졌을 때의 안전장치)
    const recent = entry.channel === 'instagram' ? await igRecent(acc.id, acc.token) : await thRecent(acc.id, acc.token);
    // 스토리는 글이 없고 게시물 목록(/media)에도 안 나오므로 이 검사를 건너뛴다 (posted.json 의 id 로만 거른다)
    const same = entry.kind === 'story' || !normalizeText(entry.caption) ? null : recent.find((r) => normalizeText(r.text) === normalizeText(entry.caption));
    if (same) {
      note(`- ${entry.id}: 이미 올라가 있어요 → ${same.url}`);
      posted.posts.push({ id: entry.id, channel: entry.channel, url: same.url, at: same.at, found: true });
      continue;
    }
    const audio = entry.channel === 'instagram' && entry.kind === 'reel' && entry.audio ? await resolveAudio(entry, acc) : null;
    const withAudio = audio ? ` · 음원 「${audio.label}」` : '';
    if (dry) {
      note(`- ${entry.id}: (연습) ${entry.channel} ${entry.kind} ${urls.length}개 · @${acc.username} 에 올릴 준비 완료${withAudio}`);
      continue;
    }
    const cover = entry.kind === 'reel' && entry.cover ? mediaUrl(entry.cover, ref) : undefined;
    const post = entry.channel === 'instagram' ? await igPost({ userId: acc.id, token: acc.token, kind: entry.kind, media: urls, caption: entry.caption, audio, cover }) : await thPost({ userId: acc.id, token: acc.token, kind: entry.kind, media: urls, caption: entry.caption });
    posted.posts.push({ id: entry.id, channel: entry.channel, url: post.url, mediaId: post.id, at: new Date().toISOString(), ...(audio ? { audio: { id: audio.id, title: audio.title, artist: audio.artist } } : {}) });
    note(`- ${entry.id}: 올림 → ${post.url}${withAudio}`);
  } catch (e) {
    failed++;
    note(`- ${entry.id}: 실패 — ${e.message}`);
  }
}

if (!dry) writeFileSync(postedPath, `${JSON.stringify(posted, null, 2)}\n`);
if (failed) process.exit(1);
