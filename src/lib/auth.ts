/**
 * 회원가입·로그인 (카카오·Apple) — Supabase Auth.
 * 로그인하면 서버(/api/member)에 이 기기를 잇고, 처음 가입이면 무료 코칭 보너스를 받는다 (회원·기기당 한 번).
 * 애플 규정상 아이폰에서 카카오 로그인을 보여 주면 Apple 로그인도 함께 보여 줘야 한다.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { useAppStore, type MemberState } from '@/store/app-store';

/** 사용자가 로그인 창을 닫았을 때 (오류 안내 없이 조용히 넘어간다) */
export class AuthCancelled extends Error {}

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

const redirectUrl = () => (Platform.OS === 'web' ? `${window.location.origin}/auth/callback` : Linking.createURL('auth/callback'));

const ensureClient = () => {
  if (!supabase) throw new Error('지금은 가입할 수 없어요. 잠시 후 다시 시도해주세요.');
  return supabase;
};

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
  if (!code) throw new Error(params.get('error_description') ?? '카카오 로그인을 마치지 못했어요.');
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
  const client = ensureClient();
  const { data } = await client.auth.getSession();
  const session = data.session;
  if (!session) throw new Error('로그인 정보가 없어요. 다시 로그인해주세요.');
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
  if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : '서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
  return { session, json };
}

/** 로그인한 계정을 이 기기와 잇고, 처음 가입이면 보너스를 받는다 */
export async function linkMember(nickname?: string): Promise<LinkResult> {
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

/** 로그아웃 (이 기기에서만) */
export async function signOut(): Promise<void> {
  await supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
  useAppStore.getState().setMember(null);
  track('logout');
}

/** 회원 탈퇴 — 서버의 회원 기록·로그인 계정·이용 기록을 지운다 */
export async function deleteAccount(): Promise<void> {
  await memberApi('DELETE');
  await supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
  useAppStore.getState().setMember(null);
}

export const providerLabel = (provider: string) => (provider === 'apple' ? 'Apple' : provider === 'kakao' ? '카카오' : provider);
