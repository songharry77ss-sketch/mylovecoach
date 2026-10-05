import { useEffect, useState } from 'react';

import { loadPlanProducts, type PlanProduct } from '@/lib/billing/iap';
import type { PlanKey } from '@/lib/billing/plans';

/**
 * 스토어 상품 목록 (현지 표시 가격 + 실제로 스토어에 있는지).
 * 여러 화면이 같이 쓰므로 한 번 받아 온 결과를 앱이 켜져 있는 동안 재사용한다.
 * 스토어에 닿지 못해 하나도 확인하지 못했으면 저장하지 않고 다음에 다시 묻는다.
 */
let cached: PlanProduct[] | null = null;
let pending: Promise<PlanProduct[]> | null = null;

function fetchOnce(): Promise<PlanProduct[]> {
  if (cached) return Promise.resolve(cached);
  pending ??= loadPlanProducts()
    .then((list) => {
      if (list.some((p) => p.available === true)) cached = list;
      return list;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** 불러오는 중이면 null */
export function usePlanProducts(): PlanProduct[] | null {
  const [products, setProducts] = useState<PlanProduct[] | null>(cached);
  useEffect(() => {
    let alive = true;
    fetchOnce()
      .then((list) => alive && setProducts(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return products;
}

/**
 * 스토어에서 확인된 상품이면 그 표시 가격, 아니면 null.
 * 웹·스토어 연결 실패처럼 확인하지 못한 경우에도 null — 없는 상품을 안내하지 않도록 문구는 일반 표현으로 돌린다.
 */
export function onSalePrice(products: PlanProduct[] | null, plan: PlanKey): string | null {
  const product = products?.find((p) => p.plan === plan && p.available === true);
  return product ? product.displayPrice : null;
}
