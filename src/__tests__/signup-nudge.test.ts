import { SIGNUP_NUDGE_SNOOZE_MS, shouldShowSignupNudge, type SignupNudgeInput } from '@/lib/signup-nudge';

const base: SignupNudgeInput = { authAvailable: true, isMember: false, secret: false, analyzed: 1, sending: false, dismissedAt: null, platform: 'android', now: 1_800_000_000_000 };

describe('대화방 가입 권유 카드', () => {
  it('비회원이 첫 답장을 받으면 바로 보여 준다', () => {
    expect(shouldShowSignupNudge(base)).toBe(true);
    expect(shouldShowSignupNudge({ ...base, platform: 'ios' })).toBe(true);
  });

  it('답장 전·답장 받는 중·회원·비밀 대화방·웹·가입을 못 쓰는 빌드는 보이지 않는다', () => {
    expect(shouldShowSignupNudge({ ...base, analyzed: 0 })).toBe(false);
    expect(shouldShowSignupNudge({ ...base, sending: true })).toBe(false);
    expect(shouldShowSignupNudge({ ...base, isMember: true })).toBe(false);
    expect(shouldShowSignupNudge({ ...base, secret: true })).toBe(false);
    expect(shouldShowSignupNudge({ ...base, platform: 'web' })).toBe(false);
    expect(shouldShowSignupNudge({ ...base, authAvailable: false })).toBe(false);
  });

  it('닫으면 3일 동안 다시 안 뜬다', () => {
    expect(shouldShowSignupNudge({ ...base, dismissedAt: base.now - 1000 })).toBe(false);
    expect(shouldShowSignupNudge({ ...base, dismissedAt: base.now - SIGNUP_NUDGE_SNOOZE_MS })).toBe(true);
  });
});
