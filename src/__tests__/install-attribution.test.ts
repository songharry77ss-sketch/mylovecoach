import {
  ATTRIBUTION_GIVE_UP_MS,
  checkInstallAttribution,
  lookupInstallAttribution,
  parsePlayReferrer,
  resolveAppleAdsToken,
  type AttributionOutcome,
} from '@/lib/install-attribution';
import { useAppStore } from '@/store/app-store';

import { lateAttribution } from '../../api/track';

// 테스트 환경에는 기기 저장소 네이티브 모듈이 없어 메모리로 대신한다
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

describe('Play 설치 경로 해석', () => {
  it('구글 광고 클릭(gclid·gbraid·wbraid)이면 google-ads / cpc', () => {
    expect(parsePlayReferrer('gclid=Cj0KCQabc&utm_campaign=sendit_kr')).toEqual({ source: 'google-ads', medium: 'cpc', campaign: 'sendit_kr' });
    expect(parsePlayReferrer('gbraid=0AAAAA')).toEqual({ source: 'google-ads', medium: 'cpc' });
    expect(parsePlayReferrer('utm_source=google&utm_medium=cpc&wbraid=x')).toEqual({ source: 'google-ads', medium: 'cpc' });
  });

  it('/go 홍보 링크는 utm 값을 그대로 쓴다', () => {
    expect(parsePlayReferrer('utm_source=go-insta&utm_medium=community&utm_campaign=promo')).toEqual({ source: 'go-insta', medium: 'community', campaign: 'promo' });
  });

  it('한 번 더 인코딩된 값과 + 공백도 읽는다', () => {
    expect(parsePlayReferrer('utm_source%3Dgo-x%26utm_medium%3Dcommunity')).toEqual({ source: 'go-x', medium: 'community' });
    expect(parsePlayReferrer('utm_source=go-x&utm_campaign=a+b')).toEqual({ source: 'go-x', campaign: 'a b' });
  });

  it('Play 자연 설치·빈 값은 덧붙이지 않는다', () => {
    expect(parsePlayReferrer('utm_source=google-play&utm_medium=organic')).toBeNull();
    expect(parsePlayReferrer('utm_source=(not%20set)&utm_medium=(not%20set)')).toBeNull();
    expect(parsePlayReferrer('')).toBeNull();
    expect(parsePlayReferrer(null)).toBeNull();
  });

  it('긴 값은 80자로 자른다', () => {
    expect(parsePlayReferrer(`utm_source=${'a'.repeat(200)}`)?.source).toHaveLength(80);
  });
});

describe('애플 광고 귀속', () => {
  const ok = (body: unknown) => ({ status: 200, json: async () => body });
  const noWait = async () => {};

  it('광고 설치면 캠페인·광고그룹·키워드 번호를 돌려준다', async () => {
    const fetchImpl = jest.fn(async () => ok({ attribution: true, orgId: 1, campaignId: 2145162950, adGroupId: 77, keywordId: 88, conversionType: 'Download' }));
    await expect(resolveAppleAdsToken('tok', { fetchImpl, wait: noWait })).resolves.toEqual({
      kind: 'found',
      fields: { source: 'apple-ads', medium: 'search', campaign: '2145162950', content: '77', term: '88' },
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://api-adservices.apple.com/api/v1/', expect.objectContaining({ method: 'POST', body: 'tok' }));
  });

  it('광고 설치가 아니면 none', async () => {
    await expect(resolveAppleAdsToken('tok', { fetchImpl: async () => ok({ attribution: false }), wait: noWait })).resolves.toEqual({ kind: 'none' });
  });

  it('기록이 아직 없으면(404) 기다렸다 다시 묻는다', async () => {
    const replies = [{ status: 404, json: async () => ({}) }, ok({ attribution: true, campaignId: 1 })];
    const wait = jest.fn(noWait);
    const outcome = await resolveAppleAdsToken('tok', { fetchImpl: async () => replies.shift()!, wait });
    expect(outcome).toEqual({ kind: 'found', fields: { source: 'apple-ads', medium: 'search', campaign: '1' } });
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('세 번 다 404·서버 오류·네트워크 오류면 다음 실행에 다시', async () => {
    await expect(resolveAppleAdsToken('tok', { fetchImpl: async () => ({ status: 404, json: async () => ({}) }), wait: noWait })).resolves.toEqual({ kind: 'retry' });
    await expect(resolveAppleAdsToken('tok', { fetchImpl: async () => ({ status: 500, json: async () => ({}) }), wait: noWait })).resolves.toEqual({ kind: 'retry' });
    await expect(
      resolveAppleAdsToken('tok', {
        fetchImpl: async () => {
          throw new Error('offline');
        },
        wait: noWait,
      }),
    ).resolves.toEqual({ kind: 'retry' });
  });
});

describe('플랫폼별 확인', () => {
  const native = (over: Partial<{ getInstallReferrer: () => Promise<unknown>; getAppleAdsToken: () => Promise<string | null> }>) =>
    ({ getInstallReferrer: async () => null, getAppleAdsToken: async () => null, ...over }) as never;

  it('안드로이드: 구글 광고 설치를 찾는다', async () => {
    const outcome = await lookupInstallAttribution('android', native({ getInstallReferrer: async () => ({ referrer: 'gclid=x', clickTs: 1, installTs: 2 }) }));
    expect(outcome).toEqual({ kind: 'found', fields: { source: 'google-ads', medium: 'cpc' } });
  });

  it('안드로이드: 지원하지 않는 기기는 none, 잠깐의 오류는 retry, 모듈 없는 빌드는 none', async () => {
    const fail = (msg: string) => native({ getInstallReferrer: async () => Promise.reject(new Error(msg)) });
    await expect(lookupInstallAttribution('android', fail('referrer_unavailable:2'))).resolves.toEqual({ kind: 'none' });
    await expect(lookupInstallAttribution('android', fail('referrer_timeout'))).resolves.toEqual({ kind: 'retry' });
    await expect(lookupInstallAttribution('android', native({}))).resolves.toEqual({ kind: 'none' });
  });

  it('아이폰: 토큰을 애플에 묻고, 지원하지 않는 기기는 none', async () => {
    const resolve = jest.fn(async (): Promise<AttributionOutcome> => ({ kind: 'none' }));
    await lookupInstallAttribution('ios', native({ getAppleAdsToken: async () => 'tok' }), resolve);
    expect(resolve).toHaveBeenCalledWith('tok');
    const unsupported = native({ getAppleAdsToken: async () => Promise.reject(new Error('token_unavailable:unsupported')) });
    await expect(lookupInstallAttribution('ios', unsupported, resolve)).resolves.toEqual({ kind: 'none' });
    const flaky = native({ getAppleAdsToken: async () => Promise.reject(new Error('token_unavailable:3')) });
    await expect(lookupInstallAttribution('ios', flaky, resolve)).resolves.toEqual({ kind: 'retry' });
  });
});

describe('처음 실행 때 한 번 확인', () => {
  const now = 1_800_000_000_000;
  beforeEach(() => useAppStore.setState({ acquisition: { channel: 'ios', at: now - 1000 }, attributionCheckedAt: null }));

  it('광고 유입이면 유입 정보에 덧붙이고 다시 보지 않는다', async () => {
    await checkInstallAttribution(now, async () => ({ kind: 'found', fields: { source: 'apple-ads', medium: 'search', campaign: '9' } }));
    expect(useAppStore.getState().acquisition).toEqual({ channel: 'ios', at: now - 1000, source: 'apple-ads', medium: 'search', campaign: '9' });
    expect(useAppStore.getState().attributionCheckedAt).toBe(now);
    const lookup = jest.fn(async (): Promise<AttributionOutcome> => ({ kind: 'none' }));
    await checkInstallAttribution(now + 1, lookup);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('광고 유입이 아니면 유입 정보는 그대로, 확인만 표시', async () => {
    await checkInstallAttribution(now, async () => ({ kind: 'none' }));
    expect(useAppStore.getState().acquisition).toEqual({ channel: 'ios', at: now - 1000 });
    expect(useAppStore.getState().attributionCheckedAt).toBe(now);
  });

  it('잠깐의 오류면 다음 실행에 다시, 7일이 지나면 그만', async () => {
    await checkInstallAttribution(now, async () => ({ kind: 'retry' }));
    expect(useAppStore.getState().attributionCheckedAt).toBeNull();
    useAppStore.setState({ acquisition: { channel: 'ios', at: now - ATTRIBUTION_GIVE_UP_MS - 1 } });
    await checkInstallAttribution(now, async () => ({ kind: 'retry' }));
    expect(useAppStore.getState().attributionCheckedAt).toBe(now);
  });
});

describe('서버: 설치 뒤에 알게 된 광고 유입', () => {
  it('앱이 알아낸 광고·링크 유입만 덧쓴다', () => {
    expect(lateAttribution({ channel: 'android', source: 'google-ads' })).toBe(true);
    expect(lateAttribution({ channel: 'ios', source: 'apple-ads' })).toBe(true);
    expect(lateAttribution({ channel: 'web', source: 'insta' })).toBe(false);
    expect(lateAttribution({ channel: 'android' })).toBe(false);
    expect(lateAttribution({ channel: 'ios', source: 'ios' })).toBe(false);
    expect(lateAttribution(null)).toBe(false);
  });
});
