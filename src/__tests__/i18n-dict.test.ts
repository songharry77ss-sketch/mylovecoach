/**
 * 세계판 번역 사전 — 영어 문장을 열쇠로 다른 언어를 찾는다 (src/lib/i18n.ts 의 T·deepT·L).
 * 가짜 일본어 사전으로 정확히 같은 문장 · 숫자가 든 틀 · 객체 안의 저장값 보호 · 사전에 없는 문장을 확인한다.
 */
const FAKE_JA: Record<string, string> = {
  'Get reply ideas': '返信のアイデアをもらう',
  '{0} free sessions left': '無料セッション残り{0}回',
  'Sign up to see reply {0}': '登録すると返信{0}が見られます',
  '{0} min ago': '{0}分前',
  'Weekly Plan': '週間プラン',
  'Upgrade to {0}': '{0}にアップグレード',
  Them: 'あの人',
};

function loadWith(lang: string, dict: Record<string, string> | null) {
  let mod: typeof import('@/lib/i18n') | undefined;
  const prev = process.env.APP_LANG;
  process.env.APP_LANG = lang;
  jest.isolateModules(() => {
    jest.doMock('@/i18n/dicts', () => ({ loadDict: () => dict }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@/lib/i18n');
  });
  process.env.APP_LANG = prev;
  return mod!;
}

describe('세계판 번역 사전', () => {
  it('기기 언어 태그를 앱 언어로', () => {
    const { langOf } = loadWith('ko', null);
    expect(langOf('ko-KR')).toBe('ko');
    expect(langOf('zh-Hant-TW')).toBe('zh-Hant');
    expect(langOf('zh-HK')).toBe('zh-Hant');
    expect(langOf('zh-CN')).toBe('zh-Hans');
    expect(langOf('pt-BR')).toBe('pt');
    expect(langOf('no')).toBe('nb');
    expect(langOf('iw-IL')).toBe('he');
    expect(langOf('sw-KE')).toBe('en'); // 지원하지 않는 언어는 영어
  });

  it('일본어: 같은 문장·틀 문장·자리 값 번역', () => {
    const { T, L, isKo, isEn, LANG } = loadWith('ja', FAKE_JA);
    expect(LANG).toBe('ja');
    expect(isKo).toBe(false);
    expect(isEn).toBe(true);
    expect(T('Get reply ideas')).toBe('返信のアイデアをもらう');
    expect(T('3 free sessions left')).toBe('無料セッション残り3回');
    expect(T('Sign up to see reply 2')).toBe('登録すると返信2が見られます');
    expect(T('Upgrade to Weekly Plan')).toBe('週間プランにアップグレード');
    expect(T('  Get reply ideas ')).toBe('  返信のアイデアをもらう ');
    expect(T('Not in the dictionary')).toBe('Not in the dictionary');
    expect(L('답장 추천받기', 'Get reply ideas')).toBe('返信のアイデアをもらう');
  });

  it('객체는 저장값·식별자 칸을 번역하지 않는다', () => {
    const { L } = loadWith('ja', FAKE_JA);
    const v = L([{ id: 'Them', title: 'Them', gender: 'female' }], [{ id: 'Them', title: 'Them', gender: 'female' }]);
    expect(v).toEqual([{ id: 'Them', title: 'あの人', gender: 'female' }]);
  });

  it('영어·한국어판은 사전을 쓰지 않는다', () => {
    const en = loadWith('en', FAKE_JA);
    expect(en.T('Get reply ideas')).toBe('Get reply ideas');
    const ko = loadWith('ko', FAKE_JA);
    expect(ko.L('답장 추천받기', 'Get reply ideas')).toBe('답장 추천받기');
  });
});
