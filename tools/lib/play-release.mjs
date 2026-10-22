// Play 트랙 출시 정보(이름·새로운 기능)를 만든다. 인증·네트워크 없음 — play-upload.mjs 가 쓴다.
import { readWhatsNew } from './asc-release-guard.mjs';

// Play 출시 노트는 언어마다 500자까지
export const PLAY_NOTES_MAX = 500;

/** STORE_LISTING.md 의 「이번 버전의 새로운 기능 (버전)」을 Play 출시 노트(ko-KR)로 바꾼다. */
export function playReleaseNotes(markdown, versionString) {
  const text = readWhatsNew(markdown, versionString);
  if ([...text].length > PLAY_NOTES_MAX) throw new Error(`버전 ${versionString}의 새 소식이 Play 한도 ${PLAY_NOTES_MAX}자를 넘습니다 (${[...text].length}자).`);
  return [{ language: 'ko-KR', text }];
}

/** 트랙에 넣을 출시 하나. 출시 이름은 「versionCode (앱 버전)」— 콘솔에서 어떤 판인지 바로 보이게. */
export function playRelease({ versionCode, versionString, status, notes }) {
  if (!Number.isInteger(versionCode) || versionCode <= 0) throw new Error('versionCode 가 올바르지 않습니다.');
  const release = { name: versionString ? `${versionCode} (${versionString})` : `${versionCode}`, versionCodes: [String(versionCode)], status };
  if (notes?.length) release.releaseNotes = notes;
  return release;
}
