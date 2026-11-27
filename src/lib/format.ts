import { isEn, L } from '@/lib/i18n';

// 영어판 달 이름 (Intl 은 기기마다 결과가 달라 직접 쓴다)
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return L('방금 전', 'just now');
  if (min < 60) return L(`${min}분 전`, `${min} min ago`);
  const hr = Math.floor(min / 60);
  if (hr < 24) return L(`${hr}시간 전`, `${hr} hr ago`);
  const day = Math.floor(hr / 24);
  if (day < 7) return L(`${day}일 전`, day === 1 ? '1 day ago' : `${day} days ago`);
  const d = new Date(ts);
  return L(`${d.getMonth() + 1}월 ${d.getDate()}일`, `${MONTHS_EN[d.getMonth()]} ${d.getDate()}`);
}

/** 「오후 9:41」 / 「9:41 PM」 */
export function timeOfDay(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return L(`${h < 12 ? '오전' : '오후'} ${hour12}:${m}`, `${hour12}:${m} ${h < 12 ? 'AM' : 'PM'}`);
}

export function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** 「2026년 11월 27일」 / 「Nov 27, 2026」 */
export function dateLabel(ts: number): string {
  const d = new Date(ts);
  return L(`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`, `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`);
}

/**
 * 오류 안내 글 — 오류에 담긴 글을 그대로 보여 주되, 영어판인데 한국어 글이면(아직 번역 안 된 곳에서 온 오류) 영어 대체 글로.
 * 한국어판은 예전 그대로 (Error 면 그 글, 아니면 한국어 대체 글)
 */
export function errorText(e: unknown, fallbackKo: string, fallbackEn: string): string {
  if (!isEn) return e instanceof Error ? e.message : fallbackKo;
  const message = e instanceof Error ? e.message : '';
  return message && !/[가-힣]/.test(message) ? message : fallbackEn;
}
