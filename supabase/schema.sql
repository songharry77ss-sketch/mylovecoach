-- 나만의 연애코치 — 이용 기록 데이터베이스 (Supabase / PostgreSQL)
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 개인정보 원칙
--  · 계정을 만들지 않으므로 이메일·전화번호는 저장하지 않습니다.
--  · 기기마다 무작위로 만든 device_id 로만 구분합니다 (광고 ID 아님).
--  · 대화 캡처 이미지는 절대 저장하지 않고, 첨부 여부(has_image)만 남깁니다.
--  · 「서비스 개선을 위한 이용 기록 수집」에 동의한 이용자의 기록만 들어옵니다.
--    (AI 답변 신고 ai_report 는 동의와 관계없이 이용자가 직접 보낸 신고만, 기기 ID 없이 들어옵니다)
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

-- 유입 경로 (처음 앱을 연 곳). 예전에 만든 표에도 붙도록 alter 로 추가
alter table app_user add column if not exists source        text;   -- utm_source · 이전 사이트 · 설치 경로(ios/android/apk/web)
alter table app_user add column if not exists source_detail jsonb;  -- utm_medium·utm_campaign·referrer·처음 연 주소

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
create index if not exists screen_view_device_idx  on screen_view (device_id, created_at desc);

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
create index if not exists coach_log_device_idx  on coach_log (device_id, created_at desc);

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
create index if not exists app_event_device_idx  on app_event (device_id, created_at desc);

-- ── 팀원 무제한 (관리자 페이지에서 기기 ID 로 켜고 끔) ──────────────
create table if not exists team_member (
  device_id   text primary key,              -- 앱 「마이 → 내 기기 ID」
  label       text,                          -- 누구인지 (이름·역할)
  created_at  timestamptz not null default now()
);

-- ── 회원 (카카오·Google·Apple 로그인, Supabase Auth 의 auth.users 와 같은 id) ──
create table if not exists member (
  user_id       uuid primary key,
  provider      text,                        -- kakao · google · apple
  nickname      text,
  email         text,                        -- 제공자가 알려 준 경우만 (Apple 은 가린 주소일 수 있음)
  device_id     text,                        -- 마지막으로 로그인한 기기
  bonus_device  text,                        -- 가입 보너스를 준 기기 (기기당 한 번)
  bonus_at      timestamptz,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);
create index if not exists member_device_idx on member (device_id);
create unique index if not exists member_bonus_device_idx on member (bonus_device) where bonus_device is not null;
alter table app_user add column if not exists user_id uuid;   -- 가입한 회원이면 그 id
create index if not exists app_user_user_idx on app_user (user_id) where user_id is not null;

-- 탈퇴한 회원이 가입 보너스를 받은 기기 — 같은 기기로 다시 가입해 보너스를 또 받지 않게, 탈퇴 후 1년만 보관
create table if not exists bonus_spent (
  device_id    text primary key,
  bonus_at     timestamptz,
  withdrawn_at timestamptz not null default now()
);

-- 회원이 로그인한 기기 이력 — 마지막 기기(member.device_id)만 보면, 다른 기기로 로그인한 뒤 예전 기기에서
-- 처음 쌓인 이용 기록이 회원과 이어지지 않고 탈퇴해도 남는다. 회원 정보라 탈퇴할 때 member_delete 가 지운다 (외래 키 없음)
create table if not exists member_device (
  user_id   uuid not null,
  device_id text not null,
  first_at  timestamptz not null default now(),   -- 이 기기로 처음 로그인한 시각
  last_at   timestamptz not null default now(),   -- 이 기기로 마지막으로 로그인한 시각
  primary key (user_id, device_id)
);
create index if not exists member_device_device_idx on member_device (device_id, last_at desc);

-- 이 표가 생기기 전에 가입한 회원의 기기(마지막 기기·보너스 기기·이미 이어진 이용 기록의 기기)를 채운다. 이미 있으면 그대로
insert into member_device (user_id, device_id, first_at, last_at)
select user_id, device_id, min(at), max(at) from (
  select user_id, device_id, last_login_at as at from member where device_id is not null
  union all
  select user_id, bonus_device, coalesce(bonus_at, created_at) from member where bonus_device is not null
  union all
  select a.user_id, a.device_id, m.created_at from app_user a join member m on m.user_id = a.user_id
) d
group by user_id, device_id
on conflict (user_id, device_id) do nothing;

-- 처음 기록되는 기기에 회원이 로그인한 적 있으면(가입 뒤에 이용 기록을 켠 경우) 그 기기로 가장 최근에 로그인한 회원으로 표시
create or replace function app_user_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    select d.user_id into new.user_id
      from member_device d join member m on m.user_id = d.user_id
     where d.device_id = new.device_id and m.provider is not null
     order by d.last_at desc limit 1;
  end if;
  return new;
end $$;

drop trigger if exists app_user_member on app_user;
create trigger app_user_member before insert on app_user for each row execute function app_user_member();

-- 로그인할 때마다: 회원을 만들거나 갱신하고, 기기와 잇고, 처음이면 보너스 (회원당·기기당 한 번)
create or replace function member_link(p_user uuid, p_provider text, p_nickname text, p_email text, p_device text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new   boolean;
  v_bonus boolean := false;
  m       member;
begin
  insert into member (user_id, provider, nickname, email, device_id)
  values (p_user, p_provider, p_nickname, p_email, p_device)
  on conflict (user_id) do update
    set last_login_at = now(),
        provider      = coalesce(excluded.provider, member.provider),
        device_id     = coalesce(excluded.device_id, member.device_id),
        nickname      = coalesce(member.nickname, excluded.nickname),
        email         = coalesce(excluded.email, member.email)
  returning (xmax = 0) into v_new;

  if p_device is not null
     and not exists (select 1 from member where bonus_device = p_device)
     and not exists (select 1 from bonus_spent where device_id = p_device) then
    begin
      update member set bonus_device = p_device, bonus_at = now() where user_id = p_user and bonus_at is null;
      v_bonus := found;
    exception when unique_violation then
      v_bonus := false;   -- 같은 기기로 동시에 가입한 다른 계정이 먼저 받음
    end;
  end if;

  -- 이 기기로 로그인한 이력을 남기고(나중에 이 기기에서 처음 쌓이는 이용 기록은 트리거가 잇는다),
  -- 이 기기의 이용 기록을 회원과 잇는다. 이미 다른 회원과 이어진 기기는 건드리지 않는다
  if p_device is not null then
    insert into member_device (user_id, device_id) values (p_user, p_device)
    on conflict (user_id, device_id) do update set last_at = now();
    update app_user set user_id = p_user where device_id = p_device and (user_id is null or user_id = p_user);
  end if;

  select * into m from member where user_id = p_user;
  return json_build_object('new', v_new, 'bonus', v_bonus, 'provider', m.provider, 'nickname', m.nickname, 'created_at', m.created_at);
end $$;

-- 회원 탈퇴: 회원 기록·로그인한 기기 이력과, 이 회원과 이어진 기기들의 이용 기록을 지운다 (로그인 계정은 서버가 Auth API 로 지움).
-- 앱이 알려 준 기기 ID(member.device_id·member_device) 만으로는 지우지 않는다 — 서버에서 이 회원과 이어진(app_user.user_id) 기기만.
-- 다시 실행해도 안전하다 (지울 것이 없으면 아무 일도 하지 않음)
create or replace function member_delete(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devices text[];
begin
  select array_agg(device_id) into v_devices from app_user where user_id = p_user;
  if v_devices is not null then
    delete from coach_log   where device_id = any (v_devices);
    delete from app_event   where device_id = any (v_devices);
    delete from screen_view where device_id = any (v_devices);
    delete from app_session where device_id = any (v_devices);
    delete from app_user    where device_id = any (v_devices);
  end if;
  -- 같은 기기로 다시 가입해 보너스를 또 받지 않게, 보너스를 준 기기 ID 와 지급 시각만 따로 1년 보관
  insert into bonus_spent (device_id, bonus_at)
  select bonus_device, bonus_at from member where user_id = p_user and bonus_device is not null
  on conflict (device_id) do nothing;
  delete from member_device where user_id = p_user;
  delete from member where user_id = p_user;
end $$;

-- ── 관리자 로그인 시도 (비밀번호 대입 방지, 성공하면 그 IP 기록은 지움) ─
-- ── 하루 저장량 상한 (공개 API 로 무료 DB 를 채우지 못하게, 날짜·종류별 저장한 내용의 크기 KB) ─
create table if not exists usage_quota (
  day   date   not null,                   -- 한국 날짜
  kind  text   not null,                   -- track(이용 기록) · coach(코칭 기록)
  units bigint not null default 0,         -- 저장한 내용의 크기 (KB)
  primary key (day, kind)
);

-- 오늘 저장할 크기(KB)를 더하고, 상한 안이면 true (넘으면 false — 서버는 저장하지 않음).
-- 데이터베이스 전체가 400MB(무료 플랜 500MB)를 넘으면 더 저장하지 않는다 — 삭제·팀원 등록·파기는 계속 동작하도록
create or replace function take_quota(p_kind text, p_units int, p_limit bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  if pg_database_size(current_database()) > 400::bigint * 1024 * 1024 then
    return false;
  end if;
  insert into usage_quota (day, kind, units)
  values ((now() at time zone 'Asia/Seoul')::date, p_kind, greatest(p_units, 0))
  on conflict (day, kind) do update set units = usage_quota.units + excluded.units
  returning units into v_total;
  return v_total <= p_limit;
end $$;

create table if not exists admin_auth_fail (
  id         bigserial primary key,
  ip         text,
  created_at timestamptz not null default now()
);
create index if not exists admin_auth_fail_created_idx on admin_auth_fail (created_at desc);

-- ── AI 답변 신고 (앱 안에서 불쾌·부적절한 AI 답변을 신고 — 구글 플레이 생성형 AI 정책) ─
-- 이용 기록 동의와 관계없이 이용자가 「신고하기」를 누른 것만 들어온다 (api/report.ts).
-- 누가 보냈는지 남기지 않도록 기기 ID·IP 칸은 두지 않는다. 1년 지나면 파기
create table if not exists ai_report (
  id          bigint generated by default as identity primary key,
  created_at  timestamptz not null default now(),
  mode        text not null,                 -- coach · report · practice · mind
  reason      text not null,                 -- offensive · sexual · hate · dangerous · inaccurate · other
  note        text,                          -- 이용자가 적은 메모 (300자까지)
  content     text,                          -- 신고한 AI 답변 (4000자까지, 마이 탭에서 메모만으로 신고하면 비어 있음)
  model       text,                          -- 답변이 나온 곳 (예: google/relay)
  platform    text,                          -- ios | android | web
  app_version text,
  status      text not null default 'new'    -- 검토 표시 (new → done)
);
create index if not exists ai_report_created_idx on ai_report (created_at desc);

-- 하루 저장 상한 — 앱 토큰은 공개 번들에 있어 누구나 /api/report 를 부를 수 있고 서버의 IP 빈도 제한은 인스턴스마다 따로 센다.
-- 한국 날짜로 하루 300건, 또는 데이터베이스 전체가 400MB(무료 플랜 500MB)를 넘으면 저장을 거절한다 (supabase/ai_report.sql 과 같음)
create or replace function ai_report_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_database_size(current_database()) > 400::bigint * 1024 * 1024 then
    raise exception using errcode = 'PT503', message = 'ai_report: 데이터베이스가 400MB 를 넘어 신고를 저장하지 않음';
  end if;
  if (select count(*) from ai_report
       where created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') >= 300 then
    raise exception using errcode = 'PT429', message = 'ai_report: 오늘 신고 저장 상한(300건)을 넘음';
  end if;
  return new;
end $$;

drop trigger if exists ai_report_quota on ai_report;
create trigger ai_report_quota before insert on ai_report
  for each row execute function ai_report_quota();

-- ── 잠금: 공개 키(anon)로는 아무것도 못 읽고 못 씁니다 ────────────────
alter table app_user        enable row level security;
alter table app_session     enable row level security;
alter table screen_view     enable row level security;
alter table coach_log       enable row level security;
alter table app_event       enable row level security;
alter table team_member     enable row level security;
alter table ai_report       enable row level security;
alter table admin_auth_fail enable row level security;
alter table member          enable row level security;
alter table member_device   enable row level security;
alter table bonus_spent     enable row level security;
alter table usage_quota     enable row level security;

-- ── 관리자 대시보드용 집계 ────────────────────────────────────────────
-- 화면 경로의 채팅방·연습 ID 를 묶는다 (/crush/c_abc123 → /crush/[id])
create or replace function screen_name(p text)
returns text
language sql
immutable
as $$ select regexp_replace(coalesce(p, ''), '/(c|pr)_[a-z0-9]+', '/[id]', 'g') $$;

create or replace function admin_stats(p_days int default 7)
returns json
language sql
security definer
set search_path = public
as $$
  -- 「오늘」(1일)은 한국 시간 자정부터, 그 밖은 지금부터 N일 전부터. 날짜별 묶음도 한국 시간 기준
  with span as (
    select case when p_days <= 1 then date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
                else now() - make_interval(days => p_days) end as since
  )
  select json_build_object(
    'days', p_days,
    'users_total',    (select count(*) from app_user),
    'users_new',      (select count(*) from app_user, span where first_seen_at >= span.since),
    'users_active',   (select count(*) from app_user, span where last_seen_at  >= span.since),
    'online_now',     (select count(*) from app_user where last_seen_at >= now() - interval '5 minutes'),
    'premium_users',  (select count(*) from app_user where premium_plan is not null),
    'members_total',  (select count(*) from member where provider is not null),
    'members_new',    (select count(*) from member, span where provider is not null and created_at >= span.since),
    'members_by_provider', (
      select coalesce(json_agg(row_to_json(p) order by p.users desc), '[]'::json) from (
        select provider, count(*) as users from member, span
        where provider is not null and created_at >= span.since group by 1 order by 2 desc
      ) p
    ),
    'members_by_day', (
      select coalesce(json_agg(json_build_object('day', to_char(d.d, 'MM-DD'), 'users', d.users) order by d.d), '[]'::json) from (
        select (created_at at time zone 'Asia/Seoul')::date as d, count(*) as users
        from member, span where provider is not null and created_at >= span.since group by 1
      ) d
    ),
    'sessions',       (select count(*) from app_session, span where started_at >= span.since),
    'avg_session_sec',(select coalesce(round(avg(duration_ms) / 1000.0), 0) from app_session, span where started_at >= span.since and duration_ms is not null),
    'coach_requests', (select count(*) from coach_log,  span where created_at >= span.since),
    'with_image',     (select count(*) from coach_log,  span where created_at >= span.since and has_image),
    'signups_by_day', (
      select coalesce(json_agg(json_build_object('day', to_char(d.d, 'MM-DD'), 'users', d.users) order by d.d), '[]'::json) from (
        select (first_seen_at at time zone 'Asia/Seoul')::date as d, count(*) as users
        from app_user, span where first_seen_at >= span.since
        group by 1
      ) d
    ),
    'signup_sources', (
      select coalesce(json_agg(row_to_json(s) order by s.users desc), '[]'::json) from (
        select coalesce(nullif(source_detail->>'source', ''), nullif(source_detail->>'referrer', ''), nullif(source_detail->>'channel', ''), platform, '(모름)') as source,
               count(*) as users
        from app_user, span where first_seen_at >= span.since
        group by 1 order by 2 desc limit 20
      ) s
    ),
    'by_day', (
      select coalesce(json_agg(json_build_object('day', to_char(d.d, 'MM-DD'), 'requests', d.requests, 'users', d.users) order by d.d), '[]'::json) from (
        select (created_at at time zone 'Asia/Seoul')::date as d,
               count(*)                  as requests,
               count(distinct device_id) as users
        from coach_log, span where created_at >= span.since
        group by 1
      ) d
    ),
    'top_screens', (
      select coalesce(json_agg(row_to_json(s) order by s.total_sec desc), '[]'::json) from (
        select screen_name(screen)                              as screen,
               count(*)                                         as views,
               round(coalesce(sum(duration_ms), 0) / 1000.0)     as total_sec,
               round(coalesce(avg(duration_ms), 0) / 1000.0, 1)  as avg_sec
        from screen_view, span where created_at >= span.since
        group by 1 order by total_sec desc limit 15
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

-- ── 이용자 목록 (최근 p_days 일 안에 들어온 사람, 마지막 접속 순) ─────
create or replace function admin_users(p_days int default 30, p_limit int default 200)
returns json
language sql
security definer
set search_path = public
as $$
  -- 「오늘」(1일)은 집계(admin_stats)와 같이 한국 시간 자정부터
  with span as (
    select case when p_days <= 1 then date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
                else now() - make_interval(days => p_days) end as since
  ), recent as (
    select app_user.* from app_user, span
    where last_seen_at >= span.since
    order by last_seen_at desc
    limit greatest(p_limit, 1)
  )
  select coalesce(json_agg(row_to_json(r) order by r.last_seen_at desc), '[]'::json) from (
    select u.device_id, u.name, u.gender, u.age, u.mbti, u.platform, u.app_version, u.premium_plan, u.crush_count,
           u.first_seen_at, u.last_seen_at, u.source, u.source_detail,
           (select e.props->>'mode' from app_event e where e.device_id = u.device_id and e.name = 'start' order by e.created_at limit 1) as start_mode,
           (select count(*) from app_session s where s.device_id = u.device_id)                                as sessions,
           (select round(coalesce(sum(v.duration_ms), 0) / 1000.0) from screen_view v where v.device_id = u.device_id) as total_sec,
           (select count(*) from coach_log c where c.device_id = u.device_id)                                  as coach_count,
           exists (select 1 from team_member t where t.device_id = u.device_id)                                as is_team,
           m.provider as member_provider, m.nickname as member_nickname, m.created_at as member_since
    from recent u
    left join member m on m.user_id = u.user_id and m.provider is not null
  ) r;
$$;

comment on function admin_users is '관리자 페이지 이용자 목록';

-- ── 이용자 한 명의 상세 (화면별 체류·이동 경로·코칭 대화·버튼 기록·실행 기록) ─
create or replace function admin_user(p_device text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'user',    (select row_to_json(a) from app_user a where a.device_id = p_device),
    'is_team', exists (select 1 from team_member t where t.device_id = p_device),
    'member',  (select json_build_object('provider', m.provider, 'nickname', m.nickname, 'email', m.email, 'created_at', m.created_at, 'last_login_at', m.last_login_at)
                from app_user a join member m on m.user_id = a.user_id where a.device_id = p_device and m.provider is not null),
    'screens', (
      select coalesce(json_agg(row_to_json(s) order by s.total_sec desc), '[]'::json) from (
        select screen_name(screen) as screen, count(*) as views, round(coalesce(sum(duration_ms), 0) / 1000.0) as total_sec
        from screen_view where device_id = p_device group by 1
      ) s
    ),
    'path', (
      select coalesce(json_agg(row_to_json(v) order by v.created_at desc), '[]'::json) from (
        select screen_name(screen) as screen, round(coalesce(duration_ms, 0) / 1000.0) as sec, created_at
        from screen_view where device_id = p_device order by created_at desc limit 100
      ) v
    ),
    'sessions', (
      select coalesce(json_agg(row_to_json(s) order by s.started_at desc), '[]'::json) from (
        select started_at, ended_at, round(duration_ms / 1000.0) as duration_sec, platform, app_version
        from app_session where device_id = p_device order by started_at desc limit 30
      ) s
    ),
    'chats', (
      select coalesce(json_agg(row_to_json(c) order by c.created_at desc), '[]'::json) from (
        select created_at, crush_alias, crush_gender, crush_age, crush_mbti, relationship, tone, question, has_image,
               temperature, interest_score, summary, reply_texts, next_step, error
        from coach_log where device_id = p_device order by created_at desc limit 50
      ) c
    ),
    'events', (
      select coalesce(json_agg(row_to_json(e) order by e.created_at desc), '[]'::json) from (
        select name, props, created_at from app_event where device_id = p_device order by created_at desc limit 100
      ) e
    )
  );
$$;

comment on function admin_user is '관리자 페이지 이용자 상세';

-- ── 기기 하나의 이용 기록을 모두 지움 (동의 철회·삭제 요청·관리자 「기록 삭제」) ─
-- (시험 중에 잠깐 있던 시각 기준 판은 지운다 — 같은 이름이 두 개면 PostgREST 가 어느 쪽인지 고르지 못한다)
drop function if exists delete_device(text, timestamptz);
create or replace function delete_device(p_device text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from coach_log   where device_id = p_device;
  delete from app_event   where device_id = p_device;
  delete from screen_view where device_id = p_device;
  delete from app_session where device_id = p_device;
  delete from app_user    where device_id = p_device;
$$;

comment on function delete_device is '기기 ID 하나의 이용 기록 삭제 (DELETE /api/track, 관리자 기록 삭제, 만 14세 미만)';

-- ── 1년 지난 이용 기록 파기 (처리방침 4번 「1년이 지나면 파기」) ─
-- AI 답변 신고는 아래 purge_ai_report() 가 따로 지운다 — 이 함수는 브랜치마다 본문이 달라 다시 만들 때 줄이 사라질 수 있어서
-- (스토어 결제 알림 store_event 도 같은 이유로 파일 끝의 purge_store_event() 가 따로 지운다)
create or replace function purge_old_records()
returns void
language sql
security definer
set search_path = public
as $$
  delete from coach_log       where created_at   < now() - interval '1 year';
  delete from app_event       where created_at   < now() - interval '1 year';
  delete from screen_view     where created_at   < now() - interval '1 year';
  delete from app_session     where started_at   < now() - interval '1 year';
  delete from app_user        where last_seen_at < now() - interval '1 year';
  delete from bonus_spent     where withdrawn_at < now() - interval '1 year';
  -- 로그인한 기기 이력은 회원 정보라 1년 파기 대상이 아니다(탈퇴할 때 member_delete 가 지움). 회원 행이 따로 지워져 남은 것만 정리
  delete from member_device   where not exists (select 1 from member m where m.user_id = member_device.user_id);
  -- 처음 들어온 경로는 계속 쓰는 이용자라도 수집 1년이 지나면 지운다
  update app_user set source = null, source_detail = null
   where first_seen_at < now() - interval '1 year' and (source is not null or source_detail is not null);
  delete from admin_auth_fail where created_at   < now() - interval '30 days';
  delete from usage_quota     where day < (now() at time zone 'Asia/Seoul')::date - 7;
$$;

comment on function purge_old_records is '1년 지난 이용 기록·유입 경로, 탈퇴 1년 지난 보너스 기기, 회원이 없는 기기 이력, 30일 지난 관리자 로그인 시도, 7일 지난 저장량 기록 파기 (pg_cron 매일 03:30 KST)';

-- 매일 03:30(한국 시간) = 18:30 UTC 에 파기. pg_cron 을 쓸 수 없는 곳(로컬 시험 등)에서는 건너뛴다
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron 을 켤 수 없어 1년 파기 예약을 건너뜁니다: %', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'mylovecoach-purge';
  perform cron.schedule('mylovecoach-purge', '30 18 * * *', 'select public.purge_old_records()');
end $$;

-- ── AI 답변 신고 1년 파기 (처리방침 2번 「AI 답변 신고」) — purge_old_records 와 따로, 매일 03:35 KST ─
-- purge_old_records 는 가입·1.0 판 schema.sql 이 각자 통째로 다시 만들므로 거기에 두면 신고 줄이 조용히 사라질 수 있다
create or replace function purge_ai_report()
returns void
language sql
security definer
set search_path = public
as $$
  delete from ai_report where created_at < now() - interval '1 year';
$$;

comment on function purge_ai_report is 'AI 답변 신고 1년 파기 (pg_cron mylovecoach-purge-report 매일 03:35 KST — purge_old_records 와 따로 둔다)';

do $$
begin
  revoke execute on function purge_ai_report() from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function purge_ai_report() from anon, authenticated;
  end if;
end $$;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron 을 켤 수 없어 신고 1년 파기 예약을 건너뜁니다: %', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'mylovecoach-purge-report';
  perform cron.schedule('mylovecoach-purge-report', '35 18 * * *', 'select public.purge_ai_report()');
end $$;

-- ── 결제 흐름: 앱 실행 → 시작 → 코칭 → 결제 화면 → 결제창(스토어) → 결제 완료 ─
-- 이용 기록에 동의한 기기만 들어 있다 (전체 이용자가 아님)
create or replace function admin_funnel(p_days int default 7)
returns json
language sql
security definer
set search_path = public
as $$
  -- 「오늘」(1일)은 한국 시간 자정부터, 그 밖은 지금부터 N일 전부터 (admin_stats 와 같은 기준)
  with span as (
    select case when p_days <= 1 then date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
                else now() - make_interval(days => p_days) end as since
  ), ev as (
    select e.device_id, e.session_id, e.name, e.props, e.created_at
    from app_event e, span where e.created_at >= span.since
  ), sv as (
    select v.id, v.device_id, v.session_id, screen_name(v.screen) as screen, v.duration_ms, v.created_at,
           lag(screen_name(v.screen)) over (partition by v.device_id, v.session_id order by v.created_at, v.id) as before
    from screen_view v, span where v.created_at >= span.since
  ), runs as (
    -- 앱을 잠깐 내렸다 올리면 같은 화면이 연달아 기록된다 → 한 번 머문 것으로 묶어 앞뒤 화면을 본다
    select device_id, session_id, screen, created_at,
           lag(screen)  over w as prev_screen,
           lead(screen) over w as next_screen
    from sv where before is distinct from screen
    window w as (partition by device_id, session_id order by created_at, id)
  ), open_rows as (
    select o.device_id, o.session_id, o.created_at, o.props,
           lead(o.created_at) over (partition by o.device_id, o.session_id order by o.created_at) as next_open
    from ev o where o.name = 'paywall_open'
  ), opens as (
    -- 결제 화면을 연 한 번 한 번 — 같은 세션에서 그 뒤(다음에 다시 열기 전까지) 결제창을 열었는지·결제했는지
    select o.device_id, coalesce(nullif(o.props->>'reason', ''), '(모름)') as reason,
           exists (select 1 from ev p where p.device_id = o.device_id and p.session_id is not distinct from o.session_id
                   and p.name = 'purchase_start' and p.created_at >= o.created_at
                   and (o.next_open is null or p.created_at < o.next_open)) as tried,
           exists (select 1 from ev p where p.device_id = o.device_id and p.session_id is not distinct from o.session_id
                   and p.name in ('purchase_purchased', 'purchase_granted') and p.created_at >= o.created_at
                   and (o.next_open is null or p.created_at < o.next_open)) as bought
    from open_rows o
  ), visits as (
    -- 결제 화면에 머문 시간 (실행(세션)마다 합침 — 결제 시트가 떠 있는 동안 기록이 나뉘어도 한 번으로)
    select device_id, session_id, sum(coalesce(duration_ms, 0)) as ms
    from sv where screen = '/paywall' group by 1, 2
  )
  select json_build_object(
    'days', p_days,
    'steps', json_build_array(
      json_build_object('key', 'open',    'label', '앱 실행',            'users', (select count(distinct s.device_id) from app_session s, span where s.started_at >= span.since)),
      json_build_object('key', 'start',   'label', '첫 화면 통과',       'users', (select count(distinct device_id) from ev where name = 'start')),
      json_build_object('key', 'coach',   'label', '코칭 1회 이상',      'users', (select count(distinct c.device_id) from coach_log c, span where c.created_at >= span.since)),
      json_build_object('key', 'paywall', 'label', '결제 화면 열람',     'users', (select count(distinct device_id) from ev where name = 'paywall_open')),
      json_build_object('key', 'try',     'label', '결제창 진입(스토어)', 'users', (select count(distinct device_id) from ev where name = 'purchase_start')),
      json_build_object('key', 'paid',    'label', '결제 완료',          'users', (select count(distinct device_id) from ev where name in ('purchase_purchased', 'purchase_granted')))
    ),
    'signup', json_build_object(
      'opened', (select count(distinct device_id) from ev where name = 'signup_open'),
      'joined', (select count(distinct device_id) from ev where name = 'signup')
    ),
    'reasons', (
      select coalesce(json_agg(row_to_json(r) order by r.opens desc), '[]'::json) from (
        select reason, count(*) as opens, count(distinct device_id) as users,
               count(*) filter (where tried) as tried, count(*) filter (where bought) as bought
        from opens group by 1
      ) r
    ),
    'plans', (
      select coalesce(json_agg(row_to_json(p) order by p.starts desc, p.picks desc), '[]'::json) from (
        select coalesce(nullif(props->>'plan', ''), '(모름)') as plan,
               count(*) filter (where name = 'paywall_plan')                                    as picks,
               count(*) filter (where name = 'purchase_start')                                  as starts,
               count(*) filter (where name in ('purchase_purchased', 'purchase_granted'))       as paid,
               count(*) filter (where name = 'purchase_cancelled')                              as cancelled,
               count(*) filter (where name = 'purchase_pending')                                as pending,
               count(*) filter (where name = 'purchase_error')                                  as errors
        from ev where name = 'paywall_plan' or name like 'purchase\_%'
        group by 1
      ) p
    ),
    'errors', (
      select coalesce(json_agg(row_to_json(x) order by x.count desc), '[]'::json) from (
        select coalesce(nullif(props->>'message', ''), '(내용 없음)') as message, count(*) as count
        from ev where name = 'purchase_error' group by 1 order by 2 desc limit 10
      ) x
    ),
    'paywall_time', (
      select json_build_object(
        'visits', count(*),
        'avg_sec', round(coalesce(avg(ms), 0) / 1000.0, 1),
        'median_sec', round(coalesce(percentile_cont(0.5) within group (order by ms), 0)::numeric / 1000.0, 1)
      ) from visits
    ),
    'closes', (
      select json_build_object(
        'count', count(*),
        'avg_sec', round(coalesce(avg(case when props->>'sec' ~ '^[0-9]+(\.[0-9]+)?$' then (props->>'sec')::numeric end), 0), 1),
        'after_pick', count(*) filter (where props->>'picked' = 'true')
      ) from ev where name = 'paywall_close'
    ),
    'restores', (
      select coalesce(json_agg(row_to_json(x) order by x.count desc), '[]'::json) from (
        select coalesce(nullif(props->>'result', ''), '(모름)') as result, count(*) as count
        from ev where name = 'restore_result' group by 1
      ) x
    ),
    'before_paywall', (
      select coalesce(json_agg(row_to_json(x) order by x.count desc), '[]'::json) from (
        select coalesce(prev_screen, '(앱 시작)') as screen, count(*) as count
        from runs where screen = '/paywall' group by 1 order by 2 desc limit 8
      ) x
    ),
    'after_paywall', (
      select coalesce(json_agg(row_to_json(x) order by x.count desc), '[]'::json) from (
        select coalesce(next_screen, '(앱을 떠남)') as screen, count(*) as count
        from runs where screen = '/paywall' group by 1 order by 2 desc limit 8
      ) x
    ),
    'exits', (
      select coalesce(json_agg(row_to_json(x) order by x.count desc), '[]'::json) from (
        select screen, count(*) as count from runs where next_screen is null group by 1 order by 2 desc limit 10
      ) x
    ),
    'flows', (
      select coalesce(json_agg(row_to_json(x) order by x.count desc), '[]'::json) from (
        select prev_screen as "from", screen as "to", count(*) as count
        from runs where prev_screen is not null group by 1, 2 order by 3 desc limit 15
      ) x
    )
  );
$$;

comment on function admin_funnel is '관리자 결제 흐름 — 단계별 기기 수·결제 화면 진입 이유·상품별 결과·체류·앞뒤 화면·이탈 화면 (이용 기록 동의자만)';

-- ── 가입자 목록 (카카오·Google·Apple 로 가입한 회원, 최근 가입 순) ─────────
-- 운영자(사업자)만 보는 목록이라 이메일은 가리지 않고 전체 주소를 내보낸다.
-- 이 함수는 서버(service_role)만 부를 수 있다 (맨 아래 revoke) — 앱·웹의 공개 키로는 부르지 못한다.
-- 이용 현황(실행·체류·코칭·최근 이용·유입)은 이 회원과 이어진(app_user.user_id) 이용 기록 동의 기기를 모두 합친 값
create or replace function admin_members(p_limit int default 500)
returns json
language sql
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_to_json(r) order by r.created_at desc), '[]'::json) from (
    select m.provider, m.nickname,
           m.email,   -- 운영자 전용 · 전체 주소 (Apple 은 가린 주소일 수 있음)
           m.created_at, m.last_login_at, m.bonus_at is not null as bonus,
           (select count(*) from member_device d where d.user_id = m.user_id) as devices,
           latest.device_id,
           latest.device_id is not null as has_records,
           latest.last_seen_at,
           latest.premium_plan,
           origin.source, origin.source_detail, origin.platform,
           (select count(*) from app_session s join app_user a on a.device_id = s.device_id where a.user_id = m.user_id)              as sessions,
           (select round(coalesce(sum(v.duration_ms), 0) / 1000.0) from screen_view v join app_user a on a.device_id = v.device_id
             where a.user_id = m.user_id)                                                                                           as total_sec,
           (select count(*) from coach_log c join app_user a on a.device_id = c.device_id where a.user_id = m.user_id)                as coach_count
    from member m
    -- 이 회원과 이어진 이용 기록(동의한 기기) 중 가장 최근 것 — 없으면 기기 ID 를 내보내지 않는다 (「기록 보기」는 이 기기)
    left join lateral (
      select a.device_id, a.last_seen_at, a.premium_plan from app_user a where a.user_id = m.user_id order by a.last_seen_at desc limit 1
    ) latest on true
    -- 처음 기록된 기기의 유입 경로 (utm·이전 사이트·설치 경로)
    left join lateral (
      select a.source, a.source_detail, a.platform from app_user a where a.user_id = m.user_id order by a.first_seen_at limit 1
    ) origin on true
    where m.provider is not null
    order by m.created_at desc
    limit greatest(least(p_limit, 2000), 1)
  ) r;
$$;

comment on function admin_members is '관리자 가입자 목록 (가입 방법·닉네임·전체 이메일·가입일·최근 로그인·기기 수·유입·실행/체류/코칭 — 운영자 전용, service_role 만)';

-- ── 관리자 함수는 서버(service_role)만 부를 수 있게 ──────────────────
do $$
begin
  revoke execute on function admin_stats(int), admin_users(int, int), admin_user(text), admin_funnel(int), admin_members(int), delete_device(text), purge_old_records(),
    take_quota(text, int, bigint), member_link(uuid, text, text, text, text), member_delete(uuid), app_user_member() from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function admin_stats(int), admin_users(int, int), admin_user(text), admin_funnel(int), admin_members(int), delete_device(text), purge_old_records(),
      take_quota(text, int, bigint), member_link(uuid, text, text, text, text), member_delete(uuid), app_user_member() from anon, authenticated;
  end if;
end $$;

-- ── 스토어 결제 알림 기록 (App Store 서버 알림·Google Play 실시간 알림 — supabase/store_event.sql 과 같음) ─
-- 이름·이메일·기기 ID 는 없고 Google 구매 토큰은 바꾼 값(해시)만. 1년 지나면 purge_store_event() 가 지운다
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
