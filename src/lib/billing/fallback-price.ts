/**
 * 스토어 가격을 받기 전(또는 받지 못했을 때) 화면에 보여 줄 값 — 앱 전용 (서버가 쓰는 plans.ts 에는 i18n 을 불러오지 않는다).
 * 한국어판은 지금처럼 원화 정가(FALLBACK_PRICES), 영어판은 빈칸 — 나라마다 값이 달라 스토어가 준 현지 가격만 쓴다 (docs/I18N.md).
 */
import { FALLBACK_PRICES, type PlanKey } from '@/lib/billing/plans';
import { isKo } from '@/lib/i18n';

export const fallbackPrice = (plan: PlanKey): string => (isKo ? FALLBACK_PRICES[plan] : '');
