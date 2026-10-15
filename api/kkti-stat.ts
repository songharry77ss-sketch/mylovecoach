/**
 * POST /api/kkti-stat { event } — KKTI 가 얼마나 퍼지는지 보는 횟수 집계.
 * 누가 했는지는 남기지 않는다: 받는 것은 정해진 이벤트 이름 하나뿐이고(기기 ID·답 코드·IP 를 저장하지 않음),
 * 날짜별 횟수 표(usage_quota, kind = 'kkti:이벤트')의 숫자만 1 올린다. 그래서 웹은 이용 기록 동의와 관계없이 센다
 * (앱은 스토어 개인정보 신고에 맞춰 동의한 사람만 보낸다 — src/lib/kkti-stat.ts).
 * 이 표는 7일이 지나면 지워진다(purge_old_records) — 관리자 화면에서 최근 7일을 본다.
 *
 * 이벤트: start(테스트 시작) · start_friend(친구 링크로 시작) · complete(완료) · complete_friend(친구 링크로 완료)
 *        · share(공유 버튼) · open_shared(친구가 보낸 결과를 엶) · match_view(궁합을 봄)
 * 한 사람이 데려오는 사람 수의 근사 = complete_friend ÷ complete.
 * 남용 막기: IP 당 5분 40회, 이벤트마다 하루 20만 회까지. 실패해도 앱에는 영향이 없다(항상 204).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { bodyTooLarge, clientIp, rateLimited } from './_limits';
import { rpc, supabaseReady } from './_supabase';

export const config = { maxDuration: 10 };

export const KKTI_STAT_EVENTS = ['start', 'start_friend', 'complete', 'complete_friend', 'share', 'open_shared', 'match_view'] as const;
export type KktiStatEvent = (typeof KKTI_STAT_EVENTS)[number];
export const KKTI_STAT_PREFIX = 'kkti:';

const MAX_BODY_BYTES = 256;
const RATE_MAX = 40;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const DAILY_LIMIT = 200_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }
  const expectedToken = process.env.COACH_APP_TOKEN;
  if (expectedToken && req.headers['x-app-token'] !== expectedToken) {
    res.status(401).end();
    return;
  }
  if (bodyTooLarge(req, MAX_BODY_BYTES)) {
    res.status(413).end();
    return;
  }
  const event = (req.body as { event?: unknown } | null)?.event;
  if (typeof event !== 'string' || !(KKTI_STAT_EVENTS as readonly string[]).includes(event)) {
    res.status(400).json({ error: '알 수 없는 이벤트예요.' });
    return;
  }
  if (rateLimited('kkti-stat', clientIp(req), RATE_MAX, RATE_WINDOW_MS)) {
    res.status(429).end();
    return;
  }
  if (supabaseReady()) await rpc('take_quota', { p_kind: KKTI_STAT_PREFIX + event, p_units: 1, p_limit: DAILY_LIMIT });
  res.status(204).end();
}
