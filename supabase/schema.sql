-- 나만의 연애코치 — 이용 기록 데이터베이스 (Supabase / PostgreSQL)
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 개인정보 원칙
--  · 계정을 만들지 않으므로 이메일·전화번호는 저장하지 않습니다.
--  · 기기마다 무작위로 만든 device_id 로만 구분합니다 (광고 ID 아님).
--  · 대화 캡처 이미지는 절대 저장하지 않고, 첨부 여부(has_image)만 남깁니다.
--  · 「서비스 개선을 위한 이용 기록 수집」에 동의한 이용자의 기록만 들어옵니다.
--  · 모든 테이블은 RLS 로 잠겨 있어 service_role 키(서버)로만 접근할 수 있습니다.

create extension if not exists "pgcrypto";

-- ── 이용자 (기기 단위) ────────────────────────────────────────────────
create table if not exists app_user (
  device_id      text primary key,
  name           text,                       -- 온보딩에서 입력한 이름/별명
  gender         text,
  age            int,
  mbti           text,
  default_tone   text,
  platform       text,                       -- ios | android | web
  app_version    text,
  premium_plan   text,                       -- null | weekly | lifetime
  crush_count    int  default 0,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

-- ── 세션 (앱을 열고 닫을 때까지) ──────────────────────────────────────
create table if not exists app_session (
  id          uuid primary key,
  device_id   text not null,
  platform    text,
  app_version text,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  duration_ms bigint
);
create index if not exists app_session_device_idx on app_session (device_id, started_at desc);

-- ── 화면 체류 (어디에 얼마나 머물렀는지) ──────────────────────────────
create table if not exists screen_view (
  id          bigserial primary key,
  device_id   text not null,
  session_id  uuid,
  screen      text not null,                 -- /(tabs) · /crush/[id] · /paywall …
  duration_ms bigint,
  created_at  timestamptz not null default now()
);
create index if not exists screen_view_created_idx on screen_view (created_at desc);
create index if not exists screen_view_screen_idx  on screen_view (screen);

-- ── 코칭 기록 (무엇을 물어봤고 어떤 답장을 받았는지) ──────────────────
create table if not exists coach_log (
  id                bigserial primary key,
  device_id         text,
  session_id        uuid,
  crush_alias       text,                    -- 상대 이름/별명
  crush_gender      text,
  crush_age         int,
  crush_mbti        text,
  relationship      text,                    -- crush · talking · dating …
  tone              text,
  question          text,                    -- 이용자가 적은 상황·질문
  has_image         boolean default false,   -- 캡처 첨부 여부 (이미지 자체는 저장 안 함)
  temperature       text,
  interest_score    int,
  summary           text,
  reply_texts       text[],
  next_step         text,
  provider          text,
  latency_ms        int,
  error             text,
  created_at        timestamptz not null default now()
);
create index if not exists coach_log_created_idx on coach_log (created_at desc);

-- ── 일반 이벤트 (버튼·페이월·구매 등) ─────────────────────────────────
create table if not exists app_event (
  id         bigserial primary key,
  device_id  text not null,
  session_id uuid,
  name       text not null,                  -- onboarding_done · paywall_open · purchase …
  props      jsonb,
  created_at timestamptz not null default now()
);
create index if not exists app_event_created_idx on app_event (created_at desc);
create index if not exists app_event_name_idx    on app_event (name);

-- ── 잠금: 공개 키(anon)로는 아무것도 못 읽고 못 씁니다 ────────────────
alter table app_user    enable row level security;
alter table app_session enable row level security;
alter table screen_view enable row level security;
alter table coach_log   enable row level security;
alter table app_event   enable row level security;

-- ── 관리자 대시보드용 집계 ────────────────────────────────────────────
create or replace function admin_stats(p_days int default 7)
returns json
language sql
security definer
set search_path = public
as $$
  with span as (select now() - make_interval(days => greatest(p_days, 1)) as since)
  select json_build_object(
    'days', p_days,
    'users_total',    (select count(*) from app_user),
    'users_new',      (select count(*) from app_user, span where first_seen_at >= span.since),
    'users_active',   (select count(*) from app_user, span where last_seen_at  >= span.since),
    'premium_users',  (select count(*) from app_user where premium_plan is not null),
    'sessions',       (select count(*) from app_session, span where started_at >= span.since),
    'avg_session_sec',(select coalesce(round(avg(duration_ms) / 1000.0), 0) from app_session, span where started_at >= span.since and duration_ms is not null),
    'coach_requests', (select count(*) from coach_log,  span where created_at >= span.since),
    'with_image',     (select count(*) from coach_log,  span where created_at >= span.since and has_image),
    'by_day', (
      select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) from (
        select to_char(date_trunc('day', created_at), 'MM-DD') as day,
               count(*)                       as requests,
               count(distinct device_id)      as users
        from coach_log, span where created_at >= span.since
        group by 1 order by 1
      ) d
    ),
    'top_screens', (
      select coalesce(json_agg(row_to_json(s) order by s.total_sec desc), '[]'::json) from (
        select screen,
               count(*)                                         as views,
               round(coalesce(sum(duration_ms), 0) / 1000.0)     as total_sec,
               round(coalesce(avg(duration_ms), 0) / 1000.0, 1)  as avg_sec
        from screen_view, span where created_at >= span.since
        group by screen order by total_sec desc limit 15
      ) s
    ),
    'top_events', (
      select coalesce(json_agg(row_to_json(e) order by e.count desc), '[]'::json) from (
        select name, count(*) as count
        from app_event, span where created_at >= span.since
        group by name order by count desc limit 20
      ) e
    ),
    'tones', (
      select coalesce(json_agg(row_to_json(t) order by t.count desc), '[]'::json) from (
        select coalesce(tone, '(없음)') as tone, count(*) as count
        from coach_log, span where created_at >= span.since group by 1 order by 2 desc
      ) t
    ),
    'relationships', (
      select coalesce(json_agg(row_to_json(r) order by r.count desc), '[]'::json) from (
        select coalesce(relationship, '(없음)') as relationship, count(*) as count
        from coach_log, span where created_at >= span.since group by 1 order by 2 desc
      ) r
    )
  );
$$;

comment on function admin_stats is '관리자 대시보드 집계 (/api/admin 에서 service_role 키로 호출)';
