/**
 * 회원가입·로그인 (카카오·Apple) — Supabase Auth.
 * 로그인하면 서버(/api/member)에 이 기기를 잇고, 처음 가입이면 무료 코칭 보너스를 받는다 (회원·기기당 한 번).
 * 애플 규정상 아이폰에서 카카오 로그인을 보여 주면 Apple 로그인도 함께 보여 줘야 한다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { authStorageKey, supabase } from '@/lib/supabase';
import { useAppStore, type MemberState } from '@/store/app-store';

/** 사용자가 로그인 창을 닫았을 때 (오류 안내 없이 조용히 넘어간다) */
export class AuthCancelled extends Error {}

/** 이 기기의 로그인 세션이 끝나 있을 때 (다시 로그인해야 함) */
export class SessionMissing extends Error {}

export interface LinkResult {
  member: MemberState;
  /** 이번에 가입 보너스를 받았는지 */
  bonus: boolean;
}

/** Apple 로그인은 아이폰에서만 보여 준다 (안드로이드·웹은 카카오만) */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !supabase) return false;
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

/**
 * 로그인 제공자·Supabase 가 돌려준 오류 값(error)을 정해 둔 문구로 바꾼다.
 * 주소에 실린 설명 글(error_description)은 누구나 꾸며 넣을 수 있어 화면에 그대로 보여 주지 않는다.
 */
export function authErrorMessage(error: string | null | undefined): string {
  switch (error) {
    case 'access_denied':
      return '로그인 동의를 취소했어요. 다시 시도해주세요.';
    case 'server_error':
    case 'temporarily_unavailable':
      return '로그인 서버에 잠시 문제가 생겼어요. 잠시 후 다시 시도해주세요.';
    default:
      return '로그인을 마치지 못했어요. 다시 시도해주세요.';
  }
}

const redirectUrl = () => (Platform.OS === 'web' ? `${window.location.origin}/auth/callback` : Linking.createURL('auth/callback'));

const ensureClient = () => {
  if (!supabase) throw new Error('지금은 가입할 수 없어요. 잠시 후 다시 시도해주세요.');
  return supabase;
};

const CONNECTION_ERROR = '서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.';

/**
 * 이 기기의 로그인 세션. 만료된 세션을 갱신하다 네트워크 오류 등으로 실패하면(error) 연결 오류로 알리고
 * 로그인 상태는 그대로 둔다 — 세션이 정말 없을 때(error 없이 null)만 SessionMissing.
 */
async function currentSession() {
  const { data, error } = await ensureClient().auth.getSession();
  if (error) throw new Error(CONNECTION_ERROR);
  if (!data.session) throw new SessionMissing('로그인이 끝났어요. 다시 로그인해주세요.');
  return data.session;
}

/**
 * 카카오 로그인. 웹은 카카오 화면으로 넘어갔다가 /auth/callback 에서 마무리하므로 null 을 돌려준다.
 */
export async function signInWithKakao(): Promise<LinkResult | null> {
  const client = ensureClient();
  const redirectTo = redirectUrl();
  if (Platform.OS === 'web') {
    const { error } = await client.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo } });
    if (error) throw error;
    return null;
  }
  const { data, error } = await client.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) throw error ?? new Error('카카오 로그인 화면을 열지 못했어요.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new AuthCancelled('cancelled');
  const returned = new URL(result.url);
  const params = new URLSearchParams(returned.search || returned.hash.replace(/^#/, ''));
  const code = params.get('code');
  if (!code) {
    const failed = params.get('error');
    if (failed === 'access_denied') throw new AuthCancelled('cancelled');
    throw new Error(authErrorMessage(failed));
  }
  const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return linkMember();
}

/** Apple 로그인 (아이폰 전용, 기기 안의 Apple 계정 창) */
export async function signInWithApple(): Promise<LinkResult> {
  const client = ensureClient();
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new AuthCancelled('cancelled');
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple 로그인 정보를 받지 못했어요.');
  const { error } = await client.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
  if (error) throw error;
  // Apple 은 이름을 처음 한 번만 알려 준다
  const name = [credential.fullName?.familyName, credential.fullName?.givenName].filter(Boolean).join('') || undefined;
  return linkMember(name);
}

async function memberApi(method: 'POST' | 'DELETE', body?: Record<string, unknown>) {
  const session = await currentSession();
  const res = await fetch(`${APP_CONFIG.apiUrl}/api/member`, {
    method,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : CONNECTION_ERROR);
  return { session, json };
}

let linking: Promise<LinkResult> | null = null;

/**
 * 로그인한 계정을 이 기기와 잇고, 처음 가입이면 보너스를 받는다.
 * 웹 콜백 화면과 루트 레이아웃이 동시에 불러도 서버 요청은 한 번만 보내고 결과를 나눠 쓴다.
 */
export function linkMember(nickname?: string): Promise<LinkResult> {
  if (!linking) {
    linking = requestLink(nickname).finally(() => {
      linking = null;
    });
  }
  return linking;
}

async function requestLink(nickname?: string): Promise<LinkResult> {
  const { session, json } = await memberApi('POST', { deviceId: useAppStore.getState().deviceId, nickname });
  const info = (json.member ?? {}) as { provider?: string; nickname?: string | null; created_at?: string };
  const member: MemberState = {
    userId: session.user.id,
    provider: info.provider ?? session.user.app_metadata?.provider ?? 'kakao',
    nickname: info.nickname ?? null,
    joinedAt: Date.parse(info.created_at ?? '') || Date.now(),
  };
  const store = useAppStore.getState();
  store.setMember(member);
  const bonus = json.bonus === true && store.grantSignupBonus(member.userId);
  track(json.new === true ? 'signup' : 'login', { provider: member.provider, bonus });
  return { member, bonus };
}

/**
 * 이 기기의 로그인 세션을 지운다. 오프라인이라 Supabase 가 지우지 못하면 저장된 세션을 직접 지운다
 * (남겨 두면 다음 실행 때 조용히 다시 로그인된다).
 */
async function dropLocalSession(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: 'local' }).catch((e: unknown) => ({ error: e }));
  if (!error || !authStorageKey) return;
  const keys = [authStorageKey, `${authStorageKey}-user`];
  if (Platform.OS === 'web') {
    for (const key of keys) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // 저장소를 쓸 수 없는 환경
      }
    }
  } else {
    await AsyncStorage.removeMany(keys).catch(() => {});
  }
}

/** 로그아웃 (이 기기에서만) */
export async function signOut(): Promise<void> {
  await dropLocalSession();
  useAppStore.getState().setMember(null);
  track('logout');
}

/**
 * Apple 회원 탈퇴용 인증 코드. Apple 규정상 탈퇴할 때 앱과 Apple ID 의 연결(토큰)을 취소해야 해서,
 * 기기의 Apple 확인 창을 한 번 더 띄워 새 코드를 받는다 (서버가 이 코드로 토큰을 취소).
 * 취소하면 탈퇴를 멈추고, 그 밖의 오류(기기에서 Apple ID 로그아웃, Apple 서버 오류 등)로 코드를 못 받으면
 * 코드 없이 탈퇴를 이어 간다 — 서버는 토큰 취소만 건너뛴다.
 */
async function appleCodeForRevoke(): Promise<string | undefined> {
  if (Platform.OS !== 'ios') return undefined;
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    return credential.authorizationCode ?? undefined;
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new AuthCancelled('cancelled');
    return undefined;
  }
}

/** 회원 탈퇴 — 서버의 회원 기록·로그인 계정·이용 기록을 지우고 카카오·Apple 연결을 끊는다 */
export async function deleteAccount(): Promise<void> {
  // 로그인이 끝났거나(다시 로그인 안내) 서버에 연결하지 못하면 Apple 확인 창을 띄우기 전에 멈춘다
  await currentSession();
  const member = useAppStore.getState().member;
  const appleAuthorizationCode = member?.provider === 'apple' ? await appleCodeForRevoke() : undefined;
  await memberApi('DELETE', appleAuthorizationCode ? { appleAuthorizationCode } : undefined);
  await dropLocalSession();
  useAppStore.getState().setMember(null);
}

export const providerLabel = (provider: string) => (provider === 'apple' ? 'Apple' : provider === 'kakao' ? '카카오' : provider);
