/**
 * 앱 언어 — 한국어판(ko)과 세계판(그 밖의 모든 언어) (2026-11-27 세계 출시).
 * - 기기 언어가 한국어면 한국어. 그 밖에는 아래 LANGS 중 기기 언어, 없으면 영어.
 * - 화면 문구는 `L('한국어', 'English')` 로 한국어·영어를 나란히 적는다. 영어 외 언어는 영어 문장을 열쇠로
 *   번역 사전(src/i18n/dict/<언어>.json — Codex 가 번역, tools/i18n/*)을 찾아 바꾼다. 사전에 없으면 영어 그대로.
 * - 숫자 등이 들어간 문장은 원본(src/i18n/source-en.json)의 틀(`{0} left`)에 맞춰 번역한다.
 * - 웹은 한국어 홍보 화면이라 `?lang=en`(또는 다른 언어 코드)일 때만 바뀐다. 웹에는 사전을 싣지 않는다(i18n/dicts.web.ts).
 * 규칙은 docs/I18N.md.
 *
 * ⚠️ 서버(api/)가 같이 불러 쓰는 파일(coach-schema·ai-tasks·ai-schemas·gemini·kkti·billing/plans·version·release-notes·
 *    ai-report-schema·ai-backup·constants/brand·knowledge/*)에서는 이 파일을 불러오지 않는다 — expo-localization 은 앱 전용.
 */
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import { loadDict } from '@/i18n/dicts';

/** 앱이 지원하는 언어 — 한국어·영어 + 번역 사전이 있는 언어 (App Store 주요 언어 기준) */
export const LANGS = [
  'ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'vi', 'th', 'ar', 'hi',
  'pl', 'nl', 'sv', 'da', 'nb', 'fi', 'cs', 'sk', 'hu', 'ro', 'uk', 'el', 'he', 'hr', 'ms', 'ca',
] as const;
export type Lang = (typeof LANGS)[number];

/** 기기 언어 태그(ko-KR, zh-Hant-TW, pt-BR, no …) → 앱 언어 */
export function langOf(tag: string | null | undefined): Lang {
  const t = String(tag ?? '').replace('_', '-');
  const [base, ...rest] = t.split('-');
  const code = base.toLowerCase();
  if (code === 'zh') {
    const r = rest.map((x) => x.toUpperCase());
    return r.includes('HANT') || r.includes('TW') || r.includes('HK') || r.includes('MO') ? 'zh-Hant' : 'zh-Hans';
  }
  if (code === 'no' || code === 'nn') return 'nb';
  if (code === 'iw') return 'he';
  if (code === 'in') return 'id';
  return (LANGS as readonly string[]).includes(code) ? (code as Lang) : 'en';
}

function detect(): Lang {
  // 테스트는 기존 한국어 기대값을 그대로 쓴다 (다른 언어는 APP_LANG=en 처럼 따로 확인)
  if (typeof process !== 'undefined' && process.env?.JEST_WORKER_ID !== undefined) return process.env.APP_LANG ? langOf(process.env.APP_LANG) : 'ko';
  try {
    if (Platform.OS === 'web') {
      const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('lang') : null;
      return q ? langOf(q) : 'ko';
    }
    const first = getLocales()[0];
    if (!first) return 'ko';
    return langOf(first.languageTag ?? first.languageCode);
  } catch {
    return 'ko';
  }
}

/** 앱을 켤 때 한 번 정한다 (바꾸려면 기기 언어를 바꾸고 앱을 다시 켠다) */
export const LANG: Lang = detect();
export const isKo = LANG === 'ko';
/** 세계판(한국어가 아닌 모든 언어) — 한국 전용 기능을 숨기고 영어 문장을 쓰는 쪽. 이름은 처음 영어판 때 그대로 */
export const isEn = !isKo;

// ── 번역 사전 (영어 문장 → 이 언어) ────────────────────────
const dict: Record<string, string> | null = isKo || LANG === 'en' ? null : loadDict(LANG);
const cache = new Map<string, string>();
let templates: { re: RegExp; out: string; weight: number }[] | null = null;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildTemplates(d: Record<string, string>) {
  const list: { re: RegExp; out: string; weight: number }[] = [];
  for (const [key, out] of Object.entries(d)) {
    if (!/\{\d+\}/.test(key) || !out) continue;
    const parts = key.split(/(\{\d+\})/);
    const order: number[] = [];
    const src = parts.map((p) => (/^\{\d+\}$/.test(p) ? (order.push(Number(p.slice(1, -1))), '([\\s\\S]+?)') : escapeRe(p))).join('');
    try {
      const re = new RegExp(`^${src}$`);
      // 고정 글자가 많은 틀부터 맞춰 본다 (「{0} left」보다 「{0} free sessions left」가 먼저)
      list.push({ re, out: out.replace(/\{(\d+)\}/g, (_, n) => `{${order.indexOf(Number(n))}}`), weight: key.replace(/\{\d+\}/g, '').length });
    } catch {
      // 틀이 이상하면 건너뛴다
    }
  }
  return list.sort((a, b) => b.weight - a.weight);
}

function translateCore(s: string): string {
  const exact = dict![s];
  if (exact) return exact;
  templates ??= buildTemplates(dict!);
  for (const t of templates) {
    const m = t.re.exec(s);
    // 자리에 들어간 값도 사전에 있으면 번역 (「Weekly Plan」 같은 이름)
    if (m) return t.out.replace(/\{(\d+)\}/g, (_, n) => { const v = m[Number(n) + 1] ?? ''; return dict![v] ?? v; });
  }
  return s;
}

/** 영어 문장을 지금 언어로 — 한국어판·영어판이거나 사전에 없으면 그대로 */
export function T(en: string): string {
  if (!dict || typeof en !== 'string' || !en.trim()) return en;
  const hit = cache.get(en);
  if (hit !== undefined) return hit;
  const lead = /^\s*/.exec(en)![0];
  const tail = /\s*$/.exec(en)![0];
  const core = en.slice(lead.length, en.length - tail.length);
  const out = lead + translateCore(core) + tail;
  if (cache.size < 5000) cache.set(en, out);
  return out;
}

// 객체 안에서 번역하지 않는 칸 — 저장값·식별자·내부 분류
const KEEP_FIELDS = new Set(['id', 'key', 'code', 'gender', 'relationship', 'tone', 'speech', 'category', 'kind', 'type', 'mode', 'emoji', 'icon', 'color', 'hex', 'route', 'href', 'url', 'image', 'value', 'plan', 'sku', 'productId', 'axis', 'lineKey', 'tipKey', 'topic', 'difficulty', 'mbti']);

/** 글·배열·객체 안의 영어 문장을 지금 언어로 (그림·JSX·함수는 그대로) */
export function deepT<T>(v: T): T {
  if (!dict) return v;
  if (typeof v === 'string') return T(v) as T;
  if (Array.isArray(v)) return v.map((x) => deepT(x)) as T;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && !('$$typeof' in (v as object))) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = KEEP_FIELDS.has(k) ? x : deepT(x);
    return out as T;
  }
  return v;
}

/** 한국어·세계판 중 지금 언어의 것 — 글자뿐 아니라 그림(require)·배열·JSX 도 된다. 세계판은 영어 쪽을 사전으로 번역 */
export function L<V>(ko: V, en: V): V {
  if (isKo) return ko;
  return dict ? deepT(en) : en;
}

/** 서버로 보내는 AI 요청의 언어 — 한국어가 아니면 서버가 설명을 이 언어로, 답장은 대화 언어로 만든다 */
export const AI_LANG: Lang = LANG;

/** 오른쪽→왼쪽 글자 언어 (화면 배치는 그대로 두고 글자만 — app.json 의 supportsRTL: false) */
export const isRtlLang = LANG === 'ar' || LANG === 'he';
