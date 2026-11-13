// 자동 생산의 계산 부분 (그림 없음 — plan.test.mjs 가 검사한다)
import { kst, kstDay } from '../lib/social.mjs';

const DAY = 86_400_000;
export const nextDay = (day) => kstDay(new Date(kst(`${day} 12:00`).getTime() + DAY));

/** 창고에서 다음 n 개 — 창고 순서를 지키되, 바로 앞과 같은 포맷이면 뒤로 미뤄 포맷이 번갈아 나오게 */
export function pickNext(items, used, n, lastFormat) {
  const left = items.filter((it) => !used.has(it.id));
  const out = [];
  let prev = lastFormat;
  while (out.length < n && left.length) {
    const i = Math.max(0, left.findIndex((it) => it.format !== prev));
    const [it] = left.splice(i, 1);
    out.push(it);
    prev = it.format;
  }
  return out;
}

/**
 * 한 주 구성 — 릴스가 캐러셀보다 조회가 열 배쯤 높아(2026-11 성과 표) 릴스 4 · 캐러셀 3.
 * 카톡 재현 릴스(대비·해석) 2, 「몇 번?」 고르기 릴스 1, 답장 고르기·KKTI 궁합·체크리스트 캐러셀 각 1.
 * 칸마다 그 포맷의 다음 항목, 그 포맷이 바닥나면 아무 포맷이나(바로 앞과 다른 것 먼저).
 */
export const WEEK = ['chat-reel', 'pick-carousel', 'pick-reel', 'kkti-pair', 'chat-reel', 'list-carousel', 'chat-reel'];

export function pickByPattern(items, used, n, pattern = WEEK, lastFormat) {
  const left = items.filter((it) => !used.has(it.id));
  const out = [];
  let prev = lastFormat;
  for (let k = 0; out.length < n && left.length; k++) {
    const want = pattern[k % pattern.length];
    let i = left.findIndex((it) => it.format === want);
    if (i < 0) i = Math.max(0, left.findIndex((it) => it.format !== prev));
    const [it] = left.splice(i, 1);
    out.push(it);
    prev = it.format;
  }
  return out;
}

/** from 부터 to 까지 며칠(둘 다 포함) — to 가 앞이면 0 */
export const daysFromTo = (from, to) => Math.max(0, Math.round((kst(`${to} 12:00`) - kst(`${from} 12:00`)) / DAY) + 1);

/** 큐를 오늘부터 ahead 일 뒤까지 채우려면 몇 개 더 넣어야 하나 (최대 max) — 몇 번을 돌려도 겹치지 않게 */
export function howMany(firstFree, now, ahead, max) {
  const target = kstDay(new Date(now.getTime() + ahead * DAY));
  return Math.min(max, daysFromTo(firstFree, target));
}

/** 새 항목을 넣기 시작할 날 — 큐의 마지막 피드 예정일 다음 날과 내일 중 늦은 쪽 */
export function firstFreeDay(entries, now) {
  const feed = (entries ?? []).filter((e) => e.kind !== 'story');
  const tomorrow = kstDay(new Date(now.getTime() + DAY));
  if (!feed.length) return tomorrow;
  const last = feed.map((e) => kstDay(kst(e.at))).sort().at(-1);
  return [tomorrow, nextDay(last)].sort().at(-1);
}
