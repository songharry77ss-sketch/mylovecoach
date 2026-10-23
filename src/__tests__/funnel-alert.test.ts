/**
 * api/_funnel-alert.ts — 결제 화면 열림·결제 진행 텔레그램 알림.
 * 문구(escape 포함), 알릴 이벤트 고르기(모드·닫기만), 쿨다운·시간당 상한, /api/track 연동(저장 뒤에만, 텔레그램 없으면 조회 없음).
 */
import { alertEvents, eventLine, funnelMessage, HOURLY_CAP, PAYWALL_COOLDOWN_MS, resetFunnelAlertState, shouldAlert, type AlertContext } from '../../api/_funnel-alert';
import handler from '../../api/track';

const ctx = (extra: Partial<AlertContext> = {}): AlertContext => ({
  platform: 'ios',
  appVersion: '1.0.4',
  premiumPlan: null,
  member: null,
  source: 'instagram',
  coachCount: 3,
  paywallOpens: 2,
  ...extra,
});

beforeEach(() => {
  resetFunnelAlertState();
  delete process.env.FUNNEL_ALERTS;
});

describe('문구', () => {
  it('결제 화면 열림 — 들어온 곳·기기·유입·횟수', () => {
    const text = funnelMessage([{ name: 'paywall_open', props: { reason: 'quota' } }], ctx());
    expect(text).toContain('👀 결제 화면 열림');
    expect(text).toContain('무료 횟수를 다 써서');
    expect(text).toContain('👤 비회원');
    expect(text).toContain('📱 iOS 앱 1.0.4 · 🧭 유입: instagram');
    expect(text).toContain('📊 코칭 3회 · 결제 화면 2번째');
  });

  it('결제 완료가 있으면 제목이 결제 완료, 회원 닉네임·이메일·가입 방법', () => {
    const text = funnelMessage(
      [
        { name: 'paywall_open', props: { reason: 'my' } },
        { name: 'purchase_start', props: { plan: 'day' } },
        { name: 'purchase_granted', props: { plan: 'day' } },
      ],
      ctx({ member: { nickname: '하리', email: 'a@b.com', provider: 'kakao' } }),
    );
    expect(text.split('\n')[0]).toBe('💰 결제 완료 (앱 보고)');
    expect(text).toContain('🛒 결제창 진입 · 하루 이용권');
    expect(text).toContain('✅ 앱에서 결제 완료 · 하루 이용권');
    expect(text).toContain('👤 하리 · a@b.com (카카오)');
  });

  it('이용자가 보낸 값은 HTML 로 해석되지 않게 escape 한다', () => {
    const text = funnelMessage(
      [{ name: 'purchase_error', props: { plan: '<b>x</b>', message: '<a href="x">오류</a>' } }],
      ctx({ member: { nickname: '<script>', email: null, provider: null }, source: '<i>s</i>' }),
    );
    expect(text).not.toMatch(/<(b|a|i|script)[\s>]/);
    expect(text).toContain('&lt;script&gt;');
    expect(text.split('\n')[0]).toBe('⚠️ 결제 오류');
  });

  it('닫기 줄 — 머문 시간·직접 골라 봤는지', () => {
    expect(eventLine({ name: 'paywall_close', props: { sec: 7.4, picked: true } })).toBe('🚪 결제 없이 닫음 · 7초 머묾 · 상품을 직접 골라 봄');
    expect(eventLine({ name: 'app_download_click', props: { store: 'android' } })).toBe('📲 앱 받기 누름 · Google Play');
    expect(eventLine({ name: 'screen_unknown', props: null })).toBeNull();
  });
});

describe('알릴 이벤트 고르기', () => {
  const open = { name: 'paywall_open', props: { reason: 'my' } };
  const close = { name: 'paywall_close', props: { sec: 3 } };
  const start = { name: 'purchase_start', props: { plan: 'day' } };
  const other = { name: 'coach_success', props: null };

  it('결제와 관계없는 이벤트·닫기만 있는 묶음은 알리지 않는다', () => {
    expect(alertEvents([other])).toEqual([]);
    expect(alertEvents([close, other])).toEqual([]);
    expect(alertEvents([open, close, other])).toEqual([open, close]);
  });

  it('FUNNEL_ALERTS=off 면 없음, purchase 면 결제창 진입·결과만', () => {
    expect(alertEvents([open, start], 'off')).toEqual([]);
    expect(alertEvents([open, close], 'purchase')).toEqual([]);
    expect(alertEvents([open, start, close], 'purchase')).toEqual([start, close]);
  });
});

describe('쿨다운·상한', () => {
  const open = [{ name: 'paywall_open', props: { reason: 'my' } }];
  const start = [{ name: 'purchase_start', props: { plan: 'day' } }];

  it('결제 화면만 연 것은 같은 기기에서 10분에 한 번, 결제 진행은 늘', () => {
    const t = 1_800_000_000_000;
    expect(shouldAlert('d_a', open, t)).toBe(true);
    expect(shouldAlert('d_a', open, t + 60_000)).toBe(false);
    expect(shouldAlert('d_b', open, t + 60_000)).toBe(true);
    expect(shouldAlert('d_a', start, t + 61_000)).toBe(true);
    expect(shouldAlert('d_a', open, t + 61_000 + PAYWALL_COOLDOWN_MS)).toBe(true);
    expect(shouldAlert('d_a', [], t)).toBe(false);
  });

  it('한 시간에 상한까지만 보낸다', () => {
    const t = 1_800_000_000_000;
    for (let i = 0; i < HOURLY_CAP; i += 1) expect(shouldAlert(`d_${i}`, start, t + i)).toBe(true);
    expect(shouldAlert('d_over', start, t + HOURLY_CAP)).toBe(false);
    expect(shouldAlert('d_over', start, t + 60 * 60 * 1000 + 1)).toBe(true);
  });
});

describe('/api/track 연동', () => {
  const calls: { url: string; method: string; body?: string }[] = [];
  let ip = 0;
  const req = (body: unknown) => {
    ip += 1;
    return { method: 'POST', body, query: {}, headers: { 'x-forwarded-for': `10.9.0.${ip}` } } as never;
  };
  const res = () => {
    const r = { statusCode: 200 } as { statusCode: number; setHeader: () => unknown; status: (c: number) => unknown; json: () => unknown; end: () => unknown };
    r.setHeader = () => r;
    r.status = (c: number) => {
      r.statusCode = c;
      return r;
    };
    r.json = () => r;
    r.end = () => r;
    return r;
  };
  const body = (events: unknown[], extra: Record<string, unknown> = {}) => ({ deviceId: 'd_funnel0001', sessionId: 's_funnel01', consentVersion: 3, platform: 'android', appVersion: '1.0.4', events, ...extra });

  beforeEach(() => {
    calls.length = 0;
    process.env.SUPABASE_URL = 'https://db.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.ANALYTICS_ENABLED = '1';
    delete process.env.COACH_APP_TOKEN;
    delete process.env.ANALYTICS_OPTOUT_DEVICES;
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_CHAT_ID = '42';
    global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => {
      const u = String(url);
      calls.push({ url: u, method: init.method ?? 'GET', body: init.body });
      if (u.includes('/rpc/take_quota')) return new Response('true', { status: 200 });
      if (u.includes('/rest/v1/app_user?select=user_id')) return new Response(JSON.stringify([{ user_id: 'u1', source: 'naver', source_detail: { medium: 'blog' } }]), { status: 200 });
      if (u.includes('/rest/v1/member?select=nickname')) return new Response(JSON.stringify([{ nickname: '민지', email: 'm@j.kr', provider: 'google' }]), { status: 200 });
      if (init.method === 'HEAD' || (init.headers && JSON.stringify(init.headers).includes('count=exact'))) return new Response(null, { status: 200, headers: { 'content-range': '0-0/5' } });
      if (u.startsWith('https://api.telegram.org/')) return new Response('{}', { status: 200 });
      return new Response(null, { status: 201 });
    }) as never;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  const telegramBodies = () => calls.filter((c) => c.url.startsWith('https://api.telegram.org/')).map((c) => JSON.parse(c.body ?? '{}').text as string);

  it('결제 화면 열림을 저장한 뒤 회원·유입을 붙여 한 통 보낸다', async () => {
    const r = res();
    await handler(req(body([{ type: 'event', name: 'paywall_open', props: { reason: 'regenerate' } }])), r as never);
    expect(r.statusCode).toBe(204);
    const sent = telegramBodies();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('다른 답장 더 보기에서');
    expect(sent[0]).toContain('👤 민지 · m@j.kr (Google)');
    expect(sent[0]).toContain('📱 Android 앱 1.0.4 · 🧭 유입: naver · blog');
    // 저장이 알림보다 먼저
    const insertAt = calls.findIndex((c) => c.url.includes('/rest/v1/app_event') && c.method === 'POST');
    const sendAt = calls.findIndex((c) => c.url.startsWith('https://api.telegram.org/'));
    expect(insertAt).toBeGreaterThanOrEqual(0);
    expect(sendAt).toBeGreaterThan(insertAt);
  });

  it('결제와 관계없는 이벤트만 오면 조회·전송하지 않는다', async () => {
    await handler(req(body([{ type: 'event', name: 'coach_success', props: { tone: 'warm' } }])), res() as never);
    expect(telegramBodies()).toHaveLength(0);
    expect(calls.some((c) => c.url.includes('select=user_id'))).toBe(false);
  });

  it('저장하지 않는 기록(수집 판 미달·만 14세 미만)은 알리지 않는다', async () => {
    await handler(req(body([{ type: 'event', name: 'purchase_start', props: { plan: 'day' } }], { consentVersion: null })), res() as never);
    await handler(req(body([{ type: 'event', name: 'purchase_start', props: { plan: 'day' } }], { user: { age: 12 } })), res() as never);
    expect(telegramBodies()).toHaveLength(0);
  });

  it('텔레그램을 설정하지 않았으면 아무것도 읽지 않는다', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await handler(req(body([{ type: 'event', name: 'purchase_start', props: { plan: 'day' } }])), res() as never);
    expect(calls.some((c) => c.url.includes('select=user_id') || c.url.startsWith('https://api.telegram.org/'))).toBe(false);
  });
});
