-- ════════════════════════════════════════════════════════════════════
--  스토어 결제 알림 기록 store_event (2026-10-21)
--
--  이미 schema.sql 을 실행한 운영 DB 에는 이 파일만 SQL Editor 에서 한 번 실행하면 됩니다. 여러 번 실행해도 안전합니다.
--  (schema.sql 끝에도 같은 내용이 있어 새로 만드는 DB 는 schema.sql 하나로 충분)
--
--  App Store 서버 알림(api/store-apple.ts)과 Google Play 실시간 알림(api/store-google.ts)이
--  결제·갱신·환불·해지 예약·만료·결제 실패를 한 줄씩 남기고, 매일 아침 리포트(api/daily-report.ts)가 매출을 더한다.
--  이름·이메일·기기 ID 는 없다 (스토어 알림에 들어 있지 않음). Google 구매 토큰은 그대로 두지 않고 바꾼 값(해시)만 남긴다.
--  1년이 지나면 purge_store_event() 가 매일 지운다 — purge_old_records() 는 브랜치마다 본문이 달라
--  schema.sql 을 다시 실행할 때 줄이 조용히 사라질 수 있어 AI 답변 신고(purge_ai_report)처럼 따로 둔다.
-- ════════════════════════════════════════════════════════════════════

create table if not exists store_event (
  id                      bigserial primary key,
  store                   text not null,     -- apple | google
  environment             text,              -- Production | Sandbox | test (Google 연결 확인)
  kind                    text not null,     -- purchase | renewal | refund | cancel | expire | fail | test | other
  notification            text,              -- 스토어가 붙인 알림 이름 (예: DID_RENEW, SUBSCRIPTION_RENEWED)
  product_id              text,
  plan                    text,              -- day | weekly | lifetime | credits
  amount                  numeric,           -- 결제 금액 (Apple 은 알림에 든 가격, Google 은 요금제 정가)
  currency                text,              -- KRW …
  transaction_id          text,              -- Apple 거래 ID · Google 구매 토큰 해시(갱신 등은 + 알림 시각) · 연결 확인은 메시지 ID
  original_transaction_id text,              -- 같은 구매·구독을 묶는 ID (Apple 원거래 ID · Google 구매 토큰 해시)
  raw                     jsonb,             -- 고른 항목만 (알림 ID·서명 시각·거래 종류·구매/만료 시각 등)
  created_at              timestamptz not null default now()
);

-- 스토어가 같은 알림을 다시 보내도(응답이 늦거나 실패하면 다시 보냄) 한 번만 남긴다.
-- 거래 ID 가 없는 행(null)은 고유 색인에서 서로 다른 값으로 보므로 「transaction_id is not null 일 때만」과 같은 효과다.
-- 부분 색인(where …)으로 만들면 PostgREST 의 on_conflict 가 대상으로 삼지 못해 중복 무시가 오류가 되므로 일반 고유 색인으로 둔다
create unique index if not exists store_event_dedupe_idx on store_event (store, transaction_id, kind);
create index if not exists store_event_created_idx  on store_event (created_at desc);
create index if not exists store_event_original_idx on store_event (original_transaction_id) where original_transaction_id is not null;

-- 공개 키(anon)로는 읽기·쓰기 불가 — 서버(service_role)만
alter table store_event enable row level security;

-- ── 스토어 결제 알림 1년 파기 (처리방침 3번 「스토어 결제 알림」) — 매일 03:40 KST ─
create or replace function purge_store_event()
returns void
language sql
security definer
set search_path = public
as $$
  delete from store_event where created_at < now() - interval '1 year';
$$;

comment on function purge_store_event is '스토어 결제 알림 기록 1년 파기 (pg_cron mylovecoach-purge-store 매일 03:40 KST — purge_old_records 와 따로 둔다)';

do $$
begin
  revoke execute on function purge_store_event() from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function purge_store_event() from anon, authenticated;
  end if;
end $$;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron 을 켤 수 없어 스토어 결제 알림 1년 파기 예약을 건너뜁니다: %', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'mylovecoach-purge-store';
  perform cron.schedule('mylovecoach-purge-store', '40 18 * * *', 'select public.purge_store_event()');
end $$;
