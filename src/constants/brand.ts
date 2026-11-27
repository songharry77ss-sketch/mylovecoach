/**
 * 앱 이름·대표 문구 — 2026-11 이름을 「센딧」으로 바꾸고 「나만의 연애 코치」는 부제로 남긴다.
 * 화면·알림·공유 문구는 여기 값을 쓴다 (스토어 문구는 docs/STORE_LISTING.md).
 *
 * 영어판(2026-11-27~)은 이름이 「My Love Coach」 — 「Sendit」 은 해외 스토어에 같은 이름의 큰 앱이 있어 쓰지 않는다.
 * ⚠️ 서버(api/coach.ts)도 불러 쓰는 파일이라 @/lib/i18n 을 불러오지 않는다. 화면에서 `L(APP_NAME, APP_NAME_EN)` 처럼 고른다.
 */
export const APP_NAME = '센딧';
export const APP_NAME_EN = 'My Love Coach';
export const APP_SUBTITLE = '나만의 연애 코치';
export const APP_SUBTITLE_EN = 'Your AI dating coach';
/** 스토어·공유 카드처럼 이름과 부제를 같이 적을 때 */
export const APP_FULL_NAME = `${APP_NAME} - ${APP_SUBTITLE}`;
export const APP_FULL_NAME_EN = `${APP_NAME_EN} - ${APP_SUBTITLE_EN}`;

/** 시작 화면 문구 — 한국어·영어를 `L(SPLASH_COPY, SPLASH_COPY_EN)` 으로 고를 수 있게 같은 모양(글자 타입)으로 둔다 */
export interface SplashCopy {
  readonly lead: string;
  readonly main: string;
}
/** 시작 화면 문구 (스플래시 시안 B: 「생각났으면, 지금 센딧.」) */
export const SPLASH_COPY: SplashCopy = { lead: '생각났으면,', main: '지금 센딧.' };
/** 영어판 시작 화면 문구 — 이름 말장난(센딧=보내)은 영어로 옮길 수 없어 새로 썼다 */
export const SPLASH_COPY_EN: SplashCopy = { lead: 'Not sure what to text?', main: 'Ask your coach.' };

/** 누가 만들었는지 — 회의(11-06) 문구 「연애 특화된 고려대학교 심리학 연구진이 개발한」 */
export const RESEARCH_LINE = '고려대학교 심리학 연구진이 개발한 연애 특화 AI 코치';
export const RESEARCH_LINE_EN = 'Developed with psychology researchers at Korea University';
export const RESEARCH_SHORT = '고려대 심리학 연구진이 만든 연애 특화 AI';
export const RESEARCH_SHORT_EN = 'Built with Korea University psychology researchers';
