/**
 * 회원가입·로그인용 Supabase 클라이언트.
 * EXPO_PUBLIC_SUPABASE_URL · EXPO_PUBLIC_SUPABASE_ANON_KEY(공개 키)가 없으면 null 이고,
 * 그때는 가입 화면을 숨기고 예전 무료 규칙(체험 3회 + 매일 1회)을 쓴다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { isDemoMode } from '@/lib/demo';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient | null =
  url && anonKey && !isDemoMode
    ? createClient(url, anonKey, {
        auth: {
          // 웹은 기본 저장소(localStorage), 앱은 AsyncStorage
          ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage, lock: processLock }),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
          flowType: 'pkce',
        },
      })
    : null;

/** 회원가입을 쓸 수 있는 빌드인지 */
export const authAvailable = supabase != null;

// 앱이 화면에 있을 때만 로그인 토큰을 자동으로 새로 고친다 (Supabase 권장)
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
