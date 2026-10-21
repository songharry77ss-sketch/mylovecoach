/**
 * 개인정보 안내 문구 — 첫 화면 동의 창(components/consent/start-consent-sheet), 마이 → 개인정보 설정(app/settings/privacy),
 * 홈의 바뀐 안내 카드가 같이 쓴다. 개인정보 처리방침(site/privacy.html 1번 표·4번)에 적힌 내용만 쓴다 — 처리방침을 고치면 여기도 같이 고칠 것.
 */
import { APP_CONFIG } from '@/lib/config';

/** 서비스 이용 기록 (기본 수집 — 처리방침 4번 #analytics). 동의 항목이 아니라 알림이다 */
export const BASIC_LOG_NOTICE =
  '앱을 쓰는 동안 생기는 이용 기록(화면 이동·머문 시간, 버튼 이용, 결제 진행 단계, 처음 들어온 경로, 기기 ID, 성별·나이·MBTI)은 ' +
  '서비스 제공·개선, 결제 오류 확인, 부정 이용 방지를 위해 자동으로 수집돼요. 1년 보관하고, 만 14세 미만은 수집하지 않아요. 이름·대화 내용·캡처는 담기지 않아요.';

/** 같은 내용의 긴 안내 (개인정보 설정 화면) — 보관 기간·처리하는 회사·처리 정지 방법까지 */
export const BASIC_LOG_DETAIL =
  '화면·버튼 기록과 처음 들어온 경로는 수집일로부터 1년, 기기 ID·프로필은 마지막 이용일로부터 1년이 지나면 지워요. ' +
  '미국 회사 Vercel(중계)·Supabase(보관, 서울 리전)가 처리해요(국외 이전). 처리 정지나 삭제를 원하면 아래 메일로 요청해 주세요 — 10일 안에 처리해요.';

/** 「코칭 내용 저장」(선택 동의 — 처리방침 4번 #content) */
export const CONTENT_CONSENT_TITLE = '코칭 내용 저장';
export const CONTENT_CONSENT_SUMMARY = '더 나은 코칭을 위해 질문·답변을 서버에 보관해요';
export const CONTENT_CONSENT_DETAIL =
  '질문·상황 글(붙여 넣은 대화 포함), 상대 정보(별명·성별·나이·MBTI·관계), 코치 답변을 코칭 품질 개선을 위해 1년 보관해요. ' +
  '미국 회사 Vercel(중계)·Supabase(보관, 서울 리전)가 처리해요(국외 이전). 캡처 이미지는 저장하지 않고, 만 14세 미만은 저장하지 않아요. ' +
  '동의하지 않아도 모든 기능을 쓸 수 있고, 마이 → 개인정보 설정에서 언제든 끌 수 있어요(끄면 저장된 내용도 지워요).';

export const privacyUrl = (section?: 'analytics' | 'content') => (section ? `${APP_CONFIG.privacyUrl}#${section}` : APP_CONFIG.privacyUrl);

/** 처리 정지·삭제 요청 메일 (기기 ID 를 적어 보내야 그 기기의 기록을 찾을 수 있다) */
export function optOutMailUrl(deviceId: string): string {
  const subject = '[나만의 연애코치] 이용 기록 처리 정지·삭제 요청';
  const body = `아래 기기의 서비스 이용 기록 처리 정지와 삭제를 요청합니다.\n\n기기 ID: ${deviceId}\n요청 내용(처리 정지 / 삭제 / 둘 다): `;
  return `mailto:${APP_CONFIG.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
