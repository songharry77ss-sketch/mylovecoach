import { isEn } from '@/lib/i18n';

/**
 * 이름을 안 적은 상대 — 스토어·서버는 이름 칸에 '상대' 를 넣어 「이름 없음」을 안다.
 * 영어판에서 이 저장값이 'Them' 으로 바뀌어도 알아보게 둘 다 본다 (한국어판은 지금 그대로 '상대' 만)
 */
export function isUnnamedCrush(name?: string | null): boolean {
  return name === '상대' || (isEn && name === 'Them');
}

/** 화면에 보일 상대 이름 — 영어판은 이름 없는 상대를 「Your crush」로 (한국어판은 저장값 그대로) */
export function crushDisplayName(name: string): string {
  return isEn && isUnnamedCrush(name) ? 'Your crush' : name;
}
