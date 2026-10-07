/**
 * 공개 API 남용 막기 도우미 — 요청 IP 와 인스턴스 메모리 기반의 간이 빈도 제한.
 * 서버리스 인스턴스마다 따로 세므로 완벽하지 않지만, 한 곳에서 몰아치는 반복 호출은 걸러 준다.
 * IP 는 인스턴스마다 새로 만든 무작위 값과 섞은 해시로만 들고 있고(데이터베이스에는 저장하지 않음),
 * 창이 지난 항목은 1분마다 지운다 — 처리방침 「IP 를 서버 메모리에서 잠시 쓰고 지움」.
 */
import { createHash, randomBytes } from 'node:crypto';

import type { VercelRequest } from '@vercel/node';

export function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : (fwd ?? '')).split(',')[0]?.trim();
  const real = req.headers['x-real-ip'];
  return (first || (typeof real === 'string' ? real : '') || 'unknown').slice(0, 64);
}

const SALT = randomBytes(16).toString('hex');
const SWEEP_EVERY_MS = 60 * 1000;
const buckets = new Map<string, { windowMs: number; hits: number[] }>();
let lastSweepAt = 0;

const keyOf = (bucket: string, key: string) => `${bucket}:${createHash('sha256').update(`${SALT}:${key}`).digest('base64url').slice(0, 22)}`;

/** 창이 지난 기록을 지운다 (now 를 넘기면 그 시각 기준) */
export function sweepRateLimits(now = Date.now()): void {
  lastSweepAt = now;
  for (const [id, entry] of buckets) {
    entry.hits = entry.hits.filter((t) => now - t < entry.windowMs);
    if (!entry.hits.length) buckets.delete(id);
  }
}

/** bucket(용도)·key(IP 등)마다 windowMs 동안 max 번을 넘으면 true */
export function rateLimited(bucket: string, key: string, max: number, windowMs: number, now = Date.now()): boolean {
  if (now - lastSweepAt >= SWEEP_EVERY_MS) sweepRateLimits(now);
  const id = keyOf(bucket, key);
  const entry = buckets.get(id) ?? { windowMs, hits: [] };
  entry.hits = entry.hits.filter((t) => now - t < windowMs);
  entry.hits.push(now);
  buckets.set(id, entry);
  return entry.hits.length > max;
}

/** 지금 메모리에 들고 있는 빈도 제한 항목 수 (시험용) */
export function rateLimitEntries(): number {
  return buckets.size;
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
