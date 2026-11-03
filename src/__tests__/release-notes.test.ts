/**
 * lib/release-notes.ts — 스토어 「이번 버전의 새로운 기능」 문구를 새 버전 안내에 쓰는 모양으로 읽기.
 */
import { cleanNotes, NOTE_MAX_CHARS, whatsNewFor } from '@/lib/release-notes';

const MD = ['# 스토어 문구', '', '## 이번 버전의 새로운 기능 (1.0.8)', '', '- 대화가 빨라졌어요.', '- 화면을 다듬었어요.', '', '## 이번 버전의 새로운 기능 (1.0.3 초안)', '- 예전 소식', '', '## 심사 메모', '내부용'].join('\n');

describe('새 소식 읽기', () => {
  it('그 버전 제목 아래 bullet 만 읽는다 (다음 제목에서 멈춘다)', () => {
    expect(whatsNewFor(MD, '1.0.8')).toEqual(['대화가 빨라졌어요.', '화면을 다듬었어요.']);
    expect(whatsNewFor(MD, '1.0.3')).toEqual(['예전 소식']);
  });

  it('버전이 없거나, 비슷한 번호이거나, bullet 이 아닌 줄이 섞이면 빈 목록', () => {
    expect(whatsNewFor(MD, '1.0.9')).toEqual([]);
    expect(whatsNewFor(MD, '1.0')).toEqual([]);
    expect(whatsNewFor('## 이번 버전의 새로운 기능 (1.0.8)\n내부 메모\n- 소식', '1.0.8')).toEqual([]);
  });

  it('서버 값은 글자만, 세 줄까지, 너무 길면 줄여서 쓴다', () => {
    expect(cleanNotes(['  하나  ', 2, '', '둘', '셋', '넷'])).toEqual(['하나', '둘', '셋']);
    expect(cleanNotes('하나')).toEqual([]);
    expect(cleanNotes(null)).toEqual([]);
    const [long] = cleanNotes(['가'.repeat(300)]);
    expect(long).toHaveLength(NOTE_MAX_CHARS);
    expect(long.endsWith('…')).toBe(true);
  });
});
