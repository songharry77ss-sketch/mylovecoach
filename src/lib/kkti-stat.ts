/**
 * KKTI 횟수 집계 — 테스트 시작·완료·공유가 몇 번 일어났는지만 서버에 알린다 (api/kkti-stat).
 * 이벤트 이름 하나만 보내고 기기 ID·답 코드·프로필은 보내지 않는다.
 * 웹은 누가 했는지 남지 않는 숫자라 그대로 센다. 앱(아이폰·안드로이드)은 서비스 이용 기록을 보내는 경우(만 14세 이상·삭제 요청 없음)에만 센다 —
 * 스토어 개인정보 신고(Play 데이터 보안의 앱 상호작용)와 맞추기 위해서다.
 * 실패해도 앱 동작에 영향을 주지 않도록 모든 오류를 삼킨다.
 */
import { Platform } from 'react-native';

import { analyticsEnabled } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';

export type KktiStatEvent = 'start' | 'start_friend' | 'complete' | 'complete_friend' | 'share' | 'open_shared' | 'match_view';

export function countKkti(event: KktiStatEvent): void {
  if (isDemoMode || !(APP_CONFIG.apiSameOrigin || APP_CONFIG.apiUrl)) return;
  if (Platform.OS !== 'web' && !analyticsEnabled()) return;
  try {
    fetch(`${APP_CONFIG.apiUrl}/api/kkti-stat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {}) },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 네트워크가 없으면 조용히 넘어간다
  }
}
