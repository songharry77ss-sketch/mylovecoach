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

-- ── 회원 (카카오·Apple 로그인, Supabase Auth 의 auth.users 와 같은 id) ──
create table if not exists member (
  user_id       uuid primary key,
  provider      text,                        -- kakao · apple
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

-- 처음 기록되는 기기가 이미 회원과 이어진 기기면(가입 뒤에 이용 기록을 켠 경우) 그 회원으로 표시
create or replace function app_user_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    select user_id into new.user_id from member
     where device_id = new.device_id and provider is not null
     order by last_login_at desc limit 1;
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

  -- 이 기기의 이용 기록을 회원과 잇는다. 이미 다른 회원과 이어진 기기는 건드리지 않는다
  if p_device is not null then
    update app_user set user_id = p_user where device_id = p_device and (user_id is null or user_id = p_user);
  end if;

  select * into m from member where user_id = p_user;
  return json_build_object('new', v_new, 'bonus', v_bonus, 'provider', m.provider, 'nickname', m.nickname, 'created_at', m.created_at);
end $$;

-- 회원 탈퇴: 회원 기록과, 이 회원과 이어진 기기들의 이용 기록을 지운다 (로그인 계정은 서버가 Auth API 로 지움).
-- 앱이 알려 준 기기 ID(member.device_id) 만으로는 지우지 않는다 — 서버에서 이 회원과 이어진 기기만.
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
  delete from member where user_id = p_user;
end $$;

-- ── 관리자 로그인 시도 (비밀번호 대입 방지, 성공하면 그 IP 기록은 지움) ─
create table if not exists admin_auth_fail (
  id         bigserial primary key,
  ip         text,
  created_at timestamptz not null default now()
);
create index if not exists admin_auth_fail_created_idx on admin_auth_fail (created_at desc);

-- ── 잠금: 공개 키(anon)로는 아무것도 못 읽고 못 씁니다 ────────────────
alter table app_user        enable row level security;
alter table app_session     enable row level security;
alter table screen_view     enable row level security;
alter table coach_log       enable row level security;
alter table app_event       enable row level security;
alter table team_member     enable row level security;
alter table admin_auth_fail enable row level security;
alter table member          enable row level security;
alter table bonus_spent     enable row level security;

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
  with recent as (
    select * from app_user
    where last_seen_at >= now() - make_interval(days => greatest(p_days, 1))
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

comment on function delete_device is '기기 ID 하나의 이용 기록 삭제 (DELETE /api/track, 관리자 기록 삭제)';

-- ── 1년 지난 이용 기록 파기 (처리방침 4번 「수집일로부터 1년이 지나면 파기」) ─
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
  delete from admin_auth_fail where created_at   < now() - interval '30 days';
$$;

comment on function purge_old_records is '1년 지난 이용 기록·탈퇴 1년 지난 보너스 기기·30일 지난 관리자 로그인 시도 파기 (pg_cron 매일 03:30 KST)';

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

-- ── 관리자 함수는 서버(service_role)만 부를 수 있게 ──────────────────
do $$
begin
  revoke execute on function admin_stats(int), admin_users(int, int), admin_user(text), delete_device(text), purge_old_records(),
    member_link(uuid, text, text, text, text), member_delete(uuid), app_user_member() from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function admin_stats(int), admin_users(int, int), admin_user(text), delete_device(text), purge_old_records(),
      member_link(uuid, text, text, text, text), member_delete(uuid), app_user_member() from anon, authenticated;
  end if;
end $$;
