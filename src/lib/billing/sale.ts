/**
 * 하루 이용권 타임 세일 규칙 — 정직하게 (표시광고법·전자상거래법의 거짓 할인·가짜 카운트다운 금지).
 *
 * - 세일은 스토어가 **특가 상품과 정가 하루 이용권을 둘 다 실제로 확인**했고, 두 가격을 숫자로 비교해
 *   특가가 정말 더 쌀 때만 연다 (saleOffer). 하나라도 없거나 가격을 모르면 정가 카드만 보여 준다.
 * - 처음 조건에 맞는 결제 화면을 볼 때 한 번 시작하고(앱 상태 saleOfferStartedAt 에 저장되어 앱을 껐다 켜도 이어짐),
 *   **10분** 뒤 끝난다. 결제 화면을 다시 열어도 타이머가 처음부터 돌지 않는다.
 * - 끝나면 정가로 돌아가고 특가 상품은 살 수 없다. **7일** 동안 다시 열리지 않고, 그 뒤 처음 조건에 맞는 결제 화면에서 다시 10분.
 * - 취소선 정가는 스토어가 주는 정가 하루 이용권 가격 그대로(부풀리지 않음), 특가는 스토어가 주는 특가 상품 가격.
 *   할인율은 두 가격 숫자로 계산하고 내림한다(부풀리지 않게).
 * - 기기 시계를 되돌려도 남은 시간이 10분을 넘지 않는다.
 */
import { isSaleProduct } from '@/lib/billing/plans';
import type { QuotaKind } from '@/lib/billing/quota';

/** 특가를 파는 시간 — 2026-11-08 사장님 결정 10분 (1.1.1 까지는 30분) */
export const SALE_WINDOW_MS = 10 * 60 * 1000;
/** 특가가 끝난 뒤 다시 열리지 않는 기간 */
export const SALE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** ready: 조건에 맞는 결제 화면을 보면 시작할 수 있음 · active: 특가 진행 중 · cooldown: 끝나고 쉬는 중 */
export type SalePhase = 'ready' | 'active' | 'cooldown';

export interface SaleWindow {
  phase: SalePhase;
  /** 특가가 끝나는 시각 (진행 중일 때만) */
  endsAt: number | null;
  /** 남은 시간 (진행 중이 아니면 0) */
  remainingMs: number;
  /** 다음에 세일을 다시 열 수 있는 시각 (ready 면 지금) */
  nextOpenAt: number;
}

/** 시작 시각(없으면 아직 안 함)과 지금 시각으로 세일이 어느 단계인지 */
export function saleWindow(startedAt: number | null | undefined, now: number): SaleWindow {
  if (startedAt == null || !Number.isFinite(startedAt)) return { phase: 'ready', endsAt: null, remainingMs: 0, nextOpenAt: now };
  const endsAt = startedAt + SALE_WINDOW_MS;
  const nextOpenAt = endsAt + SALE_COOLDOWN_MS;
  // 기기 시계가 시작 시각보다 앞으로 돌아갔으면 열지 않는다 — 10분보다 긴 타이머를 보여 주지 않게
  if (startedAt > now) return { phase: 'cooldown', endsAt: null, remainingMs: 0, nextOpenAt };
  if (now < endsAt) return { phase: 'active', endsAt, remainingMs: endsAt - now, nextOpenAt };
  if (now < nextOpenAt) return { phase: 'cooldown', endsAt: null, remainingMs: 0, nextOpenAt };
  return { phase: 'ready', endsAt: null, remainingMs: 0, nextOpenAt: now };
}

/** 지금 특가 중인지 */
export const isSaleActive = (startedAt: number | null | undefined, now: number): boolean => saleWindow(startedAt, now).phase === 'active';

/** 지금 결제 화면을 보면 새 세일을 시작해야 하는지 (처음이거나 쉬는 기간 7일이 지남) */
export const shouldStartSale = (startedAt: number | null | undefined, now: number): boolean => saleWindow(startedAt, now).phase === 'ready';

/**
 * 세일을 시작해도 되는 사람인지 — 이미 무제한(프리미엄·팀원·하루 이용권 이용 중)이면 열지 않는다.
 * 쓸 일 없는 사람에게 10분을 흘려보내고 7일을 잠그지 않게.
 */
export const saleAudience = (kind: QuotaKind): boolean => kind !== 'premium' && kind !== 'team' && kind !== 'pass';

/** 결제 화면의 상품 목록 한 칸 (lib/billing/iap 의 PlanProduct 와 호환) */
export interface SaleProductLike {
  plan: string;
  productId: string;
  displayPrice: string;
  available?: boolean;
  /** 스토어가 준 숫자 가격 (₩2,700 → 2700) */
  price?: number | null;
  currency?: string | null;
}

export interface SaleOffer<P extends SaleProductLike = SaleProductLike> {
  /** 정가 하루 이용권 (취소선 가격) */
  regular: P;
  /** 특가 상품 */
  sale: P;
  /** 할인율(%) — 두 가격 숫자로 계산해 내림 */
  percent: number;
}

/** 숫자 가격 — 스토어가 준 값, 없으면 원화 표시 가격(「₩2,700」)에서 읽는다. 모르면 null */
export function priceNumber(p: Pick<SaleProductLike, 'price' | 'displayPrice'>): number | null {
  if (typeof p.price === 'number' && Number.isFinite(p.price) && p.price > 0) return p.price;
  const won = /^\s*₩\s?([\d,]+)\s*$/.exec(p.displayPrice ?? '');
  if (!won) return null;
  const n = Number(won[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 스토어에서 확인된 정가 하루 이용권과 특가 상품이 둘 다 있고, 특가가 숫자로 확인되게 더 쌀 때만 세일 묶음을 준다.
 * 하나라도 없거나(스토어에 아직 안 만듦·조회 실패) 가격을 비교할 수 없거나 통화를 모르거나 다르면 null — 세일을 숨긴다.
 */
export function saleOffer<P extends SaleProductLike>(products: readonly P[] | null | undefined): SaleOffer<P> | null {
  const regular = products?.find((p) => p.plan === 'day' && !isSaleProduct(p.productId) && p.available === true);
  const sale = products?.find((p) => isSaleProduct(p.productId) && p.available === true);
  if (!regular || !sale) return null;
  const a = priceNumber(regular);
  const b = priceNumber(sale);
  if (a == null || b == null || b >= a) return null;
  // 두 상품 모두 통화를 알고 같을 때만 (한쪽이라도 모르면 비교를 믿을 수 없어 열지 않는다)
  if (!regular.currency || !sale.currency || regular.currency !== sale.currency) return null;
  const percent = Math.floor((1 - b / a) * 100);
  if (percent < 1) return null;
  return { regular, sale, percent };
}
