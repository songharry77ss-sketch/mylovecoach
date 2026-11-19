/**
 * 일일 리포트 상세 — 누적 매출 · 기기(아이폰/갤럭시/웹) · 들어온 경로 · 나이·성별 · 체류 시간.
 * 계산은 순수 함수로 두고(시험하기 쉽게) 읽기는 collectDetail 이 맡는다. 서버 함수가 읽는 파일이라 @/ 별칭을 쓰지 않는다.
 */
import { formatRevenue, STORE_LABELS, sumRevenue, type StoreName } from './_store';
import { query } from './_supabase';
import { escapeHtml } from './_telegram';

const PAGE = 1000;
const MAX_PAGES = 20;
/** 이보다 긴 세션은 앱을 켜 둔 채 잊은 것으로 보고 체류 시간에서 뺀다 */
const MAX_SESSION_MS = 3 * 60 * 60 * 1000;

export interface DeviceRow {
  device_id: string;
  platform: string | null;
  source: string | null;
  source_detail: { channel?: string; source?: string; medium?: string; campaign?: string; referrer?: string } | null;
  gender: string | null;
  age: number | null;
  user_id: string | null;
}

export interface SessionRow {
  device_id: string;
  platform: string | null;
  duration_ms: number | string | null;
}

export interface SaleLite {
  store: StoreName;
  kind: string;
  amount: number | string | null;
  currency: string | null;
  created_at: string;
}

export interface DetailData {
  /** 실제 결제 전체 (누적 매출) */
  allSales: SaleLite[] | null;
  /** 이번 달(한국) 1일 0시 — 이번 달 매출을 나누는 기준 */
  monthStart: Date;
  /** 어제 처음 접속한 기기 */
  newDevices: DeviceRow[] | null;
  /** 회원과 이어진 기기 (회원 한 명이 기기 여럿이면 하나만) */
  memberDevices: DeviceRow[] | null;
  /** 어제 시작한 세션 */
  sessions: SessionRow[] | null;
}

// ── 이름 붙이기 ─────────────────────────────────────────────────────────

export const PLATFORM_LABELS: Record<string, string> = { ios: '아이폰', android: '갤럭시(안드로이드)', web: '웹', apk: '안드로이드(APK)' };
const platformOf = (row: { platform: string | null; source_detail?: DeviceRow['source_detail'] }) =>
  PLATFORM_LABELS[row.platform ?? ''] ?? PLATFORM_LABELS[row.source_detail?.channel ?? ''] ?? '모름';

/** 들어온 경로 — 광고·홍보 링크·다른 사이트·스토어 자연 유입 */
export function sourceLabel(row: Pick<DeviceRow, 'platform' | 'source' | 'source_detail'>): string {
  const d = row.source_detail ?? {};
  const src = d.source?.trim();
  if (src === 'google-ads') return '구글 광고';
  if (src === 'apple-ads') return '애플 검색 광고';
  if (src?.startsWith('go-')) return `홍보 링크 ${src.slice(3)}`;
  if (src) return `링크 ${src}`;
  if (d.referrer) return `${d.referrer} 에서`;
  const channel = d.channel ?? row.platform ?? row.source ?? '';
  if (channel === 'ios') return '앱스토어 (광고 아님)';
  if (channel === 'android') return 'Play 스토어 (광고 아님)';
  if (channel === 'apk') return 'APK 직접 설치';
  if (channel === 'web') return '웹 직접 방문';
  return '모름';
}

/** 앱은 성별을 건너뛰면 'other' 로 저장한다 (start.tsx·about-me) — 그래서 'other'·빈 값은 「선택 안 함」 */
export function genderLabel(g: string | null | undefined): string {
  return g === 'female' ? '여' : g === 'male' ? '남' : '선택 안 함';
}

export function ageBand(age: number | null | undefined): string {
  if (age == null || !Number.isFinite(age) || age <= 0) return '미입력';
  if (age < 20) return '10대';
  if (age < 25) return '20대 초반';
  if (age < 30) return '20대 후반';
  if (age < 40) return '30대';
  return '40대 이상';
}

const AGE_ORDER = ['10대', '20대 초반', '20대 후반', '30대', '40대 이상', '미입력'];

// ── 세기·그리기 ─────────────────────────────────────────────────────────

/** 이름별 개수 (많은 순, 같으면 order 순) */
export function tally<T>(rows: T[], key: (row: T) => string, order?: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  const rank = (k: string) => (order ? (order.indexOf(k) < 0 ? order.length : order.indexOf(k)) : 0);
  return [...m.entries()].sort((a, b) => (order ? rank(a[0]) - rank(b[0]) : b[1] - a[1] || a[0].localeCompare(b[0])));
}

/** 막대 줄 — 「 · 아이폰 ▇▇▇▇▇ 12대 (52%)」 */
export function barLines(entries: [string, number][], unit: string, max = 6): string[] {
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (!total) return [' · 없음'];
  const top = Math.max(...entries.map(([, n]) => n));
  const shown = entries.slice(0, max);
  const lines = shown.map(([label, n]) => {
    const blocks = Math.max(1, Math.round((n / top) * 8));
    return ` · ${escapeHtml(label)} ${'▇'.repeat(blocks)} ${n}${unit} (${Math.round((n / total) * 100)}%)`;
  });
  const rest = entries.slice(max).reduce((s, [, n]) => s + n, 0);
  if (rest) lines.push(` · 그 밖 ${rest}${unit}`);
  return lines;
}

/** 한 줄 요약 — 「여 12 · 남 8 · 미입력 3」 */
export const inline = (entries: [string, number][], unit = ''): string => (entries.length ? entries.map(([k, n]) => `${escapeHtml(k)} ${n}${unit}`).join(' · ') : '없음');

export function fmtDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '확인 못 함';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 ${s % 60}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

export interface SessionStats {
  sessions: number;
  devices: number;
  avgMs: number | null;
  medianMs: number | null;
  /** 기기 한 대가 하루에 쓴 시간 평균 */
  perDeviceMs: number | null;
  byPlatform: [string, { sessions: number; avgMs: number }][];
}

export function sessionStats(rows: SessionRow[]): SessionStats {
  const valid = rows
    .map((r) => ({ ...r, ms: Number(r.duration_ms) }))
    .filter((r) => Number.isFinite(r.ms) && r.ms > 0 && r.ms <= MAX_SESSION_MS);
  const sorted = valid.map((r) => r.ms).sort((a, b) => a - b);
  const sum = sorted.reduce((s, n) => s + n, 0);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  const perDevice = new Map<string, number>();
  for (const r of valid) perDevice.set(r.device_id, (perDevice.get(r.device_id) ?? 0) + r.ms);
  const plat = new Map<string, { sessions: number; total: number }>();
  for (const r of valid) {
    const k = platformOf(r);
    const p = plat.get(k) ?? { sessions: 0, total: 0 };
    p.sessions += 1;
    p.total += r.ms;
    plat.set(k, p);
  }
  return {
    sessions: valid.length,
    devices: perDevice.size,
    avgMs: valid.length ? sum / valid.length : null,
    medianMs: median,
    perDeviceMs: perDevice.size ? sum / perDevice.size : null,
    byPlatform: [...plat.entries()].sort((a, b) => b[1].sessions - a[1].sessions).map(([k, v]) => [k, { sessions: v.sessions, avgMs: v.total / v.sessions }]),
  };
}

// ── 리포트 문단 ─────────────────────────────────────────────────────────

/** 누적·이번 달 매출 줄 (어제 매출 아래에 붙인다) */
export function revenueTotalLines(d: Pick<DetailData, 'allSales' | 'monthStart'>): string[] {
  if (!d.allSales) return [' · 누적 매출 확인 못 함'];
  const paid = d.allSales.filter((s) => s.kind === 'purchase' || s.kind === 'renewal');
  const month = paid.filter((s) => Date.parse(s.created_at) >= d.monthStart.getTime());
  const total = sumRevenue(paid);
  const byStore = (['apple', 'google'] as StoreName[])
    .map((store) => [store, sumRevenue(paid.filter((s) => s.store === store))] as const)
    .filter(([, r]) => r.count > 0)
    .map(([store, r]) => `${STORE_LABELS[store]} ${formatRevenue(r)} (${r.count}건)`);
  const refunds = d.allSales.filter((s) => s.kind === 'refund').length;
  return [
    ` · 이번 달 ${formatRevenue(sumRevenue(month))} (${month.length}건)`,
    ` · <b>누적 ${formatRevenue(total)}</b> (${total.count}건${refunds ? ` · 환불 ${refunds}건` : ''})`,
    ...(byStore.length ? [`   ${byStore.join(' · ')}`] : []),
    '   ※ 스토어 수수료·부가세 빼기 전 결제 금액',
  ];
}

/** 기기·경로·나이·성별·체류 시간 문단 */
export function detailSections(d: DetailData): string[] {
  const out: string[] = [];
  const news = d.newDevices;
  const members = d.memberDevices;

  out.push('', '📱 <b>아이폰 · 갤럭시</b>');
  if (news) {
    const joined = news.filter((r) => r.user_id).length;
    out.push(` 어제 새 기기 ${news.length}대 → 그중 가입 ${joined}명${news.length ? ` (${Math.round((joined / news.length) * 100)}%)` : ''}`);
    out.push(...barLines(tally(news, platformOf), '대'));
  } else out.push(' · 어제 새 기기 확인 못 함');
  if (members) out.push(` 누적 회원(앱 기록이 있는 ${members.length}명): ${inline(tally(members, platformOf), '명')}`);

  out.push('', '🧭 <b>들어온 경로</b>');
  if (news) {
    out.push(' 어제 새 기기');
    out.push(...barLines(tally(news, sourceLabel), '대'));
  }
  if (members) out.push(` 누적 회원: ${inline(tally(members, sourceLabel).slice(0, 6), '명')}`);

  out.push('', '👤 <b>나이 · 성별</b>');
  if (news) {
    out.push(` 어제 새 기기 — 성별 ${inline(tally(news, (r) => genderLabel(r.gender)), '')}`);
    out.push(` 나이 ${inline(tally(news, (r) => ageBand(r.age), AGE_ORDER), '')}`);
  }
  if (members) {
    out.push(` 누적 회원 — 성별 ${inline(tally(members, (r) => genderLabel(r.gender)), '')}`);
    out.push(` 나이 ${inline(tally(members, (r) => ageBand(r.age), AGE_ORDER), '')}`);
  }

  out.push('', '⏱️ <b>체류 시간</b> (어제 세션)');
  if (d.sessions) {
    const s = sessionStats(d.sessions);
    out.push(` · 세션 ${s.sessions}회 · 기기 ${s.devices}대`);
    out.push(` · 한 번에 평균 ${fmtDuration(s.avgMs)} (중간값 ${fmtDuration(s.medianMs)})`);
    out.push(` · 기기 한 대가 하루에 ${fmtDuration(s.perDeviceMs)}`);
    if (s.byPlatform.length) out.push(` · ${s.byPlatform.map(([k, v]) => `${escapeHtml(k)} 평균 ${fmtDuration(v.avgMs)} (${v.sessions}회)`).join(' · ')}`);
  } else out.push(' · 확인 못 함');
  return out;
}

// ── 읽기 ────────────────────────────────────────────────────────────────

async function readAll<T>(table: string, q: string): Promise<T[] | null> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await query<T>(table, `${q}&limit=${PAGE}&offset=${page * PAGE}`);
    if (!rows) return null;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const DEVICE_COLS = 'select=device_id,platform,source,source_detail,gender,age,user_id';

/** 회원 한 명당 기기 하나 — 마지막에 쓴 기기 */
function onePerMember(rows: (DeviceRow & { last_seen_at?: string })[]): DeviceRow[] {
  const m = new Map<string, DeviceRow & { last_seen_at?: string }>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const prev = m.get(r.user_id);
    if (!prev || (r.last_seen_at ?? '') > (prev.last_seen_at ?? '')) m.set(r.user_id, r);
  }
  return [...m.values()];
}

export async function collectDetail(start: Date, end: Date, monthStart: Date): Promise<DetailData> {
  const between = (col: string) => `${col}=gte.${encodeURIComponent(start.toISOString())}&${col}=lt.${encodeURIComponent(end.toISOString())}`;
  const [allSales, newDevices, memberRows, sessions] = await Promise.all([
    readAll<SaleLite>('store_event', `select=store,kind,amount,currency,created_at&environment=eq.Production&kind=in.(purchase,renewal,refund)&created_at=lt.${encodeURIComponent(end.toISOString())}&order=created_at.asc`),
    readAll<DeviceRow>('app_user', `${DEVICE_COLS}&${between('first_seen_at')}&order=first_seen_at.asc`),
    readAll<DeviceRow & { last_seen_at?: string }>('app_user', `${DEVICE_COLS},last_seen_at&user_id=not.is.null&order=last_seen_at.asc`),
    readAll<SessionRow>('app_session', `select=device_id,platform,duration_ms&${between('started_at')}&order=started_at.asc`),
  ]);
  return { allSales, monthStart, newDevices, memberDevices: memberRows ? onePerMember(memberRows) : null, sessions };
}
