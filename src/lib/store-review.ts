import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';

import { track } from '@/lib/analytics';
import { useAppStore } from '@/store/app-store';

/**
 * 스토어 별점 요청 — 별점·리뷰 수가 「연애」「코치」 같은 넓은 검색어 순위를 가른다.
 * 가장 만족한 순간(답장을 복사해 보내려는 순간)에만, 여러 번 만족한 뒤에, 드물게 묻는다.
 * 실제로 창을 띄울지는 스토어가 정한다 (iOS 는 1년에 최대 3번, Play 는 할당량) — 앱은 묻는 횟수만 아낀다.
 */

/** 좋은 순간이 이만큼 쌓인 뒤에 처음 묻는다 */
export const REVIEW_MIN_WINS = 3;
/** 한 번 물은 뒤 다시 묻기까지 */
export const REVIEW_GAP_MS = 60 * 24 * 60 * 60 * 1000;
/** 1년 안에 묻는 최대 횟수 */
export const REVIEW_MAX_PER_YEAR = 3;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function shouldAskReview(wins: number, asks: number[], now: number): boolean {
  if (wins < REVIEW_MIN_WINS) return false;
  const recent = asks.filter((t) => now - t < YEAR_MS);
  if (recent.length >= REVIEW_MAX_PER_YEAR) return false;
  const last = recent.length ? Math.max(...recent) : null;
  return last == null || now - last >= REVIEW_GAP_MS;
}

/** 답장 복사 같은 좋은 순간을 세고, 때가 되면 별점을 부탁한다 (웹은 세지도 묻지도 않는다) */
export async function noteWinAndMaybeAskReview(kind: 'reply_copy' | 'mind_copy', now = Date.now()): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const store = useAppStore.getState();
  store.noteReviewWin();
  const { reviewWins, reviewAsks } = useAppStore.getState();
  if (!shouldAskReview(reviewWins, reviewAsks, now)) return false;
  try {
    if (!(await StoreReview.isAvailableAsync())) return false;
    useAppStore.getState().markReviewAsked(now);
    track('review_prompt', { kind, wins: reviewWins });
    // 복사 하트·토스트가 먼저 보이게 조금 뒤에 띄운다
    setTimeout(() => {
      StoreReview.requestReview().catch(() => {});
    }, 1200);
    return true;
  } catch {
    return false;
  }
}
