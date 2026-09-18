/**
 * Supabase 기록 도우미 (PostgREST 직접 호출 — SDK 의존성 없음).
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 둘 다 없으면 모든 함수가 조용히 아무것도 하지 않습니다 (기록 없이 앱은 정상 동작).
 */
const URL_ENV = () => (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY_ENV = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const supabaseReady = (): boolean => Boolean(URL_ENV() && KEY_ENV());

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: KEY_ENV(),
    Authorization: `Bearer ${KEY_ENV()}`,
    'content-type': 'application/json',
    ...extra,
  };
}

/** 행 추가 (여러 건 가능). 실패해도 예외를 던지지 않습니다. */
export async function insert(table: string, rows: unknown[] | unknown, options: { upsert?: boolean } = {}): Promise<boolean> {
  if (!supabaseReady()) return false;
  const body = Array.isArray(rows) ? rows : [rows];
  if (!body.length) return true;
  try {
    const res = await fetch(`${URL_ENV()}/rest/v1/${table}`, {
      method: 'POST',
      headers: headers({ Prefer: options.upsert ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) console.warn(`[supabase] ${table} insert ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.ok;
  } catch (e) {
    console.warn(`[supabase] ${table} insert 실패:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** 행 수정 (조건은 PostgREST 쿼리 문자열, 예: `device_id=eq.abc`) */
export async function patch(table: string, filter: string, values: Record<string, unknown>): Promise<boolean> {
  if (!supabaseReady()) return false;
  try {
    const res = await fetch(`${URL_ENV()}/rest/v1/${table}?${filter}`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(values),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 조회 (PostgREST 쿼리 문자열) */
export async function select<T = unknown>(table: string, query: string): Promise<T[]> {
  if (!supabaseReady()) return [];
  try {
    const res = await fetch(`${URL_ENV()}/rest/v1/${table}?${query}`, { headers: headers() });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}

/** 저장 프로시저 호출 (집계용) */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  if (!supabaseReady()) return null;
  try {
    const res = await fetch(`${URL_ENV()}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) });
    if (!res.ok) {
      console.warn(`[supabase] rpc ${fn} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
