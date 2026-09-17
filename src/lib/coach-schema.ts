/**
 * 코치 요청/응답 스키마와 프롬프트.
 * 앱(직접 호출 모드)과 서버(api/coach.ts) 양쪽에서 같은 파일을 사용합니다.
 * 따라서 이 파일은 React Native / Node 모두에서 동작하도록 순수 TS로만 작성합니다.
 */
import { z } from 'zod';

import type { Crush, HistoryTurn, Tone, UserProfile } from './types';

export const COACH_MODEL = 'claude-opus-5';

export const ToneSchema = z.enum(['natural', 'flirty', 'witty', 'cool', 'sincere']);
export const TemperatureSchema = z.enum(['hot', 'warm', 'neutral', 'cold', 'unknown']);

export const CoachReplySchema = z.object({
  tone: ToneSchema.describe('이 답장의 톤'),
  text: z.string().describe('상대에게 그대로 보낼 수 있는 답장 문구. 실제 메신저처럼 짧고 자연스럽게.'),
  why: z.string().describe('이 답장이 효과적인 이유 한 문장'),
});

export const CoachAnalysisSchema = z.object({
  summary: z.string().describe('코치의 핵심 메시지. 2~4문장, 친근한 존댓말.'),
  temperature: TemperatureSchema.describe('상대의 호감 온도'),
  interestScore: z.number().nullable().describe('0~100 호감 점수. 판단할 근거가 부족하면 null'),
  insights: z.array(z.string()).describe('대화에서 읽어낸 포인트 2~4개. 각 항목은 한 문장.'),
  replies: z.array(CoachReplySchema).describe('추천 답장 0~3개. 답장이 필요 없는 질문이면 빈 배열.'),
  nextStep: z.string().describe('다음 스텝 제안 한두 문장 (예: 이번 주 안에 가볍게 약속 제안하기)'),
  warnings: z.array(z.string()).describe('주의할 점. 없으면 빈 배열.'),
});

export type CoachAnalysisOutput = z.infer<typeof CoachAnalysisSchema>;

export const CoachImageSchema = z.object({
  base64: z.string().min(1),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
});

export const CoachRequestSchema = z.object({
  crush: z.object({
    name: z.string(),
    gender: z.enum(['female', 'male', 'other']),
    age: z.number().optional(),
    mbti: z.string().optional(),
    relationship: z.enum(['crush', 'talking', 'blind_date', 'friend', 'dating', 'ex']),
    style: z.array(z.string()),
    notes: z.string(),
  }),
  user: z.object({
    name: z.string(),
    gender: z.enum(['female', 'male', 'other']),
    age: z.number().optional(),
    mbti: z.string().optional(),
    style: z.array(z.string()),
  }),
  tone: ToneSchema,
  /** 사용자가 적은 질문 또는 상황 설명 */
  text: z.string().optional(),
  /** 대화 캡처 (선택) */
  image: CoachImageSchema.optional(),
  /** 최근 대화 맥락 */
  history: z
    .array(
      z.object({
        userNote: z.string().optional(),
        coachSummary: z.string().optional(),
        chosenReply: z.string().optional(),
      }),
    )
    .max(8)
    .default([]),
});

export type CoachRequest = z.infer<typeof CoachRequestSchema>;
export type CoachRequestInput = z.input<typeof CoachRequestSchema>;

const TONE_GUIDE: Record<Tone, string> = {
  natural: '자연스럽게: 부담 없이 대화가 이어지도록, 과하지 않게.',
  flirty: '설레게: 은근한 호감과 관심이 느껴지도록. 다만 느끼하거나 부담스럽지 않게.',
  witty: '유머러스: 가볍게 웃음을 주되 상대를 놀리거나 비하하지 않게.',
  cool: '쿨하게: 여유 있고 담백하게. 매달리는 느낌 없이.',
  sincere: '진심으로: 솔직하고 따뜻하게. 감정을 과장하지 않게.',
};

const RELATIONSHIP_KO: Record<CoachRequest['crush']['relationship'], string> = {
  crush: '짝사랑 중 (아직 상대는 마음을 모름)',
  talking: '썸 타는 중',
  blind_date: '소개팅으로 만난 사이',
  friend: '친구 사이 (더 가까워지고 싶음)',
  dating: '연인 사이',
  ex: '헤어진 뒤 재회를 바라는 사이',
};

const GENDER_KO = { female: '여성', male: '남성', other: '기타' } as const;

/**
 * 시스템 프롬프트는 요청마다 바뀌지 않도록 고정 문자열로 둡니다 (프롬프트 캐시).
 */
export const COACH_SYSTEM_PROMPT = `당신은 "나만의 연애코치"입니다. 한국의 20~30대가 카카오톡·인스타 DM 등 메신저로 나누는 연애 대화를 코칭하는 전문가예요.

역할
- 사용자가 올린 대화 캡처(스크린샷)와 상대방 프로필(이름, 나이, MBTI, 성향 태그, 관계 단계), 사용자 본인의 프로필을 종합해 상황을 읽고, 바로 보낼 수 있는 답장을 추천합니다.
- 카카오톡 캡처에서는 보통 오른쪽(노란색 말풍선)이 사용자 본인, 왼쪽(흰색 말풍선)이 상대방입니다. 인스타 DM은 오른쪽(파란/보라색)이 본인입니다. 화면 상단 이름이 상대 이름과 같으면 그 기준으로 판단하세요. 확실하지 않으면 insights에 그 사실을 짧게 밝히세요.
- 캡처 없이 텍스트 질문만 있으면 그 질문에 코치로서 답하고, 답장 문구가 필요 없는 질문이면 replies를 빈 배열로 두세요.

답장 작성 원칙
- 대화에서 쓰인 말투(반말/존댓말, 이모티콘 사용량, 문장 길이)를 그대로 따라가세요. 상대가 "ㅋㅋ"를 쓰면 비슷한 온도로.
- 실제 메신저 답장처럼 짧게. 보통 1~2문장, 길어도 3문장. 여러 문장은 줄바꿈 없이 자연스럽게.
- 추천 답장 3개는 서로 다른 각도(질문으로 이어가기 / 공감+살짝 유머 / 약속·다음 만남으로 연결 등)로 제시하세요. 첫 번째 답장은 요청한 톤을 가장 잘 따르는 것으로.
- 상대의 MBTI와 성향 태그를 참고하되 단정하지 마세요. (예: I 성향이면 부담스럽지 않은 질문, P 성향이면 유연한 제안)
- 유행어를 억지로 쓰거나 느끼한 멘트, 오글거리는 비유는 피하세요. 요즘 한국 20~30대가 실제로 쓰는 자연스러운 문장으로.
- 상대의 이름을 부를 때는 캡처에 보이는 호칭을 따르세요.

호감 온도 판단
- hot: 먼저 연락, 빠른 답장, 질문·약속 제안, 이모티콘/애정표현이 뚜렷함
- warm: 답장이 성실하고 대화를 이어가려는 노력이 보임
- neutral: 무난하지만 판단할 신호가 부족함
- cold: 단답, 늦은 답장, 대화 마무리 신호, 약속 회피
- unknown: 캡처가 없거나 판단할 근거가 거의 없음
- interestScore는 0~100 정수. unknown이면 null.

반드시 지킬 것
- 상대가 거절, 불편함, 연락 중단 의사를 보이면 그 의사를 존중하도록 안내하고, 밀어붙이는 답장은 제안하지 마세요.
- 거짓말, 조종, 질투 유발, 집착을 부추기는 조언은 하지 마세요. 건강하고 존중하는 관계를 지향합니다.
- 상대를 비하하거나 외모·조건을 평가하는 표현은 쓰지 마세요.
- summary와 insights, nextStep, warnings는 사용자에게 말하는 친근한 존댓말("~해요", "~해보세요")로 씁니다.
- 출력은 오직 요청된 JSON 구조로만 합니다.`;

export function buildProfileBlock(req: CoachRequest): string {
  const { crush, user } = req;
  const lines: string[] = [];
  lines.push(`[상대방 프로필]`);
  lines.push(`- 이름: ${crush.name}`);
  lines.push(`- 성별: ${GENDER_KO[crush.gender]}`);
  if (crush.age) lines.push(`- 나이: ${crush.age}세`);
  if (crush.mbti) lines.push(`- MBTI: ${crush.mbti}`);
  lines.push(`- 관계 단계: ${RELATIONSHIP_KO[crush.relationship]}`);
  if (crush.style.length) lines.push(`- 성향/스타일: ${crush.style.join(', ')}`);
  if (crush.notes.trim()) lines.push(`- 메모: ${crush.notes.trim()}`);
  lines.push('');
  lines.push(`[사용자(나) 프로필]`);
  lines.push(`- 이름: ${user.name}`);
  lines.push(`- 성별: ${GENDER_KO[user.gender]}`);
  if (user.age) lines.push(`- 나이: ${user.age}세`);
  if (user.mbti) lines.push(`- MBTI: ${user.mbti}`);
  if (user.style.length) lines.push(`- 나의 스타일: ${user.style.join(', ')}`);
  return lines.join('\n');
}

export function buildHistoryBlock(history: HistoryTurn[]): string {
  if (!history.length) return '';
  const lines = ['[최근 코칭 맥락 (오래된 순)]'];
  history.forEach((h, i) => {
    const parts: string[] = [];
    if (h.userNote) parts.push(`사용자: ${h.userNote}`);
    if (h.coachSummary) parts.push(`코치: ${h.coachSummary}`);
    if (h.chosenReply) parts.push(`사용자가 보낸 답장: "${h.chosenReply}"`);
    if (parts.length) lines.push(`${i + 1}. ${parts.join(' / ')}`);
  });
  return lines.join('\n');
}

export function buildTaskBlock(req: CoachRequest): string {
  const lines: string[] = [];
  lines.push(`[요청]`);
  lines.push(`- 원하는 답장 톤: ${TONE_GUIDE[req.tone]}`);
  if (req.image) {
    lines.push(`- 첨부한 대화 캡처를 분석해서 상황을 읽고, 위 톤으로 답장 3개를 추천해주세요.`);
  }
  if (req.text?.trim()) {
    lines.push(`- 사용자의 말: "${req.text.trim()}"`);
  }
  if (!req.image && !req.text?.trim()) {
    lines.push(`- 현재 상황에서 어떻게 대화를 시작하면 좋을지 답장(첫 메시지) 3개를 추천해주세요.`);
  }
  return lines.join('\n');
}

/** 사용자 턴에 들어갈 텍스트 전체 */
export function buildUserText(req: CoachRequest): string {
  const blocks = [buildProfileBlock(req), buildHistoryBlock(req.history), buildTaskBlock(req)].filter(Boolean);
  return blocks.join('\n\n');
}

/**
 * Anthropic Messages API 요청 본문 (모델/시스템/메시지/출력 형식).
 * 서버는 SDK로, 앱 직접 호출 모드는 fetch로 같은 본문을 사용합니다.
 */
export function buildMessageContent(req: CoachRequest) {
  const content: (
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: CoachRequest['image'] extends infer I ? (I extends { mediaType: infer M } ? M : never) : never; data: string } }
  )[] = [];
  if (req.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: req.image.mediaType, data: req.image.base64 },
    });
  }
  content.push({ type: 'text', text: buildUserText(req) });
  return content;
}

/** JSON Schema (직접 호출 모드용) */
export function coachOutputJsonSchema() {
  return z.toJSONSchema(CoachAnalysisSchema, { target: 'draft-2020-12', io: 'output' });
}

/** 모델 출력 후처리: 점수 범위/개수 보정 */
export function normalizeAnalysis(a: CoachAnalysisOutput): CoachAnalysisOutput {
  const score =
    a.interestScore === null || Number.isNaN(a.interestScore)
      ? null
      : Math.max(0, Math.min(100, Math.round(a.interestScore)));
  return {
    ...a,
    interestScore: a.temperature === 'unknown' ? null : score,
    insights: a.insights.filter((s) => s.trim()).slice(0, 5),
    replies: a.replies.filter((r) => r.text.trim()).slice(0, 3),
    warnings: a.warnings.filter((s) => s.trim()).slice(0, 3),
  };
}

export function crushToRequest(crush: Crush): CoachRequest['crush'] {
  return {
    name: crush.name,
    gender: crush.gender,
    age: crush.age,
    mbti: crush.mbti,
    relationship: crush.relationship,
    style: crush.style,
    notes: crush.notes,
  };
}

export function userToRequest(user: UserProfile): CoachRequest['user'] {
  return { name: user.name, gender: user.gender, age: user.age, mbti: user.mbti, style: user.style };
}
