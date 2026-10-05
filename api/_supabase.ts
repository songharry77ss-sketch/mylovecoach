/**
 * Supabase 기록 도우미 (PostgREST 직접 호출 — SDK 의존성 없음).
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 둘 다 없으면 모든 함수가 조용히 아무것도 하지 않습니다 (기록 없이 앱은 정상 동작).
 */
const URL_ENV = () => (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY_ENV = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const supabaseReady = (): boolean => Boolean(URL_ENV() && KEY_ENV());

/**
 * 이용 기록(app_user·세션·화면·이벤트·코칭 기록) 저장 여부.
 * Supabase 는 팀원 명단에도 쓰므로, 연결만으로 이용 기록이 쌓이지 않게 ANALYTICS_ENABLED=1 일 때만 저장한다
 * (스토어 개인정보 신고를 「수집」으로 바꾼 뒤에 켤 것).
 */
export const analyticsEnabled = (): boolean => supabaseReady() && process.env.ANALYTICS_ENABLED === '1';

/** 앱이 만든 기기 ID 형식 (src/lib/id.ts 의 createId('d_')) */
export const DEVICE_ID = /^[A-Za-z0-9_-]{6,64}$/;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: KEY_ENV(),
    Authorization: `Bearer ${KEY_ENV()}`,
    'content-type': 'application/json',
    ...extra,
  };
}

/**
 * 행 추가 (여러 건 가능). 실패해도 예외를 던지지 않습니다.
 * upsert: 같은 키가 있으면 보낸 값으로 덮어씀 · ignoreDuplicates: 같은 키가 있으면 그대로 둠
 */
export async function insert(table: string, rows: unknown[] | unknown, options: { upsert?: boolean; ignoreDuplicates?: boolean } = {}): Promise<boolean> {
  if (!supabaseReady()) return false;
  const body = Array.isArray(rows) ? rows : [rows];
  if (!body.length) return true;
  const resolution = options.ignoreDuplicates ? 'resolution=ignore-duplicates,' : options.upsert ? 'resolution=merge-duplicates,' : '';
  try {
    const res = await fetch(`${URL_ENV()}/rest/v1/${table}`, {
      method: 'POST',
      headers: headers({ Prefer: `${resolution}return=minimal` }),
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

/** 행 삭제 (조건은 PostgREST 쿼리 문자열) */
export async function remove(table: string, filter: string): Promise<boolean> {
  if (!supabaseReady()) return false;
  try {
    const res = await fetch(`${URL_ENV()}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) });
    return res.ok;
  } catch {
    return false;
  }
}

/** 조회 (PostgREST 쿼리 문자열). 실패하면 null — 「없음」과 「못 읽음」을 구분해야 할 때 쓴다 */
export async function query<T = unknown>(table: string, q: string): Promise<T[] | null> {
  if (!supabaseReady()) return null;
  try {
    const res = await fetch(`${URL_ENV()}/rest/v1/${table}?${q}`, { headers: headers() });
    if (!res.ok) {
      console.warn(`[supabase] ${table} select ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as T[];
  } catch {
    return null;
  }
}

/** 조회 (PostgREST 쿼리 문자열). 실패하면 빈 배열 */
export async function select<T = unknown>(table: string, q: string): Promise<T[]> {
  return (await query<T>(table, q)) ?? [];
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
