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

/**
 * 이용 기록을 저장해도 되는 수집 기준의 판 (앱의 src/lib/analytics.ts 와 같은 값).
 * 2 = 예전 앱(1.0.3 까지)의 선택 동의 — 첫 화면 체크박스를 이용자가 직접 눌러야 켜지는 방식. 화면·버튼 기록과 코칭 내용을 함께 동의받았다.
 * 3 = 기본 이용 기록 (1.0.4~) — 처리방침에 알리고 만 14세 이상에게 수집. 코칭 내용은 x-content-consent: 1 로 따로 동의를 알린다.
 * 판 표시가 없는 예전 동의는 미리 체크된 체크박스로 받은 것이라 저장하지 않는다 (개인정보 선택 동의는 미리 체크 금지).
 */
export const MIN_ANALYTICS_CONSENT_VERSION = 2;
export const BASIC_LOG_VERSION = 3;

export const consentVersionOk = (value: unknown): boolean => Number(value) >= MIN_ANALYTICS_CONSENT_VERSION;

/**
 * 코칭 내용(질문·답변) 저장 동의 — 판 2(예전 앱의 선택 동의는 코칭 내용까지 포함) 이거나,
 * 판 3 이상이면서 앱이 「코칭 내용 저장」(선택) 동의를 x-content-consent: 1 로 알린 경우만
 */
export function contentConsentOk(version: unknown, contentHeader: unknown): boolean {
  if (!consentVersionOk(version)) return false;
  return Number(version) < BASIC_LOG_VERSION || contentHeader === '1';
}

/**
 * 메일로 처리 정지를 요청한 기기 — Vercel 환경변수 ANALYTICS_OPTOUT_DEVICES 에 기기 ID 를 쉼표·공백으로 나눠 적는다.
 * 이 기기의 이용 기록·코칭 내용은 받기만 하고 저장하지 않는다 (이미 쌓인 기록은 관리자 페이지의 「기록 삭제」로 지운다)
 */
export function optedOutDevice(deviceId: string): boolean {
  const list = (process.env.ANALYTICS_OPTOUT_DEVICES ?? '').split(/[\s,]+/).filter(Boolean);
  return list.includes(deviceId);
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: KEY_ENV(),
    Authorization: `Bearer ${KEY_ENV()}`,
    'content-type': 'application/json',
    ...extra,
  };
}

type InsertOptions = { upsert?: boolean; ignoreDuplicates?: boolean };

/**
 * 행 추가 — 성공 여부와 응답 상태 코드 (연결 안 됨·네트워크 실패는 status 0). 실패해도 예외를 던지지 않습니다.
 * 거절 이유에 따라 답을 나눌 때 쓴다: 표가 없으면 404, 트리거가 PT429·PT503 으로 거절하면 429·503 (PostgREST 가 PTxyz → HTTP xyz)
 */
export async function insertResult(table: string, rows: unknown[] | unknown, options: InsertOptions = {}): Promise<{ ok: boolean; status: number }> {
  if (!supabaseReady()) return { ok: false, status: 0 };
  const body = Array.isArray(rows) ? rows : [rows];
  if (!body.length) return { ok: true, status: 0 };
  const resolution = options.ignoreDuplicates ? 'resolution=ignore-duplicates,' : options.upsert ? 'resolution=merge-duplicates,' : '';
  try {
    const res = await fetch(`${URL_ENV()}/rest/v1/${table}`, {
      method: 'POST',
      headers: headers({ Prefer: `${resolution}return=minimal` }),
      body: JSON.stringify(body),
    });
    if (!res.ok) console.warn(`[supabase] ${table} insert ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.warn(`[supabase] ${table} insert 실패:`, e instanceof Error ? e.message : e);
    return { ok: false, status: 0 };
  }
}

/**
 * 행 추가 (여러 건 가능). 실패해도 예외를 던지지 않습니다.
 * upsert: 같은 키가 있으면 보낸 값으로 덮어씀 · ignoreDuplicates: 같은 키가 있으면 그대로 둠
 */
export async function insert(table: string, rows: unknown[] | unknown, options: InsertOptions = {}): Promise<boolean> {
  return (await insertResult(table, rows, options)).ok;
}

/**
 * 같은 키(onConflict 열들)가 이미 있으면 건너뛰고 추가 — 실제로 새로 들어간 행 수. 실패하면 null.
 * 스토어 알림처럼 같은 알림이 다시 와도 한 번만 처리할 때 쓴다 (0 이면 이미 받은 것).
 * onConflict 는 그 열들의 (부분 조건 없는) 고유 색인이 있어야 한다 — PostgREST 는 부분 색인을 대상으로 지정할 수 없다.
 */
export async function insertNew(table: string, rows: unknown[] | unknown, onConflict: string): Promise<number | null> {
  if (!supabaseReady()) return null;
  const body = Array.isArray(rows) ? rows : [rows];
  if (!body.length) return 0;
  try {
    const res = await fetch(`${URL_ENV()}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}&select=${encodeURIComponent(onConflict.split(',')[0])}`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[supabase] ${table} insert ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const inserted = (await res.json()) as unknown;
    return Array.isArray(inserted) ? inserted.length : null;
  } catch (e) {
    console.warn(`[supabase] ${table} insert 실패:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 행 수 세기 (PostgREST count=exact, 조건은 쿼리 문자열). 실패하면 null.
 * 한 행만 요청하고 응답 머리글 content-range(예: 0-0/123, 없으면 * /0)의 전체 수를 읽는다
 */
export async function countRows(table: string, filter = ''): Promise<number | null> {
  if (!supabaseReady()) return null;
  try {
    const res = await fetch(`${URL_ENV()}/rest/v1/${table}?select=*${filter ? `&${filter}` : ''}`, {
      headers: headers({ Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }),
    });
    // 0건이면 PostgREST 판에 따라 416 과 함께 전체 수(*/0)만 줄 수 있어 상태와 관계없이 머리글을 본다
    const range = typeof res.headers?.get === 'function' ? res.headers.get('content-range') : null;
    const total = range?.split('/')[1];
    if (!total || total === '*' || !/^\d+$/.test(total)) {
      if (!res.ok) console.warn(`[supabase] ${table} count ${res.status}`);
      return null;
    }
    return Number(total);
  } catch {
    return null;
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

export interface AuthUser {
  id: string;
  email?: string | null;
  app_metadata?: { provider?: string };
  user_metadata?: Record<string, unknown>;
  /** 로그인 제공자별 계정 (카카오 연결 끊기에 카카오 회원번호를 쓴다) */
  identities?: { provider?: string; id?: string; identity_data?: Record<string, unknown> }[];
}

/** 앱이 보낸 로그인 토큰으로 회원 확인 (Supabase Auth). 유효하지 않으면 null */
export async function authUser(accessToken: string): Promise<AuthUser | null> {
  if (!supabaseReady() || !accessToken) return null;
  try {
    const res = await fetch(`${URL_ENV()}/auth/v1/user`, { headers: { apikey: KEY_ENV(), Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const user = (await res.json()) as AuthUser;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

/** 로그인 계정 삭제 (회원 탈퇴) */
export async function deleteAuthUser(userId: string): Promise<boolean> {
  if (!supabaseReady()) return false;
  try {
    const res = await fetch(`${URL_ENV()}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE', headers: headers() });
    return res.ok || res.status === 404;
  } catch {
    return false;
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
    // 돌려주는 값이 없는 함수(void)는 본문 없는 204 → 성공 표시로 true
    const text = await res.text();
    return (text ? JSON.parse(text) : true) as T;
  } catch {
    return null;
  }
}
