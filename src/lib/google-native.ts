/**
 * 앱 안 Google 로그인 (계정 선택 창) — 안드로이드 전용. 실제 구현은 google-native.android.ts.
 * 웹·아이폰은 이 파일을 쓰고 늘 「쓸 수 없음」을 돌려줘 브라우저 로그인으로 간다.
 */

export type NativeGoogleResult =
  | { status: 'success'; idToken: string }
  | { status: 'cancelled' }
  /** 쓸 수 없음 — 브라우저 로그인으로 넘어간다. reason 은 원인 파악용(이용 기록) */
  | { status: 'unavailable'; reason: string };

export async function nativeGoogleSignIn(): Promise<NativeGoogleResult> {
  return { status: 'unavailable', reason: 'platform' };
}

/** 로그아웃할 때 기기에 남은 Google 계정 선택을 지운다 (다음 로그인에 다른 계정을 고를 수 있게) */
export async function nativeGoogleSignOut(): Promise<void> {}
