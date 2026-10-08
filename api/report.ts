/**
 * POST /api/report — 앱 안에서 불쾌하거나 부적절한 AI 답변을 운영자에게 신고합니다 (구글 플레이 생성형 AI 정책: 앱을 떠나지 않고 신고).
 *
 * 저장하는 것: 신고한 답변 내용·사유·메모·기능 종류·답변이 나온 곳·기기 종류·앱 버전 (supabase/ai_report.sql 의 ai_report, 1년 뒤 자동 파기).
 * 저장하지 않는 것: 기기 ID·IP — 누가 보냈는지 남기지 않는다. IP 는 아래 빈도 제한을 위해 서버 메모리에서만 센다.
 * 이용 기록 수집 동의(ANALYTICS_ENABLED)와 관계없이, 이용자가 「신고하기」를 누른 것은 저장하고 201.
 * Supabase 가 연결되지 않았거나 ai_report 표가 아직 없으면 503 입니다.
 *
 * 남용 막기: 앱 토큰은 공개 번들에 들어 있어 사실상 누구나 부를 수 있으므로 본문 16KB · IP 당 10분 10회로 제한합니다.
 * IP 제한은 인스턴스마다 따로 세므로, 하루 저장 상한은 DB 가 맡는다 — ai_report_quota 트리거가 한국 날짜로 하루 300건,
 * 또는 DB 전체가 400MB 를 넘으면 저장을 거절한다(429·503). 표·트리거는 supabase/ai_report.sql (schema.sql 에도 같은 내용).
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COACH_APP_TOKEN(선택, 앱 토큰 검사)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { AiReportSchema } from '../src/lib/ai-report-schema';
import { bodyTooLarge, clientIp, rateLimited } from './_limits';
import { insertResult, supabaseReady } from './_supabase';

export const config = { maxDuration: 10 };

const MAX_BODY_BYTES = 16 * 1024;
const RATE_MAX = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function parseBody(req: VercelRequest): unknown {
  if (typeof req.body !== 'string') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return null;
  }
}

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
    res.status(413).json({ error: '신고 내용이 너무 길어요.' });
    return;
  }
  if (rateLimited('report', clientIp(req), RATE_MAX, RATE_WINDOW_MS)) {
    res.status(429).json({ error: '신고가 너무 잦아요. 잠시 후 다시 보내 주세요.' });
    return;
  }

  const parsed = AiReportSchema.safeParse(parseBody(req));
  if (!parsed.success) {
    res.status(400).json({ error: '신고 형식이 올바르지 않아요.' });
    return;
  }
  if (!supabaseReady()) {
    res.status(503).json({ error: '지금은 신고를 받을 수 없어요. 잠시 후 다시 시도해주세요.' });
    return;
  }

  const r = parsed.data;
  const saved = await insertResult('ai_report', {
    mode: r.mode,
    reason: r.reason,
    note: r.note?.trim() || null,
    content: r.content?.trim() || null,
    model: r.model?.trim() || null,
    platform: r.platform?.trim() || null,
    app_version: r.appVersion?.trim() || null,
  });
  if (saved.ok) {
    res.status(201).json({ ok: true });
    return;
  }
  if (saved.status === 429) {
    // 하루 저장 상한(DB 트리거 ai_report_quota)에 걸림 — 앱은 시트를 닫지 않고 이 안내를 보여 준다
    res.status(429).json({ error: '오늘은 신고가 너무 많이 들어와 더 받지 못하고 있어요. 내일 다시 보내 주세요.' });
    return;
  }
  if (saved.status === 404 || saved.status === 503) {
    // 404 = 운영 DB 에 ai_report 표가 아직 없음 (supabase/ai_report.sql 을 실행하기 전), 503 = DB 용량 보호(400MB)
    if (saved.status === 404) console.error('[report] ai_report 표가 없습니다 — Supabase SQL Editor 에 supabase/ai_report.sql 을 실행하세요');
    res.status(503).json({ error: '지금은 신고를 받을 수 없어요. 잠시 후 다시 시도해주세요.' });
    return;
  }
  res.status(502).json({ error: '신고를 저장하지 못했어요. 잠시 후 다시 시도해주세요.' });
}
