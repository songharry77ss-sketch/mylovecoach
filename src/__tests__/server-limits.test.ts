/**
 * api/_limits.ts(빈도 제한의 IP 보관)와 api/coach.ts 의 코칭 기록 한 줄(길이 자르기).
 */
import { coachLogRow } from '../../api/coach';
import { rateLimitEntries, rateLimited, sweepRateLimits } from '../../api/_limits';

describe('빈도 제한', () => {
  it('창이 지난 IP 항목은 1분마다 지워진다 (처리방침 「IP 를 메모리에 잠시 두었다가 지움」)', () => {
    const t0 = 2_000_000_000_000;
    sweepRateLimits(t0);
    expect(rateLimited('coach', '10.0.0.1', 60, 10 * 60 * 1000, t0)).toBe(false);
    expect(rateLimited('track', '10.0.0.2', 60, 5 * 60 * 1000, t0)).toBe(false);
    expect(rateLimitEntries()).toBe(2);
    // 6분 뒤: 5분 창(track)만 지난 상태 — 다음 호출에서 정리된다
    rateLimited('other', '10.0.0.3', 60, 60 * 1000, t0 + 6 * 60 * 1000);
    expect(rateLimitEntries()).toBe(2); // coach(10분 창) + other
    // 12분 뒤: coach 도 창이 지남
    rateLimited('other', '10.0.0.3', 60, 60 * 1000, t0 + 12 * 60 * 1000);
    expect(rateLimitEntries()).toBe(1);
  });

  it('창 안에서 max 번을 넘으면 막는다', () => {
    const t0 = 2_100_000_000_000;
    for (let i = 0; i < 3; i += 1) expect(rateLimited('b', '10.1.1.1', 3, 60_000, t0 + i)).toBe(false);
    expect(rateLimited('b', '10.1.1.1', 3, 60_000, t0 + 10)).toBe(true);
    expect(rateLimited('b', '10.1.1.2', 3, 60_000, t0 + 10)).toBe(false);
  });
});

describe('코칭 기록 한 줄', () => {
  it('글은 정해진 길이로 자르고 추천 답장은 5개까지', () => {
    const row = coachLogRow(
      'd_testdevice01',
      's_session01',
      { crush: { name: '가'.repeat(100), gender: 'female', age: 25.4, mbti: 'ENFP', relationship: 'talking' }, tone: 'natural', text: '나'.repeat(5000) },
      {
        analysis: { temperature: 'warm', interestScore: 71.6, summary: '다'.repeat(900), replies: Array.from({ length: 8 }, () => ({ text: '라'.repeat(500) })), nextStep: '마'.repeat(700) },
        provider: 'gemini',
      },
      1234,
    );
    expect((row.crush_alias as string).length).toBe(40);
    expect((row.question as string).length).toBe(1000);
    expect((row.summary as string).length).toBe(500);
    expect(row.reply_texts as string[]).toHaveLength(5);
    expect((row.reply_texts as string[])[0]).toHaveLength(300);
    expect((row.next_step as string).length).toBe(300);
    expect(row.crush_age).toBe(25);
    expect(row.interest_score).toBe(72);
    expect(row.has_image).toBe(false);
  });

  it('실패한 요청도 오류 문구는 200자까지만', () => {
    const row = coachLogRow('d_testdevice01', undefined, { crush: {}, text: '질문' }, { provider: 'gemini', error: 'x'.repeat(1000) }, 10);
    expect((row.error as string).length).toBe(200);
    expect(row.summary).toBeNull();
    expect(row.session_id).toBeNull();
  });
});
