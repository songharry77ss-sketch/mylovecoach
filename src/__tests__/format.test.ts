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
