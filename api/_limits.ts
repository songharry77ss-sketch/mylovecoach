/**
 * 공개 API 남용 막기 도우미 — 요청 IP 와 인스턴스 메모리 기반의 간이 빈도 제한.
 * 서버리스 인스턴스마다 따로 세므로 완벽하지 않지만, 한 곳에서 몰아치는 반복 호출은 걸러 준다.
 */
import type { VercelRequest } from '@vercel/node';

export function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : (fwd ?? '')).split(',')[0]?.trim();
  const real = req.headers['x-real-ip'];
  return (first || (typeof real === 'string' ? real : '') || 'unknown').slice(0, 64);
}

const buckets = new Map<string, number[]>();

/** bucket(용도)·key(IP 등)마다 windowMs 동안 max 번을 넘으면 true */
export function rateLimited(bucket: string, key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const id = `${bucket}:${key}`;
  const recent = (buckets.get(id) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(id, recent);
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return recent.length > max;
}

/** 본문이 너무 크면 true (content-length 가 없으면 파싱된 본문 길이로 본다) */
export function bodyTooLarge(req: VercelRequest, maxBytes: number): boolean {
  const declared = Number(req.headers['content-length'] ?? NaN);
  if (Number.isFinite(declared)) return declared > maxBytes;
  try {
    return JSON.stringify(req.body ?? '').length > maxBytes;
  } catch {
    return true;
  }
}
