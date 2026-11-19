/**
 * 대화방 「가입하고 무료 코칭 더 받기」 카드 — 가입자를 늘리는 가장 좋은 순간은 첫 답장을 받아 본 바로 뒤다.
 * 예전에는 무료 맛보기를 다 써서 결제 화면이 떠야만 가입을 권했다 (11-19 기준 14일 새 기기 62대 중 가입 6명).
 * 닫으면 3일 동안 다시 안 뜬다. 웹은 대화방이 아니라 「답장 더 보기」에서 가입으로 보내므로 앱만.
 */
export const SIGNUP_NUDGE_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export interface SignupNudgeInput {
  /** 이 빌드에서 가입(로그인)을 쓸 수 있는지 */
  authAvailable: boolean;
  isMember: boolean;
  /** 비밀 대화방 — 기록을 남기지 않는 방이라 가입 권유도 하지 않는다 */
  secret: boolean;
  /** 이 대화방에서 코칭 결과를 받은 수 */
  analyzed: number;
  sending: boolean;
  dismissedAt: number | null;
  platform: string;
  now: number;
}

export function shouldShowSignupNudge(i: SignupNudgeInput): boolean {
  if (!i.authAvailable || i.isMember || i.secret || i.sending || i.platform === 'web') return false;
  if (i.analyzed < 1) return false;
  return i.dismissedAt == null || i.now - i.dismissedAt >= SIGNUP_NUDGE_SNOOZE_MS;
}
