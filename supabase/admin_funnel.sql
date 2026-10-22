-- ════════════════════════════════════════════════════════════════════
--  관리자 「결제 흐름」·「가입자 목록」 (2026-10-20, 가입자 목록 열 추가 2026-10-21)
--
--  이미 schema.sql 을 실행한 DB 에는 이 파일만 SQL Editor 에서 한 번 실행하면 됩니다.
--  (schema.sql 에도 같은 함수가 들어 있어 새로 만드는 DB 는 schema.sql 하나로 충분)
--  표는 새로 만들지 않고, 이미 쌓인 기록(app_event·screen_view·coach_log·member)을 읽기만 합니다.
--  10-21 이전에 실행했어도 한 번 더 실행하면 가입자 목록에 전체 이메일·유입·실행/체류/코칭이 나옵니다 (함수만 바뀜).
-- ════════════════════════════════════════════════════════════════════

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

-- ── 서버(service_role)만 부를 수 있게 ──────────────────────────────
do $$
begin
  revoke execute on function admin_funnel(int), admin_members(int) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function admin_funnel(int), admin_members(int) from anon, authenticated;
  end if;
end $$;
