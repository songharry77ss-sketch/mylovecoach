/**
 * api/_telegram.ts — 운영자 텔레그램 알림 도우미.
 * 환경변수가 없으면 아무것도 보내지 않고, 실패해도 예외를 던지지 않으며, 이용자 값은 HTML 로 해석되지 않게 바꾼다.
 */
import { escapeHtml, formatWon, kstDate, kstDateTime, kstMidnight, notifyTelegram, TELEGRAM_TIMEOUT_MS, telegramReady } from '../../api/_telegram';

const calls: { url: string; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  calls.length = 0;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  global.fetch = jest.fn(async (url: string, init: { body?: string } = {}) => {
    calls.push({ url: String(url), body: JSON.parse(init.body ?? '{}') });
    return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '{}' };
  }) as unknown as typeof fetch;
});

describe('notifyTelegram', () => {
  it('봇 토큰이나 대화방 ID 가 없으면 보내지 않고 false', async () => {
    await expect(notifyTelegram('안녕')).resolves.toBe(false);
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    await expect(notifyTelegram('안녕')).resolves.toBe(false);
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_CHAT_ID = '123';
    await expect(notifyTelegram('안녕')).resolves.toBe(false);
    expect(telegramReady()).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('쉼표로 적은 대화방마다 HTML 형식·미리보기 없이 보낸다', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_CHAT_ID = '123, -100456 ,';
    expect(telegramReady()).toBe(true);
    await expect(notifyTelegram('<b>안녕</b>')).resolves.toBe(true);
    expect(calls.map((c) => c.url)).toEqual(['https://api.telegram.org/botbot-token/sendMessage', 'https://api.telegram.org/botbot-token/sendMessage']);
    expect(calls.map((c) => c.body.chat_id)).toEqual(['123', '-100456']);
    expect(calls[0].body).toMatchObject({ text: '<b>안녕</b>', parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  });

  it('네트워크 오류·실패 응답이면 예외 없이 false', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_CHAT_ID = '123';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('https://api.telegram.org/botbot-token/sendMessage 연결 실패'));
    await expect(notifyTelegram('안녕')).resolves.toBe(false);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 400 });
    await expect(notifyTelegram('안녕')).resolves.toBe(false);
    // 토큰이 든 주소는 기록에 남기지 않는다
    expect(JSON.stringify(warn.mock.calls)).not.toContain('bot-token');
    warn.mockRestore();
  });

  it('응답이 없으면 시간 제한으로 포기한다', async () => {
    jest.useFakeTimers();
    try {
      process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
      process.env.TELEGRAM_CHAT_ID = '123';
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (global.fetch as jest.Mock).mockImplementationOnce(
        (_url: string, init: { signal?: AbortSignal }) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
      );
      const pending = notifyTelegram('안녕');
      await jest.advanceTimersByTimeAsync(TELEGRAM_TIMEOUT_MS + 1);
      await expect(pending).resolves.toBe(false);
      warn.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('4096자가 넘으면 줄 경계에서 잘라 보낸다', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_CHAT_ID = '123';
    await notifyTelegram(Array.from({ length: 400 }, (_, i) => `줄 ${i} ${'가'.repeat(10)}`).join('\n'));
    const text = String(calls[0].body.text);
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text.endsWith('\n…')).toBe(true);
  });
});

describe('도우미', () => {
  it('escapeHtml 은 태그·& 를 글자 그대로 보이게 바꾼다', () => {
    expect(escapeHtml('<b>민수</b> & "친구"')).toBe('&lt;b&gt;민수&lt;/b&gt; &amp; &quot;친구&quot;');
    expect(escapeHtml(null)).toBe('');
  });

  it('한국 시간 자정·날짜', () => {
    // 2026-10-20 15:30 UTC = 10-21 00:30 KST
    const now = Date.UTC(2026, 9, 20, 15, 30);
    expect(kstMidnight(now).toISOString()).toBe('2026-10-20T15:00:00.000Z');
    expect(kstMidnight(now, -1).toISOString()).toBe('2026-10-19T15:00:00.000Z');
    expect(kstDate(now)).toBe('10/21');
    expect(kstDateTime(now)).toBe('10/21 00:30');
  });

  it('원화 표시', () => {
    expect(formatWon(2700)).toBe('₩2,700');
    expect(formatWon(1234567)).toBe('₩1,234,567');
    expect(formatWon(0)).toBe('₩0');
  });
});
