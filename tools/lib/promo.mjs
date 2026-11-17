/**
 * 홍보 추적 링크(/go/코드) 숫자를 오래 남기기 — 서버(usage_quota)는 7일만 들고 있어서,
 * 매일 /api/go-stats 를 읽어 social-queue 가지 marketing/promo/clicks.json 에 날짜·코드별로 쌓는다.
 * 같은 날짜·코드·기기는 큰 값을 남긴다 (그날 숫자는 하루 동안 늘기만 하므로, 여러 번 읽어도 안전).
 */

const key = (...parts) => parts.join('|');

/** 이전 기록(prev)에 새로 읽은 통계(stats)를 합친다 */
export function mergePromo(prev, stats, now = new Date()) {
  const clicks = new Map((prev?.clicks ?? []).map((r) => [key(r.day, r.code, r.device), { ...r }]));
  for (const r of stats?.clicks ?? []) {
    const k = key(r.day, r.code, r.device);
    const cur = clicks.get(k);
    if (!cur || r.count > cur.count) clicks.set(k, { day: r.day, code: r.code, device: r.device, count: r.count });
  }
  const opens = new Map((prev?.opens ?? []).map((r) => [key(r.day, r.code, r.platform), { ...r }]));
  for (const r of stats?.opens ?? []) {
    const k = key(r.day, r.code, r.platform);
    const cur = opens.get(k);
    if (!cur || r.count > cur.count) opens.set(k, { day: r.day, code: r.code, platform: r.platform, count: r.count });
  }
  const order = (a, b) => (a.day === b.day ? a.code.localeCompare(b.code) : b.day.localeCompare(a.day));
  return { updatedAt: now.toISOString(), clicks: [...clicks.values()].sort(order), opens: [...opens.values()].sort(order) };
}

/** 코드별 합계 — 요약 표·추적판용 */
export function promoTotals(data) {
  const out = new Map();
  const row = (code) => out.get(code) ?? out.set(code, { code, clicks: 0, android: 0, ios: 0, web: 0, opens: 0, first: null, last: null }).get(code);
  for (const r of data?.clicks ?? []) {
    const t = row(r.code);
    t.clicks += r.count;
    if (r.device === 'a') t.android += r.count;
    else if (r.device === 'i') t.ios += r.count;
    else t.web += r.count;
    if (!t.first || r.day < t.first) t.first = r.day;
    if (!t.last || r.day > t.last) t.last = r.day;
  }
  for (const r of data?.opens ?? []) row(r.code).opens += r.count;
  return [...out.values()].sort((a, b) => b.clicks - a.clicks || a.code.localeCompare(b.code));
}
