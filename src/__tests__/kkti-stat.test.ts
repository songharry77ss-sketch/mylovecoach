/**
 * lib/kkti-stat.ts — 웹은 동의와 관계없이 숫자만 세고, 앱은 이용 기록에 동의한 사람만 센다 (스토어 개인정보 신고와 맞춤).
 */
import { Platform } from 'react-native';

import { countKkti } from '@/lib/kkti-stat';

let mockConsented = false;
jest.mock('@/lib/analytics', () => ({ analyticsEnabled: () => mockConsented }));
jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://api.example', apiSameOrigin: false, apiToken: 'tok', supportEmail: '', privacyUrl: '', termsUrl: '' },
}));

const calls: { url: string; body: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  mockConsented = false;
  global.fetch = jest.fn(async (url: string, init: { body?: string } = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return { ok: true, status: 204 };
  }) as unknown as typeof fetch;
});

describe('countKkti', () => {
  it('웹은 동의하지 않아도 이벤트 이름만 보낸다', () => {
    Platform.OS = 'web';
    countKkti('complete');
    expect(calls).toEqual([{ url: 'https://api.example/api/kkti-stat', body: { event: 'complete' } }]);
  });

  it.each(['ios', 'android'] as const)('%s 앱은 이용 기록에 동의하지 않았으면 보내지 않는다', (os) => {
    Platform.OS = os;
    countKkti('start');
    expect(calls).toHaveLength(0);
    mockConsented = true;
    countKkti('start');
    expect(calls).toEqual([{ url: 'https://api.example/api/kkti-stat', body: { event: 'start' } }]);
  });
});
