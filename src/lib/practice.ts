/** 연애 연습 도우미 — 실제 상대로 연습 상대 만들기, 결과 판정 */
import { createId } from '@/lib/id';
import type { Crush, Gender, PracticePersona, PracticeSession, Relationship } from '@/lib/types';

/** 한 번의 연습에서 보낼 수 있는 내 메시지 수 */
export const PRACTICE_MAX_TURNS = 12;

const PASTELS = ['#FFE1E9', '#D9EEFF', '#EDE9FF', '#E3F9F1', '#FFEFE3', '#FFF6D6'];

const genderEmoji = (g: Gender) => (g === 'male' ? '🧑🏻' : g === 'female' ? '👩🏻' : '🙂');

export function defaultOpener(speech: 'polite' | 'casual', relationship: Relationship): string {
  if (speech === 'polite') {
    if (relationship === 'blind_date') return '어제 잘 들어가셨어요? ㅎㅎ 덕분에 즐거웠어요';
    return '안녕하세요 ㅎㅎ 오늘 하루 어떠셨어요?';
  }
  if (relationship === 'dating') return '자기야 뭐해? 나 방금 퇴근 🥱';
  if (relationship === 'ex') return '…잘 지냈어?';
  return '뭐해? ㅋㅋ';
}

/** 내 채팅방의 실제 상대 정보로 연습 상대를 만든다 */
export function personaFromCrush(crush: Crush): PracticePersona {
  const speech = crush.speech && crush.speech !== 'auto' ? crush.speech : (crush.detected?.speech ?? (crush.relationship === 'blind_date' ? 'polite' : 'casual'));
  return {
    id: `crush_${crush.id}`,
    name: crush.name,
    emoji: genderEmoji(crush.gender),
    gender: crush.gender,
    age: crush.age ?? 27,
    mbti: crush.mbti ?? 'ENFP',
    job: '',
    style: crush.style.slice(0, 4),
    relationship: crush.relationship,
    scenario: `${crush.name}님 정보로 만든 연습 상대예요.${crush.notes.trim() ? ` (${crush.notes.trim().slice(0, 60)})` : ''} 실제로 보내기 전에 미리 연습해 보세요.`,
    opener: defaultOpener(speech, crush.relationship),
    speech,
    difficulty: 2,
    hint: crush.report?.data.strategy[0] ?? '질문 하나 + 리액션 한 줄의 리듬을 지켜 보세요.',
    color: PASTELS[crush.id.length % PASTELS.length],
  };
}

export interface CustomPersonaInput {
  name: string;
  gender: Gender;
  age: number;
  mbti: string;
  style: string[];
  relationship: Relationship;
  scenario: string;
  speech: 'polite' | 'casual';
  difficulty: 1 | 2 | 3;
}

export function customPersona(input: CustomPersonaInput): PracticePersona {
  return {
    ...input,
    id: createId('custom_'),
    emoji: genderEmoji(input.gender),
    job: '',
    opener: defaultOpener(input.speech, input.relationship),
    hint: '상대 말투에 맞춰 짧게, 질문으로 이어가 보세요.',
    color: PASTELS[Math.floor(Math.random() * PASTELS.length)],
  };
}

export function myTurnCount(session: PracticeSession): number {
  return session.turns.filter((t) => t.role === 'me').length;
}

/** 연습 결과 한 줄 평가 */
export function practiceVerdict(heat: number): { title: string; emoji: string; body: string } {
  if (heat >= 60) return { title: '연애 고수', emoji: '🔥', body: '상대가 완전히 빠져들었어요. 실전에서도 이 느낌 그대로!' };
  if (heat >= 30) return { title: '썸 가능성 높음', emoji: '💗', body: '호감이 쌓이고 있어요. 약속 제안까지 한 걸음이에요.' };
  if (heat >= 10) return { title: '나쁘지 않아요', emoji: '🌤️', body: '대화는 이어졌지만 설렘 포인트가 조금 아쉬워요.' };
  if (heat >= 0) return { title: '조금 더 연습', emoji: '🌱', body: '질문으로 이어가고, 리액션을 한 줄 더 붙여 보세요.' };
  return { title: '다시 도전', emoji: '🧊', body: '부담스러웠을 수 있어요. 코치 피드백을 보고 다시 해 봐요.' };
}

/** 가장 크게 온도를 올린 내 메시지 */
export function bestLine(session: PracticeSession) {
  return session.turns.filter((t) => t.role === 'me' && (t.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0];
}
