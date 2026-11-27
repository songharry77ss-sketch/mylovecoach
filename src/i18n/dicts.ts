/**
 * 언어별 번역 사전 (영어 문장 → 그 언어). 앱(iOS·안드로이드) 전용 — 웹은 dicts.web.ts (사전을 싣지 않음).
 * 사전은 Codex 가 번역한다: node tools/i18n/extract-en.mjs → docs/codex/tasks/i18n-*.md → node tools/i18n/check-dicts.mjs
 * 필요한 언어 하나만 처음 쓸 때 읽는다.
 */
export function loadDict(lang: string): Record<string, string> | null {
  switch (lang) {
    case 'ja':
      return require('./dict/ja.json');
    case 'zh-Hans':
      return require('./dict/zh-Hans.json');
    case 'zh-Hant':
      return require('./dict/zh-Hant.json');
    case 'es':
      return require('./dict/es.json');
    case 'pt':
      return require('./dict/pt.json');
    case 'fr':
      return require('./dict/fr.json');
    case 'de':
      return require('./dict/de.json');
    case 'it':
      return require('./dict/it.json');
    case 'ru':
      return require('./dict/ru.json');
    case 'tr':
      return require('./dict/tr.json');
    case 'id':
      return require('./dict/id.json');
    case 'vi':
      return require('./dict/vi.json');
    case 'th':
      return require('./dict/th.json');
    case 'ar':
      return require('./dict/ar.json');
    case 'hi':
      return require('./dict/hi.json');
    case 'pl':
      return require('./dict/pl.json');
    case 'nl':
      return require('./dict/nl.json');
    case 'sv':
      return require('./dict/sv.json');
    case 'da':
      return require('./dict/da.json');
    case 'nb':
      return require('./dict/nb.json');
    case 'fi':
      return require('./dict/fi.json');
    case 'cs':
      return require('./dict/cs.json');
    case 'sk':
      return require('./dict/sk.json');
    case 'hu':
      return require('./dict/hu.json');
    case 'ro':
      return require('./dict/ro.json');
    case 'uk':
      return require('./dict/uk.json');
    case 'el':
      return require('./dict/el.json');
    case 'he':
      return require('./dict/he.json');
    case 'hr':
      return require('./dict/hr.json');
    case 'ms':
      return require('./dict/ms.json');
    case 'ca':
      return require('./dict/ca.json');
    default:
      return null;
  }
}
