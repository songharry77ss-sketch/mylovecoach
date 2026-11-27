/**
 * 앱 언어 — 한국어(ko)·영어(en) 두 가지 (2026-11-27 세계 출시).
 * 기기 언어가 한국어면 한국어, 그 밖의 모든 언어는 영어. 웹은 한국어 홍보 화면이라 `?lang=en` 일 때만 영어.
 * 쓰는 법: `L('한국어', 'English')` — 한 줄에 두 언어를 나란히 적는다 (문구 키를 따로 두지 않음). 규칙은 docs/I18N.md.
 *
 * ⚠️ 서버(api/)가 같이 불러 쓰는 파일(coach-schema·ai-tasks·ai-schemas·gemini·kkti·billing/plans·version·release-notes·
 *    ai-report-schema·ai-backup·constants/brand·knowledge/*)에서는 이 파일을 불러오지 않는다 — expo-localization 은 앱 전용.
 */
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

export type Lang = 'ko' | 'en';

function detect(): Lang {
  // 테스트는 기존 한국어 기대값을 그대로 쓴다 (영어는 APP_LANG=en 으로 따로 확인)
  if (typeof process !== 'undefined' && process.env?.JEST_WORKER_ID !== undefined) return process.env.APP_LANG === 'en' ? 'en' : 'ko';
  try {
    if (Platform.OS === 'web') {
      const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('lang') : null;
      return q === 'en' ? 'en' : 'ko';
    }
    const code = getLocales()[0]?.languageCode?.toLowerCase();
    return code === 'ko' || code === undefined ? 'ko' : 'en';
  } catch {
    return 'ko';
  }
}

/** 앱을 켤 때 한 번 정한다 (바꾸려면 기기 언어를 바꾸고 앱을 다시 켠다) */
export const LANG: Lang = detect();
export const isKo = LANG === 'ko';
export const isEn = LANG === 'en';

/** 한국어·영어 중 지금 언어의 것 — 글자뿐 아니라 그림(require)·배열·JSX 도 된다 */
export function L<T>(ko: T, en: T): T {
  return LANG === 'ko' ? ko : en;
}

/** 서버로 보내는 AI 요청의 언어 — 영어면 서버가 답장·설명을 영어로 만든다 */
export const AI_LANG: Lang = LANG;
