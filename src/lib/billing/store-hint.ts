import { L } from '@/lib/i18n';

/**
 * 다시 불러와도 풀리지 않는 스토어 상태를, 사람이 할 수 있는 조치로 바꾼다 (Google Play 결제 응답 코드 기준).
 * - -2 기능 미지원: 휴대폰의 스토어 앱이 오래돼서 상품 조회를 못 한다.
 *   2026-11-20 04시 안드로이드 1.3.3 기기 하나가 결제 화면을 세 번 열었는데, 매번 -2 로 막혔다.
 *   그때 「잠시 후 다시 시도」만 안내했다.
 * - 3 결제 사용 불가: 스토어 로그인·업데이트·국가 문제.
 * 잠깐의 오류(-1·2·12)는 다시 물으면 대부분 풀리므로 여기서는 null 을 돌려준다.
 * 이 문구는 안드로이드에서만 나온다. 다만 아이폰 화면 시험이 「Google Play」 글자를 막아서 「스토어 앱」으로 쓴다.
 */
export function storeFixHint(problem: { responseCode?: number } | null | undefined): string | null {
  switch (problem?.responseCode) {
    case -2:
      return L(
        '이 휴대폰의 스토어 앱이 오래돼서 결제 상품을 불러오지 못해요. 스토어 앱 설정 → 정보에서 버전을 눌러 업데이트한 뒤 다시 시도해주세요.',
        "Your store app is out of date, so we can't load purchases. In the store app, go to Settings → About, tap the version to update, then try again.",
      );
    case 3:
      return L(
        '이 기기에서 스토어 결제를 쓸 수 없는 상태예요. 스토어 앱을 열어 로그인·업데이트한 뒤 다시 시도해주세요.',
        "Store purchases aren't available on this device. Open the store app, sign in and update it, then try again.",
      );
    default:
      return null;
  }
}
