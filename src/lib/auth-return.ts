/**
 * 웹 가입 뒤 돌아갈 화면.
 * 웹은 카카오·Google 로그인 때 페이지를 떠났다가 /auth/callback 으로 돌아오므로, 떠나기 전에 보던 채팅방을 적어 두었다가 그리로 돌려보낸다.
 * (예전에는 늘 마이 탭으로 가 버려, 가입하고 나머지 답장을 보려던 채팅방을 잃었다)
 * 앱은 로그인 창이 화면 위에 떴다 닫히므로 필요 없다. 기기 저장소가 없거나 막혀도 조용히 넘어간다.
 */
const KEY = 'mlc.authReturn';
/** 이만큼 지나면 버린다 (다른 날 로그인했을 때 엉뚱한 화면으로 가지 않게) */
const MAX_AGE_MS = 30 * 60 * 1000;
/** 채팅방만 돌아간다 — 주소를 그대로 믿지 않는다 */
const ALLOWED = /^\/crush\/[A-Za-z0-9_-]{1,64}$/;

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

export function rememberAuthReturn(path: string, now = Date.now()): void {
  if (!ALLOWED.test(path)) return;
  try {
    storage()?.setItem(KEY, JSON.stringify({ path, at: now }));
  } catch {
    // 저장소가 막혀 있으면 돌아가기만 못 한다
  }
}

/** 적어 둔 화면을 꺼내고 지운다. 없거나 오래됐거나 허용하지 않는 주소면 null */
export function takeAuthReturn(now = Date.now()): string | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    s.removeItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof saved.path !== 'string' || !ALLOWED.test(saved.path)) return null;
    if (typeof saved.at !== 'number' || now - saved.at > MAX_AGE_MS || saved.at > now + 60_000) return null;
    return saved.path;
  } catch {
    return null;
  }
}
