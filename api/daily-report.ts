/**
 * 매일 아침 운영자 리포트 — Vercel Cron 이 매일 00:05 UTC(한국 09:05)에 부른다 (vercel.json 「crons」).
 *   GET /api/daily-report  (Authorization: Bearer <CRON_SECRET> — CRON_SECRET 을 설정하면 Vercel 이 붙여 보낸다)
 * 어제(한국 날짜) 하루를 모아 운영자 텔레그램으로 보낸다:
 *   신규 회원(10명까지 닉네임·가입 방법·이메일)과 누적 회원 · 스토어 매출(실제 결제만, 스토어·상품별)·환불·해지 예약
 *   · 이용 기록에 동의한 이용자의 앱 실행 기기 수·코칭 요청 수·결제 화면 열람 기기 수·결제창 진입 기기 수
 * 응답에는 리포트 내용(이메일 등)을 싣지 않는다.
 * 환경변수: CRON_SECRET (없으면 503), SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN·TELEGRAM_CHAT_ID
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import type { PlanKey } from '../src/lib/billing/plans';

import { formatRevenue, planLabel, STORE_LABELS, sumRevenue, type StoreName } from './_store';
import { countRows, query, supabaseReady } from './_supabase';
import { escapeHtml, kstDate, kstMidnight, notifyTelegram, telegramReady } from './_telegram';

export const config = { maxDuration: 30 };

/** 리포트에 이름을 적는 신규 회원 수 */
const MEMBER_LIST_MAX = 10;
/** 기기 수를 셀 때 한 번에 읽는 행 수 (Supabase 기본 최대 1000) · 최대 페이지 */
const PAGE = 1000;
const MAX_PAGES = 20;

const digest = (s: string) => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

const PROVIDER_LABELS: Record<string, string> = { kakao: '카카오', google: 'Google', apple: 'Apple' };

interface MemberRow {
  nickname: string | null;
  provider: string | null;
  email: string | null;
}

interface SaleRow {
  store: StoreName;
  kind: string;
  plan: PlanKey | null;
  product_id: string | null;
  amount: number | string | null;
  currency: string | null;
}

/** 기간 안에 기록이 있는 서로 다른 기기 수 (페이지로 나눠 읽는다). 읽지 못하면 null */
async function distinctDevices(table: string, filter: string): Promise<number | null> {
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await query<{ device_id: string | null }>(table, `select=device_id&${filter}&order=device_id.asc&limit=${PAGE}&offset=${page * PAGE}`);
    if (!rows) return null;
    for (const r of rows) if (r.device_id) seen.add(r.device_id);
    if (rows.length < PAGE) break;
  }
  return seen.size;
}

const num = (n: number | null, unit: string) => (n == null ? '확인 못 함' : `${n}${unit}`);

export interface ReportData {
  day: string;
  newMembers: number | null;
  members: MemberRow[] | null;
  totalMembers: number | null;
  sales: SaleRow[] | null;
  launches: number | null;
  coaching: number | null;
  paywall: number | null;
  checkout: number | null;
}

/** 리포트 문구 (이용자가 보낸 값은 escape) */
export function reportMessage(d: ReportData): string {
  const lines = [`📊 어제 리포트 (${d.day})`, ''];

  lines.push(`👥 신규 회원 ${num(d.newMembers, '명')} · 누적 ${num(d.totalMembers, '명')}`);
  for (const m of d.members ?? []) {
    const provider = m.provider ? (PROVIDER_LABELS[m.provider] ?? escapeHtml(m.provider)) : '모름';
    lines.push(` · ${escapeHtml(m.nickname ?? '(닉네임 없음)')} · ${provider} · ${escapeHtml(m.email ?? '(이메일 없음)')}`);
  }
  if (d.newMembers != null && d.members && d.newMembers > d.members.length) lines.push(` · 외 ${d.newMembers - d.members.length}명`);

  lines.push('');
  if (!d.sales) {
    lines.push('💰 매출 확인 못 함 (store_event 표를 읽지 못함)');
  } else {
    const paid = d.sales.filter((s) => s.kind === 'purchase' || s.kind === 'renewal');
    const revenue = sumRevenue(paid);
    lines.push(`💰 매출 ${formatRevenue(revenue)} (${revenue.count}건)`);
    const groups = new Map<string, { label: string; rows: SaleRow[] }>();
    for (const s of paid) {
      const key = `${s.store}|${s.plan ?? s.product_id ?? ''}`;
      const group = groups.get(key) ?? { label: `${STORE_LABELS[s.store] ?? escapeHtml(s.store)} ${planLabel(s.plan, s.product_id)}`, rows: [] };
      group.rows.push(s);
      groups.set(key, group);
    }
    for (const g of groups.values()) lines.push(` · ${g.label} ${formatRevenue(sumRevenue(g.rows))} (${g.rows.length}건)`);
    const refunds = d.sales.filter((s) => s.kind === 'refund').length;
    const cancels = d.sales.filter((s) => s.kind === 'cancel').length;
    lines.push(` · ↩️ 환불 ${refunds}건 · ⚠️ 해지 예약 ${cancels}건`);
  }

  lines.push('');
  lines.push('📱 이용 (이용 기록 동의자만)');
  lines.push(` · 앱 실행 기기 ${num(d.launches, '대')}`);
  lines.push(` · 코칭 요청 ${num(d.coaching, '건')}`);
  lines.push(` · 결제 화면 열람 ${num(d.paywall, '대')} → 결제창 진입 ${num(d.checkout, '대')}`);
  return lines.join('\n');
}

/** 어제(한국 날짜) 하루치 데이터를 모은다 */
export async function collectReport(now = Date.now()): Promise<ReportData> {
  const start = kstMidnight(now, -1);
  const end = kstMidnight(now, 0);
  const between = (col: string) => `${col}=gte.${encodeURIComponent(start.toISOString())}&${col}=lt.${encodeURIComponent(end.toISOString())}`;
  const joined = 'provider=not.is.null';
  const [newMembers, members, totalMembers, sales, launches, coaching, paywall, checkout] = await Promise.all([
    countRows('member', `${joined}&${between('created_at')}`),
    query<MemberRow>('member', `select=nickname,provider,email&${joined}&${between('created_at')}&order=created_at.asc&limit=${MEMBER_LIST_MAX}`),
    countRows('member', joined),
    query<SaleRow>('store_event', `select=store,kind,plan,product_id,amount,currency&environment=eq.Production&kind=in.(purchase,renewal,refund,cancel)&${between('created_at')}&limit=1000`), // Supabase 한 번에 최대 1000행 — 하루 결제가 그보다 많아지면 집계 함수로 바꿀 것
    distinctDevices('app_session', between('started_at')),
    countRows('coach_log', between('created_at')),
    distinctDevices('app_event', `name=eq.paywall_open&${between('created_at')}`),
    distinctDevices('app_event', `name=eq.purchase_start&${between('created_at')}`),
  ]);
  return { day: kstDate(start), newMembers, members, totalMembers, sales, launches, coaching, paywall, checkout };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'GET·POST만 지원합니다.' });
    return;
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET 환경변수가 설정되지 않았어요.' });
    return;
  }
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ') || !sameSecret(header.slice(7), secret)) {
    res.status(401).json({ error: '인증에 실패했어요.' });
    return;
  }
  if (!supabaseReady()) {
    res.status(503).json({ error: 'Supabase 가 연결되지 않았어요.' });
    return;
  }
  if (!telegramReady()) {
    res.status(200).json({ sent: false, reason: 'telegram' });
    return;
  }
  const sent = await notifyTelegram(reportMessage(await collectReport()));
  res.status(sent ? 200 : 502).json({ sent });
}
