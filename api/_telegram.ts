/**
 * 운영자 텔레그램 알림 (회원가입·스토어 결제·매일 리포트).
 * 환경변수: TELEGRAM_BOT_TOKEN (BotFather 가 준 봇 토큰), TELEGRAM_CHAT_ID (받을 대화방 ID, 쉼표로 여러 개)
 * 둘 중 하나라도 없으면 보내지 않고 false. 실패해도 예외를 던지지 않는다 — 알림 때문에 가입·결제 처리가 멈추면 안 되므로.
 * 메시지는 HTML 형식이라 이용자가 적은 값(닉네임·이메일·유입 경로 등)은 반드시 escapeHtml 로 감싼다.
 */

/** 텔레그램이 늦어도 이 시간 안에 포기한다 (회원가입 응답이 늘어지지 않게) */
export const TELEGRAM_TIMEOUT_MS = 4000;
/** 텔레그램 메시지 한 통의 최대 글자 수 */
const TELEGRAM_MAX_CHARS = 4096;

const botToken = () => (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const chatIds = () =>
  (process.env.TELEGRAM_CHAT_ID ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

/** 봇 토큰과 대화방 ID 가 모두 있으면 true */
export const telegramReady = (): boolean => Boolean(botToken() && chatIds().length);

/** 텔레그램 HTML 형식에서 글자 그대로 보이게 바꾼다 (<, >, & 와 따옴표) */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 너무 길면 줄 단위로 잘라 한 통에 들어가게 한다 (태그 중간에서 끊기지 않도록 줄 경계에서) */
function fitMessage(text: string): string {
  if (text.length <= TELEGRAM_MAX_CHARS) return text;
  const room = TELEGRAM_MAX_CHARS - 2;
  const cut = text.lastIndexOf('\n', room);
  return `${text.slice(0, cut > 0 ? cut : room)}\n…`;
}

/**
 * 운영자 대화방으로 메시지를 보낸다. 한 곳이라도 받으면 true.
 * 환경변수가 없거나, 네트워크 실패·시간 초과면 false (예외 없음). 토큰이 들어간 주소는 기록에 남기지 않는다.
 */
export async function notifyTelegram(text: string): Promise<boolean> {
  const token = botToken();
  const ids = chatIds();
  if (!token || !ids.length || !text.trim()) return false;
  const body = fitMessage(text);
  const results = await Promise.all(
    ids.map(async (chatId) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: body,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            link_preview_options: { is_disabled: true },
          }),
          signal: controller.signal,
        });
        if (!res.ok) console.warn(`[telegram] 보내기 실패 ${res.status}`);
        return res.ok;
      } catch (e) {
        // 오류 내용에 요청 주소(토큰 포함)가 섞일 수 있어 종류만 남긴다
        console.warn('[telegram] 보내기 실패:', e instanceof Error ? e.name : 'unknown');
        return false;
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return results.some(Boolean);
}

// ── 한국 시간 (서버는 UTC 로 돈다) ─────────────────────────────────────────
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** 한국 날짜의 자정 (offsetDays: 0 = 오늘, -1 = 어제) */
export function kstMidnight(now: number | Date = Date.now(), offsetDays = 0): Date {
  const kst = new Date(+now + KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + offsetDays) - KST_OFFSET_MS);
}

/** 한국 시간 「MM/DD」 */
export function kstDate(at: number | string | Date = Date.now()): string {
  const kst = new Date(+new Date(at) + KST_OFFSET_MS);
  return `${pad(kst.getUTCMonth() + 1)}/${pad(kst.getUTCDate())}`;
}

/** 한국 시간 「MM/DD HH:mm」 */
export function kstDateTime(at: number | string | Date = Date.now()): string {
  const kst = new Date(+new Date(at) + KST_OFFSET_MS);
  return `${kstDate(at)} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

/** 원화 표시 (₩12,300) — ICU 없이 */
export const formatWon = (amount: number): string => `₩${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
