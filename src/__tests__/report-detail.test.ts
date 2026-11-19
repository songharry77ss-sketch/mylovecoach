import { ageBand, barLines, detailSections, fmtDuration, genderLabel, revenueTotalLines, sessionStats, sourceLabel, tally, type DeviceRow } from '../../api/_report-detail';
import { reportMessage } from '../../api/daily-report';

const dev = (over: Partial<DeviceRow>): DeviceRow => ({ device_id: 'd', platform: 'ios', source: 'ios', source_detail: { channel: 'ios' }, gender: null, age: null, user_id: null, ...over });

describe('리포트 상세 — 이름 붙이기', () => {
  it('들어온 경로', () => {
    expect(sourceLabel(dev({ source_detail: { channel: 'android', source: 'google-ads' } }))).toBe('구글 광고');
    expect(sourceLabel(dev({ source_detail: { channel: 'ios', source: 'apple-ads' } }))).toBe('애플 검색 광고');
    expect(sourceLabel(dev({ source_detail: { channel: 'android', source: 'go-insta' } }))).toBe('홍보 링크 insta');
    expect(sourceLabel(dev({ platform: 'web', source_detail: { channel: 'web', referrer: 'm.search.naver.com' } }))).toBe('m.search.naver.com 에서');
    expect(sourceLabel(dev({}))).toBe('앱스토어 (광고 아님)');
    expect(sourceLabel(dev({ platform: 'android', source_detail: null }))).toBe('Play 스토어 (광고 아님)');
  });

  it('나이·성별', () => {
    expect([genderLabel('female'), genderLabel('male'), genderLabel('other'), genderLabel(null)]).toEqual(['여', '남', '선택 안 함', '선택 안 함']);
    expect([ageBand(17), ageBand(22), ageBand(27), ageBand(33), ageBand(45), ageBand(null), ageBand(0)]).toEqual(['10대', '20대 초반', '20대 후반', '30대', '40대 이상', '미입력', '미입력']);
  });

  it('체류 시간 표시', () => {
    expect([fmtDuration(42_000), fmtDuration(192_000), fmtDuration(3_900_000), fmtDuration(null)]).toEqual(['42초', '3분 12초', '1시간 5분', '확인 못 함']);
  });
});

describe('리포트 상세 — 세기', () => {
  it('막대는 많은 순으로 비율까지', () => {
    const lines = barLines(tally([dev({}), dev({}), dev({ platform: 'android' })], (r) => r.platform ?? ''), '대');
    expect(lines[0]).toMatch(/^ · ios ▇{8} 2대 \(67%\)$/);
    expect(lines[1]).toMatch(/^ · android ▇{4} 1대 \(33%\)$/);
    expect(barLines([], '대')).toEqual([' · 없음']);
  });

  it('세션은 0초·3시간 넘는 것을 빼고 평균·중간값·기기당 시간을 낸다', () => {
    const s = sessionStats([
      { device_id: 'a', platform: 'ios', duration_ms: 60_000 },
      { device_id: 'a', platform: 'ios', duration_ms: 120_000 },
      { device_id: 'b', platform: 'android', duration_ms: '300000' },
      { device_id: 'c', platform: 'android', duration_ms: 0 },
      { device_id: 'd', platform: 'android', duration_ms: 5 * 60 * 60 * 1000 },
    ]);
    expect(s).toMatchObject({ sessions: 3, devices: 2, avgMs: 160_000, medianMs: 120_000, perDeviceMs: 240_000 });
    expect(s.byPlatform).toEqual([
      ['아이폰', { sessions: 2, avgMs: 90_000 }],
      ['갤럭시(안드로이드)', { sessions: 1, avgMs: 300_000 }],
    ]);
  });
});

describe('리포트 상세 — 문단', () => {
  const monthStart = new Date('2026-11-01T00:00:00+09:00');
  const allSales = [
    { store: 'google' as const, kind: 'purchase', amount: 2700, currency: 'KRW', created_at: '2026-10-31T11:31:00Z' },
    { store: 'apple' as const, kind: 'purchase', amount: 3900, currency: 'KRW', created_at: '2026-11-17T09:09:00Z' },
    { store: 'apple' as const, kind: 'purchase', amount: 2900, currency: 'KRW', created_at: '2026-11-18T07:33:00Z' },
  ];

  it('이번 달·누적 매출과 스토어별', () => {
    const text = revenueTotalLines({ allSales, monthStart }).join('\n');
    expect(text).toContain('이번 달 ₩6,800 (2건)');
    expect(text).toContain('<b>누적 ₩9,500</b> (3건)');
    expect(text).toContain('iOS ₩6,800 (2건) · Android ₩2,700 (1건)');
  });

  it('기기·경로·나이·성별·체류 시간이 다 들어간다', () => {
    const newDevices = [
      dev({ device_id: '1', gender: 'female', age: 23, user_id: 'u1' }),
      dev({ device_id: '2', platform: 'android', source_detail: { channel: 'android', source: 'google-ads' }, gender: 'male', age: 27 }),
      dev({ device_id: '3', platform: 'android', source_detail: { channel: 'android' } }),
    ];
    const text = detailSections({ allSales, monthStart, newDevices, memberDevices: [newDevices[0]], sessions: [{ device_id: '1', platform: 'ios', duration_ms: 200_000 }] }).join('\n');
    expect(text).toContain('어제 새 기기 3대 → 그중 가입 1명 (33%)');
    expect(text).toContain('갤럭시(안드로이드) ▇▇▇▇▇▇▇▇ 2대 (67%)');
    expect(text).toContain('구글 광고');
    expect(text).toContain('누적 회원(앱 기록이 있는 1명): 아이폰 1명');
    expect(text).toMatch(/성별 .*여 1/);
    expect(text).toMatch(/나이 20대 초반 1 · 20대 후반 1 · 미입력 1/);
    expect(text).toContain('한 번에 평균 3분 20초');
  });

  it('읽지 못한 칸은 「확인 못 함」으로', () => {
    const text = detailSections({ allSales: null, monthStart, newDevices: null, memberDevices: null, sessions: null }).join('\n');
    expect(text).toContain('어제 새 기기 확인 못 함');
    expect(text).toContain('확인 못 함');
    expect(revenueTotalLines({ allSales: null, monthStart })).toEqual([' · 누적 매출 확인 못 함']);
  });

  it('일일 리포트에 매출 아래 누적, 맨 아래 상세가 붙는다', () => {
    const text = reportMessage({
      day: '11/19',
      newMembers: 1,
      members: [],
      totalMembers: 26,
      sales: [],
      launches: 40,
      coaching: 20,
      paywall: 5,
      checkout: 1,
      detail: { allSales, monthStart, newDevices: [], memberDevices: [], sessions: [] },
    });
    expect(text.indexOf('누적 ₩9,500')).toBeGreaterThan(text.indexOf('💰 매출'));
    expect(text.indexOf('⏱️')).toBeGreaterThan(text.indexOf('📱 이용'));
  });
});
