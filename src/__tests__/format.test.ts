import { isSameDay, relativeTime } from '@/lib/format';

describe('relativeTime', () => {
  const now = new Date('2026-09-17T12:00:00').getTime();
  it('formats recent times in Korean', () => {
    expect(relativeTime(now - 10_000, now)).toBe('방금 전');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5분 전');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3시간 전');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2일 전');
  });
  it('falls back to a date after a week', () => {
    expect(relativeTime(now - 10 * 86_400_000, now)).toBe('9월 7일');
  });
});

describe('isSameDay', () => {
  it('compares calendar days', () => {
    const a = new Date('2026-09-17T01:00:00').getTime();
    const b = new Date('2026-09-17T23:00:00').getTime();
    const c = new Date('2026-09-18T00:30:00').getTime();
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(b, c)).toBe(false);
  });
});

describe('캡처 파일 이름에서 만든 시각 읽기', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createdAtOf } = require('@/lib/images') as typeof import('@/lib/images');
  it('createId 로 만든 이름이면 시각을, 아니면 null', () => {
    const t = new Date(2026, 9, 5, 12).getTime();
    expect(createdAtOf(`file:///data/screenshots/img_${t.toString(36)}abc123.jpg`)).toBe(t);
    expect(createdAtOf('file:///data/screenshots/other.jpg')).toBeNull();
  });
});
