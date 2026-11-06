/**
 * 앱 이름·대표 문구 — 2026-11 이름을 「센딧」으로 바꾸고 「나만의 연애 코치」는 부제로 남긴다.
 * 화면·알림·공유 문구는 여기 값을 쓴다 (스토어 문구는 docs/STORE_LISTING.md).
 */
export const APP_NAME = '센딧';
export const APP_NAME_EN = 'Sendit';
export const APP_SUBTITLE = '나만의 연애 코치';
/** 스토어·공유 카드처럼 이름과 부제를 같이 적을 때 */
export const APP_FULL_NAME = `${APP_NAME} - ${APP_SUBTITLE}`;

/** 시작 화면 문구 (스플래시 시안 B: 「생각났으면, 지금 센딧.」) */
export const SPLASH_COPY = { lead: '생각났으면,', main: '지금 센딧.' } as const;

/** 누가 만들었는지 — 회의(11-06) 문구 「연애 특화된 고려대학교 연구진이 개발한」 */
export const RESEARCH_LINE = '고려대학교 연구진이 개발한 연애 특화 AI 코치';
export const RESEARCH_SHORT = '고려대 연구진이 만든 연애 특화 AI';
