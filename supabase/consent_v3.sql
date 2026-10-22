-- ════════════════════════════════════════════════════════════════════
--  동의 개편 후속 (2026-10-22) — 이미 schema.sql 을 실행한 운영 DB 에 SQL Editor 로 한 번 실행
--  · delete_device_content: 「코칭 내용 저장」 철회 때 코칭 기록·호감 온도·예전 이름만 지움
--  · 관리자 집계의 코칭 수를 코칭 성공 이벤트(app_event coach_success) 기준으로 — 1.0.4 부터 coach_log 는 내용 저장 동의자만 남기 때문
--  표는 바꾸지 않는다 (schema.sql 에도 같은 정의)
-- ════════════════════════════════════════════════════════════════════

create or replace function delete_device_content(p_device text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from coach_log where device_id = p_device;
  update app_event set props = props - 'temperature'
   where device_id = p_device and name = 'coach_success' and props ? 'temperature';
  update app_user set name = null where device_id = p_device and name is not null;
$$;

comment on function delete_device_content is '기기 하나의 코칭 내용(coach_log·호감 온도·예전 이름)만 삭제 — 코칭 내용 저장 철회';

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
    'coach_requests', (select count(*) from app_event e, span where e.name = 'coach_success' and e.created_at >= span.since),
    'with_image',     (select count(*) from app_event e, span where e.name = 'coach_success' and e.props->>'hasImage' = 'true' and e.created_at >= span.since),
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
        from app_event, span where name = 'coach_success' and created_at >= span.since
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
        select coalesce(props->>'tone', '(없음)') as tone, count(*) as count
        from app_event, span where name = 'coach_success' and created_at >= span.since group by 1 order by 2 desc
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
           (select count(*) from app_event c where c.device_id = u.device_id and c.name = 'coach_success')        as coach_count,
           exists (select 1 from team_member t where t.device_id = u.device_id)                                as is_team,
           m.provider as member_provider, m.nickname as member_nickname, m.created_at as member_since
    from recent u
    left join member m on m.user_id = u.user_id and m.provider is not null
  ) r;
$$;

comment on function admin_users is '관리자 페이지 이용자 목록';

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
      json_build_object('key', 'coach',   'label', '코칭 1회 이상',      'users', (select count(distinct device_id) from ev where name = 'coach_success')),
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
           (select count(*) from app_event c join app_user a on a.device_id = c.device_id where a.user_id = m.user_id and c.name = 'coach_success')                as coach_count
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

do $$
begin
  revoke execute on function delete_device_content(text), admin_stats(int), admin_users(int, int), admin_funnel(int), admin_members(int) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function delete_device_content(text), admin_stats(int), admin_users(int, int), admin_funnel(int), admin_members(int) from anon, authenticated;
  end if;
end $$;
