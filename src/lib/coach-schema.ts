/**
 * 코치 요청/응답 스키마와 프롬프트.
 * 앱(직접 호출 모드)과 서버(api/coach.ts) 양쪽에서 같은 파일을 사용합니다.
 * 따라서 이 파일은 React Native / Node 모두에서 동작하도록 순수 TS로만 작성합니다.
 */
import { z } from 'zod';

import { retrieveKnowledge } from './knowledge';
import type { Crush, HistoryTurn, Tone, UserProfile } from './types';

export const COACH_MODEL = 'claude-opus-5-5';

export const ToneSchema = z.enum(['natural', 'flirty', 'witty', 'cool', 'sincere']);
export const TemperatureSchema = z.enum(['hot', 'warm', 'neutral', 'cold', 'unknown']);
export const GenderSchema = z.enum(['female', 'male', 'other']);
export const RelationshipSchema = z.enum(['crush', 'talking', 'blind_date', 'friend', 'dating', 'ex']);
export const EmojiPrefSchema = z.enum(['auto', 'on', 'off']);

export const CoachReplySchema = z.object({
  tone: ToneSchema.describe('이 답장의 톤'),
  text: z.string().describe('상대에게 그대로 보낼 수 있는 답장 문구. 실제 메신저처럼 짧고 자연스럽게. 사용자가 쓰던 호칭과 말투(존댓말/반말)를 그대로.'),
  why: z.string().describe('이 답장이 효과적인 이유 한 문장'),
  expectedReaction: z.string().describe('이 답장을 보내면 상대가 보낼 법한 짧은 답장 예시. 상대의 말투 그대로, 따옴표 없이'),
  successRate: z.number().describe('이 답장으로 대화가 좋게 이어질 가능성 0~100 정수'),
});

export const CoachAnalysisSchema = z.object({
  callName: z.string().nullable().describe('캡처에서 사용자(나)가 상대를 부르는 호칭 (예: 언니, 오빠, 누나, 형, 선배, 쌤, 민지야, 민지 씨). 보이지 않으면 null'),
  speechLevel: z.enum(['polite', 'casual', 'mixed', 'unknown']).describe('캡처에서 사용자(나)가 상대에게 쓰는 말투. 존댓말 polite / 반말 casual / 섞임 mixed / 판단 불가 unknown'),
  summary: z.string().describe('코치의 핵심 메시지. 2~4문장, 친근한 존댓말.'),
  temperature: TemperatureSchema.describe('상대의 호감 온도'),
  interestScore: z.number().nullable().describe('0~100 호감 점수. 판단할 근거가 부족하면 null'),
  heatDelta: z.number().describe('이번 대화로 누적 호감 온도가 움직이는 폭. -20~+20 정수. 판단 근거가 없으면 0'),
  insights: z.array(z.string()).describe('대화에서 읽어낸 포인트 2~4개. 각 항목은 한 문장.'),
  replies: z.array(CoachReplySchema).describe('추천 답장 0~3개. 답장이 필요 없는 질문이면 빈 배열.'),
  nextStep: z.string().describe('다음 스텝 제안 한두 문장 (예: 이번 주 안에 가볍게 약속 제안하기)'),
  warnings: z.array(z.string()).describe('주의할 점. 없으면 빈 배열.'),
});

export type CoachAnalysisOutput = z.infer<typeof CoachAnalysisSchema>;

/**
 * 응답을 읽을 때 쓰는 너그러운 스키마.
 * 새로 추가한 항목(호칭·말투·온도 변화·성공 확률·예상 반응)이 없는 예전 서버 응답도 받아들인다.
 */
export const CoachAnalysisReadSchema = CoachAnalysisSchema.extend({
  callName: z.string().nullable().optional(),
  speechLevel: z.enum(['polite', 'casual', 'mixed', 'unknown']).optional(),
  heatDelta: z.number().optional(),
  replies: z.array(CoachReplySchema.extend({ expectedReaction: z.string().optional(), successRate: z.number().optional() })),
});
export type CoachAnalysisRead = z.infer<typeof CoachAnalysisReadSchema>;

/**
 * 서버가 받는 입력 길이 상한 (비용·남용 방지). 서버와 앱이 같은 스키마를 쓴다.
 * 앱이 보낼 수 있는 값보다 넉넉하게 커서 예전 앱 요청도 그대로 통과한다 —
 * 앱 입력창: 코칭 글 800자(빠른 코칭 붙여넣기 약 730자), 상대 이름 20자·메모 500자, 내 이름 20자, 태그는 미리 정한 짧은 말 6개까지.
 * 코칭 1건에 사용자가 정할 수 있는 글은 최대 약 2만 6,500자(지난 기록 8턴 2만 자 포함)다. 상한은 글자(UTF-16) 수라
 * 드문 한글 음절·한자는 글자당 3토큰까지 갈 수 있어, 최악은 입력 약 8만 토큰으로 잡는다
 */
export const REQUEST_LIMITS = {
  /** 코칭 글 (앱 800자 + 「다른 답장」 안내 문장) */
  text: 2_000,
  /** 상대·내 이름 (앱 20자) */
  name: 100,
  /** 상대 메모 (앱 500자) */
  notes: 2_000,
  mbti: 10,
  /** 성향·추구미 태그 한 개 (앱 태그는 10자 안팎) */
  tag: 40,
  /** 태그 개수 (앱 최대 6개) */
  tags: 20,
  /** 최근 코칭 맥락 한 턴의 내 글 (앱 800자) — 지난 기록 칸은 넘으면 잘라서 받으니 앱 값보다 조금만 크게 */
  historyNote: 1_000,
  /** 최근 코칭 맥락의 코치 요약 (AI 가 쓴 2~4문장, 보통 300자 안쪽) */
  historySummary: 1_000,
  /** 최근 코칭 맥락의 보낸 답장 (AI 가 쓴 1~3문장) */
  historyReply: 500,
} as const;

/**
 * 캡처 상한 (base64 글자 수 4.2MB ≈ 원본 3.1MB). Vercel 요청 본문 한도(4.5MB) 바로 아래라서,
 * 다른 칸을 상한까지 채워도(한글 UTF-8 로 0.15MB 안쪽) 본문이 플랫폼 한도 안에 들어간다 — 예전에도 Vercel 에서 막혔을 요청만 막힌다.
 * Gemini 는 해상도 설정(MEDIUM)에 따라 이미지 1장에 정해진 토큰만 쓰므로 이 상한은 비용이 아니라 본문 크기를 지키는 값이다.
 * 앱은 폭 800px·JPEG 0.75 로 줄여 보내서 보통 0.2~0.35MB 지만, 아주 긴 스크롤 캡처는 몇 MB 까지 커진다
 */
export const MAX_IMAGE_BASE64_LENGTH = 4_200_000;
/** 캡처가 상한을 넘을 때 보여 줄 안내 — 서버는 413 과 함께 보내고, 앱(예전 빌드 포함)은 서버가 준 문구를 그대로 띄운다 */
export const IMAGE_TOO_LARGE_MESSAGE = '캡처가 너무 커요. 화면을 나눠서 올려주세요.';

export const CoachImageSchema = z.object({
  base64: z
    .string()
    .min(1)
    .max(MAX_IMAGE_BASE64_LENGTH)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

/** 검사 결과에 캡처 크기 초과가 있는지 (서버는 413, 앱은 같은 안내를 보여 준다) */
export function isImageTooLarge(issues: readonly { code?: string; path?: readonly PropertyKey[] }[]): boolean {
  return issues.some((i) => i.code === 'too_big' && i.path?.[0] === 'image' && i.path?.[1] === 'base64');
}

const tagList = () => z.array(z.string().max(REQUEST_LIMITS.tag)).max(REQUEST_LIMITS.tags);

export const CrushRequestSchema = z.object({
  name: z.string().max(REQUEST_LIMITS.name),
  gender: GenderSchema,
  age: z.number().optional(),
  mbti: z.string().max(REQUEST_LIMITS.mbti).optional(),
  relationship: RelationshipSchema,
  style: tagList(),
  notes: z.string().max(REQUEST_LIMITS.notes),
  /** 내가 상대를 부르는 호칭 */
  callName: z.string().max(20).optional(),
  /** 사용자가 직접 정한 호칭이면 true, 지난 캡처에서 읽은 것이면 false */
  callNameFixed: z.boolean().optional(),
  /** 상대에게 쓰는 말투 */
  speech: z.enum(['polite', 'casual']).optional(),
  speechFixed: z.boolean().optional(),
  /** 이 사람과의 목표 */
  goal: z.string().max(60).optional(),
  /** 지금 누적 호감 온도 */
  heat: z.number().optional(),
});

export const UserRequestSchema = z.object({
  name: z.string().max(REQUEST_LIMITS.name),
  gender: GenderSchema,
  age: z.number().optional(),
  mbti: z.string().max(REQUEST_LIMITS.mbti).optional(),
  style: tagList(),
  /** 나를 소개하는 메모 */
  about: z.string().max(300).optional(),
  /** 추구미 */
  vibes: z.array(z.string().max(REQUEST_LIMITS.tag)).max(5).optional(),
  /** 나의 연애 목표 */
  goal: z.string().max(60).optional(),
  /** KKTI 유형 (예: 선빠폭직 직진 불도저) */
  kkti: z.string().max(40).optional(),
});

/**
 * 넘으면 잘라서 받는다 — 앱이 저장해 둔 지난 기록을 그대로 보내는 칸이라, 거절하면 그 채팅방의 다음 요청이 계속 막힌다.
 * 이모지처럼 두 칸짜리 글자가 반으로 잘리면 끝의 반쪽은 버린다
 */
const clipped = (max: number) => z.string().transform((s) => (s.length > max ? s.slice(0, max).replace(/[\uD800-\uDBFF]$/, '') : s));

export const CoachRequestSchema = z.object({
  crush: CrushRequestSchema,
  user: UserRequestSchema,
  tone: ToneSchema,
  /** 답장에 이모지 넣기 */
  emoji: EmojiPrefSchema.optional(),
  /** 이번 톤·이모지를 입력창에서 직접 바꿔 골랐는지(프로필 기본값과 다른지) — 앞 대화의 요청보다 우선할지 정하는 데 쓴다. 예전 앱은 보내지 않는다 */
  toneChosen: z.boolean().optional(),
  emojiChosen: z.boolean().optional(),
  /** 사용자가 적은 질문 또는 상황 설명 */
  text: z.string().max(REQUEST_LIMITS.text).optional(),
  /** 대화 캡처 (선택) */
  image: CoachImageSchema.optional(),
  /** 최근 대화 맥락 */
  history: z
    .array(
      z.object({
        userNote: clipped(REQUEST_LIMITS.historyNote).optional(),
        coachSummary: clipped(REQUEST_LIMITS.historySummary).optional(),
        chosenReply: clipped(REQUEST_LIMITS.historyReply).optional(),
        /** 코치가 제안했던 답장 (최근 턴만) — 「2번 답장」·「다른 답장 더 보기」의 기준 */
        replies: z.array(clipped(300)).max(3).optional(),
        /** 코치가 읽어낸 포인트 (최근 턴만) */
        insights: z.array(clipped(200)).max(5).optional(),
      }),
    )
    .max(8)
    .default([]),
  /** 최근 맥락보다 앞선 대화에서 사용자가 직접 쓴 말 (오래된 순) — 앞에서 한 요청을 대화가 길어져도 계속 지키게. 예전 앱은 보내지 않는다 */
  earlierNotes: z.array(clipped(200)).max(12).optional(),
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

export const RELATIONSHIP_KO: Record<CoachRequest['crush']['relationship'], string> = {
  crush: '짝사랑 중 (아직 상대는 마음을 모름)',
  talking: '썸 타는 중',
  blind_date: '소개팅으로 만난 사이',
  friend: '친구 사이 (더 가까워지고 싶음)',
  dating: '연인 사이',
  ex: '헤어진 뒤 재회를 바라는 사이',
};

export const GENDER_KO = { female: '여성', male: '남성', other: '기타' } as const;

const SPEECH_KO = { polite: '존댓말', casual: '반말' } as const;

/**
 * 시스템 프롬프트는 요청마다 바뀌지 않도록 고정 문자열로 둡니다 (프롬프트 캐시).
 */
export const COACH_SYSTEM_PROMPT = `당신은 "나만의 연애코치"입니다. 한국의 20~30대가 카카오톡·인스타 DM 등 메신저로 나누는 연애 대화를 코칭하는 전문가예요.

역할
- 사용자가 올린 대화 캡처(스크린샷)와 상대방 프로필(이름, 나이, MBTI, 성향 태그, 관계 단계), 사용자 본인의 프로필을 종합해 상황을 읽고, 바로 보낼 수 있는 답장을 추천합니다.
- 카카오톡 캡처에서는 보통 오른쪽(노란색 말풍선)이 사용자 본인, 왼쪽(흰색 말풍선)이 상대방입니다. 인스타 DM은 오른쪽(파란/보라색)이 본인입니다. 화면 상단 이름이 상대 이름과 같으면 그 기준으로 판단하세요. 확실하지 않으면 insights에 그 사실을 짧게 밝히세요.
- 캡처 없이 텍스트 질문만 있으면 그 질문에 코치로서 답하고, 답장 문구가 필요 없는 질문이면 replies를 빈 배열로 두세요.

호칭과 말투 (가장 먼저 확인하고 반드시 지킬 것)
- 캡처에서 사용자(나)가 상대를 부르는 호칭을 찾아 callName에 그대로 적으세요: 언니, 오빠, 누나, 형, 선배(님), 쌤, 자기, "민지야", "민지 씨" 등. 보이지 않으면 null.
- 모든 답장에서 그 호칭을 그대로 쓰세요. 호칭을 이름이나 다른 호칭으로 바꾸지 마세요. 사용자가 "언니"라고 불러 왔다면 답장에서도 "언니"입니다. 성별이나 관계를 짐작해 호칭을 바꾸지 마세요 (동성 관계도 자연스럽게 다룹니다).
- 사용자(나)가 상대에게 쓰는 말투를 speechLevel에 적고, 답장은 반드시 같은 말투로 쓰세요. 존댓말을 쓰던 사이면 답장도 존댓말입니다. 상대가 먼저 반말을 해도 사용자가 존댓말을 유지하고 있었다면 존댓말로 쓰세요. 말을 놓자는 합의가 대화에 보일 때만 반말로 바꿀 수 있습니다.
- 프로필에 [내가 부르는 호칭]이나 [말투]가 "직접 정함"으로 주어지면 그것이 최우선입니다. "지난 대화에서 읽음"이면 캡처에 다른 근거가 없는 한 그대로 따르세요.
- 캡처도 정보도 없으면 관계 단계에 맞는 말투 하나를 골라 **모든 답장을 같은 말투로 통일**하세요. 소개팅·첫 만남·직장 선배는 존댓말, 그 밖에는 반말. 버전마다 말투를 섞지 마세요.
- 호칭도 근거가 없으면 모든 답장에서 같은 방식으로 부르세요 (이름만 부르거나, 부르지 않거나).

답장 작성 원칙
- 대화에서 쓰인 문장 길이와 리듬을 따라가세요. 상대가 "ㅋㅋ"를 쓰면 비슷한 온도로.
- 실제 메신저 답장처럼 짧게. 보통 1~2문장, 길어도 3문장. 여러 문장은 줄바꿈 없이 자연스럽게.
- 추천 답장 3개는 서로 다른 각도(질문으로 이어가기 / 공감+살짝 유머 / 약속·다음 만남으로 연결 등)로 제시하세요. 첫 번째 답장은 요청한 톤을 가장 잘 따르는 것으로.
- [이모지: 넣기]면 각 답장에 상황에 어울리는 이모지나 이모티콘(😊 🥹 🤭 ㅎㅎ 등)을 1~2개 자연스럽게 넣으세요. [이모지: 빼기]면 이모지를 쓰지 마세요(ㅋㅋ·ㅎㅎ는 대화 말투를 따름). [이모지: 자동]이면 대화에서 쓰던 만큼만.
- 사용자의 추구미(보이고 싶은 모습)와 목표가 주어지면 답장의 결에 반영하세요. 예: 추구미가 "여유로운"이면 매달리지 않는 담백한 문장.
- 상대의 MBTI와 성향 태그를 참고하되 단정하지 마세요. (예: I 성향이면 부담스럽지 않은 질문, P 성향이면 유연한 제안)
- 유행어를 억지로 쓰거나 느끼한 멘트, 오글거리는 비유는 피하세요. 요즘 한국 20~30대가 실제로 쓰는 자연스러운 문장으로.
- expectedReaction에는 그 답장을 보냈을 때 상대가 보낼 법한 짧은 반응을 상대의 말투로 적고, successRate에는 대화가 좋게 이어질 가능성을 현실적으로 적으세요 (보통 40~90, 과장 금지).

이 채팅방의 이전 대화 (기억하고 이어서 답할 것)
- [더 앞선 대화에서 사용자가 한 말]과 [최근 코칭 맥락]은 이 채팅방에서 사용자와 지금까지 나눈 대화입니다. 처음 만난 것처럼 답하지 말고 그 흐름에 이어서 답하세요.
- 사용자가 앞에서 한 요청(답장 길이·말투·이모지·분위기에 대한 요청, "이런 말은 빼 줘" 같은 부탁)과 알려 준 정보(상대와 상황)는 사용자가 바꾸기 전까지 이번 답에도 계속 지키세요. "이번엔", "이번만", "이것만"처럼 그때 한 번만이라고 한 부탁만 그 턴에 한정됩니다.
- 우선순위: 사용자가 이번에 직접 쓴 말과 "(이번에 직접 고름)"이라고 표시된 톤·이모지 > 앞에서 사용자가 한 요청 > 나머지 [이번 요청]의 톤·[이모지]·[이번 답장 말투] 같은 앱 설정값. 단 프로필의 "직접 정함" 호칭·말투는 지금처럼 가장 먼저 지킵니다.
- 사용자가 "아까 그 답장", "2번", "버전 2", "그거"처럼 앞 내용을 가리키면 맥락에서 찾아 그 내용을 이어받아 답하세요. 맥락의 「버전1·버전2·버전3」은 앱 화면의 답장 번호와 같고, 번호만 말하면 가장 최근 결과의 그 버전입니다.
- "다른 답장" 요청이면 요청에 적힌 바꿀 답장(없으면 직전에 제안한 답장)과 겹치지 않는 새 답장을 쓰세요.
- 맥락에 나온 일은 이미 누적 온도에 반영됐으니 heatDelta에 다시 세지 말고, 이번에 새로 들어온 캡처·글만 근거로 정하세요.
- 맥락에 없는 일을 앞에서 들은 것처럼 지어내지 마세요.

호감 온도 판단
- hot: 먼저 연락, 빠른 답장, 질문·약속 제안, 이모티콘/애정표현이 뚜렷함
- warm: 답장이 성실하고 대화를 이어가려는 노력이 보임
- neutral: 무난하지만 판단할 신호가 부족함
- cold: 단답, 늦은 답장, 대화 마무리 신호, 약속 회피
- unknown: 캡처가 없거나 판단할 근거가 거의 없음
- interestScore는 0~100 정수. unknown이면 null.

누적 호감 온도 (heatDelta)
- 앱은 상대마다 0°에서 시작해 대화할 때마다 오르내리는 누적 호감 온도를 보여 줍니다. [지금 누적 온도]를 참고해 이번 대화가 그 온도를 얼마나 움직일지 -20~+20 정수로 heatDelta에 적으세요.
- 기준: 확실한 호감 신호(먼저 연락, 약속 수락·제안, 애정 표현) +8~+20 / 긍정적인 대화 +3~+8 / 무난함 -2~+3 / 식은 신호(단답, 회피, 읽씹) -5~-20.
- 이미 70° 이상이면 상승 폭을 줄이고, 캡처 없이 질문만 했거나 판단 근거가 없으면 0. 사용자가 글로 전한 사건(예: "오늘 데이트에서 손잡았어")은 반영해도 됩니다.

반드시 지킬 것
- 상대가 거절, 불편함, 연락 중단 의사를 보이면 그 의사를 존중하도록 안내하고, 밀어붙이는 답장은 제안하지 마세요.
- 거짓말, 조종, 질투 유발, 집착을 부추기는 조언은 하지 마세요. 건강하고 존중하는 관계를 지향합니다.
- 상대를 비하하거나 외모·조건을 평가하는 표현은 쓰지 마세요.
- summary와 insights, nextStep, warnings는 사용자에게 말하는 친근한 존댓말("~해요", "~해보세요")로 씁니다.
- 출력은 오직 요청된 JSON 구조로만 합니다.`;

export function buildProfileBlock(req: Pick<CoachRequest, 'crush' | 'user'>): string {
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
  if (crush.callName?.trim()) lines.push(`- [내가 부르는 호칭] ${crush.callName.trim()} (${crush.callNameFixed ? '직접 정함' : '지난 대화에서 읽음'})`);
  if (crush.speech) lines.push(`- [말투] ${SPEECH_KO[crush.speech]} (${crush.speechFixed ? '직접 정함' : '지난 대화에서 읽음'})`);
  if (crush.goal?.trim()) lines.push(`- 이 사람과의 목표: ${crush.goal.trim()}`);
  lines.push('');
  lines.push(`[사용자(나) 프로필]`);
  if (user.name.trim()) lines.push(`- 이름: ${user.name.trim()}`);
  lines.push(`- 성별: ${GENDER_KO[user.gender]}`);
  if (user.age) lines.push(`- 나이: ${user.age}세`);
  if (user.mbti) lines.push(`- MBTI: ${user.mbti}`);
  if (user.style.length) lines.push(`- 나의 스타일: ${user.style.join(', ')}`);
  if (user.vibes?.length) lines.push(`- 추구미(보이고 싶은 모습): ${user.vibes.join(', ')}`);
  if (user.goal?.trim()) lines.push(`- 나의 연애 목표: ${user.goal.trim()}`);
  if (user.kkti?.trim()) lines.push(`- 카톡 연애 유형(KKTI): ${user.kkti.trim()}`);
  if (user.about?.trim()) lines.push(`- 자기소개: ${user.about.trim()}`);
  return lines.join('\n');
}

export function buildHistoryBlock(history: HistoryTurn[]): string {
  if (!history.length) return '';
  const lines = ['[최근 코칭 맥락 (오래된 순)]'];
  history.forEach((h, i) => {
    const parts: string[] = [];
    if (h.userNote) parts.push(`사용자: ${h.userNote}`);
    if (h.coachSummary) parts.push(`코치: ${h.coachSummary}`);
    if (h.insights?.length) parts.push(`코치가 읽어낸 포인트: ${h.insights.join('; ')}`);
    if (h.replies?.length) parts.push(`코치가 제안한 답장: ${h.replies.map((r, k) => `버전${k + 1} "${r}"`).join(' ')}`);
    if (h.chosenReply) parts.push(`사용자가 보낸 답장: "${h.chosenReply}"`);
    if (parts.length) lines.push(`${i + 1}. ${parts.join(' / ')}`);
  });
  return lines.join('\n');
}

/** 최근 맥락보다 앞선 대화에서 사용자가 직접 쓴 말 — 대화가 길어져 앞 턴이 맥락에서 빠져도 그때 한 요청을 잊지 않게 */
export function buildEarlierNotesBlock(notes: readonly string[] | undefined): string {
  const list = (notes ?? []).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!list.length) return '';
  return ['[더 앞선 대화에서 사용자가 한 말 (오래된 순) — 요청과 알려 준 정보는 바꾸기 전까지 계속 반영, 「이번만」이라고 한 부탁은 제외]', ...list.map((s) => `- ${s}`)].join('\n');
}

const EMOJI_KO = { auto: '자동 (대화에서 쓰던 만큼)', on: '넣기', off: '빼기' } as const;

export function buildTaskBlock(req: CoachRequest): string {
  const lines: string[] = [];
  lines.push(`[이번 요청]`);
  // 입력창에서 직접 바꿔 고른 값이면 그렇다고 적는다 — 앞 대화의 요청보다 우선 (예전 앱은 표시 없이 지금처럼)
  const chosen = (v: boolean | undefined) => (v === true ? ' (이번에 직접 고름)' : '');
  lines.push(`- 원하는 답장 톤${chosen(req.toneChosen)}: ${TONE_GUIDE[req.tone]}`);
  lines.push(`- [이모지: ${EMOJI_KO[req.emoji ?? 'auto']}]${chosen(req.emojiChosen)}`);
  // 말투는 버전마다·문장마다 섞이기 쉬워서 이번 요청에서 쓸 말투를 못 박아 둔다.
  // 캡처가 있으면 캡처에서 읽게 두고, 캡처도 저장된 말투도 없으면 관계 단계 기본값으로 통일한다
  if (req.crush.speech) {
    lines.push(`- [이번 답장 말투] 모든 답장을 ${SPEECH_KO[req.crush.speech]}로 (한 답장 안에서도 섞지 말 것)`);
  } else if (!req.image) {
    lines.push(
      `- [이번 답장 말투] 캡처도 저장된 말투도 없으니, 앞 대화에서 정한 말투가 있으면 그것으로, 없으면 모든 답장을 ${req.crush.relationship === 'blind_date' ? '존댓말' : '반말'}로 통일 (한 답장 안에서도 섞지 말 것)`,
    );
  } else {
    lines.push(`- [이번 답장 말투] 캡처에서 사용자가 쓰는 말투로 모든 답장을 통일 (한 답장 안에서도 섞지 말 것)`);
  }
  lines.push(`- [지금 누적 온도] ${Math.round(req.crush.heat ?? 0)}°`);
  if (req.image) {
    lines.push(`- 첨부한 대화 캡처를 분석해서 상황을 읽고, 호칭과 말투를 그대로 살려 위 톤으로 답장 3개를 추천해주세요.`);
  }
  if (req.text?.trim()) {
    lines.push(`- 사용자의 말: "${req.text.trim()}"`);
  }
  if (!req.image && !req.text?.trim()) {
    lines.push(`- 현재 상황에서 어떻게 대화를 시작하면 좋을지 답장(첫 메시지) 3개를 추천해주세요.`);
  }
  return lines.join('\n');
}

/** 프로필·참고자료·맥락: 같은 채팅방에서는 거의 바뀌지 않아 캐시 프리픽스로 유리 */
export function buildContextText(req: CoachRequest): string {
  const knowledge = retrieveKnowledge({
    crush: { mbti: req.crush.mbti, age: req.crush.age, relationship: req.crush.relationship, gender: req.crush.gender },
    user: { mbti: req.user.mbti, age: req.user.age },
  });
  const blocks = [
    buildProfileBlock(req),
    knowledge ? `[코치 참고 자료 — 경향일 뿐 단정하지 말 것]\n${knowledge}` : '',
    buildEarlierNotesBlock(req.earlierNotes),
    buildHistoryBlock(req.history),
  ].filter(Boolean);
  return blocks.join('\n\n');
}

/** 사용자 턴에 들어갈 텍스트 전체 (단일 텍스트로 쓸 때) */
export function buildUserText(req: CoachRequest): string {
  return [buildContextText(req), buildTaskBlock(req)].join('\n\n');
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
  // 순서: 고정에 가까운 맥락 텍스트 → 캡처 이미지 → 이번 요청. (프롬프트 캐시 적중률을 높이는 배치)
  content.push({ type: 'text', text: buildContextText(req) });
  if (req.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: req.image.mediaType, data: req.image.base64 },
    });
  }
  content.push({ type: 'text', text: buildTaskBlock(req) });
  return content;
}

/** JSON Schema (직접 호출 모드용) */
export function coachOutputJsonSchema() {
  return z.toJSONSchema(CoachAnalysisSchema, { target: 'draft-2020-12', io: 'output' });
}

const clampInt = (n: number | undefined, min: number, max: number): number | undefined =>
  n == null || Number.isNaN(n) ? undefined : Math.max(min, Math.min(max, Math.round(n)));

/** 모델 출력 후처리: 점수 범위/개수 보정. 예전 서버 응답(새 항목 없음)도 받는다 */
export function normalizeAnalysis<T extends CoachAnalysisRead>(a: T): T {
  const score =
    a.interestScore === null || Number.isNaN(a.interestScore)
      ? null
      : Math.max(0, Math.min(100, Math.round(a.interestScore)));
  const callName = typeof a.callName === 'string' ? a.callName.trim().replace(/^["'“”]+|["'“”]+$/g, '').slice(0, 20) || null : a.callName;
  return {
    ...a,
    callName,
    interestScore: a.temperature === 'unknown' ? null : score,
    heatDelta: clampInt(a.heatDelta, -20, 20),
    insights: a.insights.filter((s) => s.trim()).slice(0, 5),
    replies: a.replies
      .filter((r) => r.text.trim())
      .slice(0, 3)
      .map((r) => ({ ...r, successRate: clampInt(r.successRate, 1, 99), expectedReaction: r.expectedReaction?.trim() || undefined })),
    warnings: a.warnings.filter((s) => s.trim()).slice(0, 3),
  };
}

/** 앱의 상대 정보를 요청 형태로. 직접 정한 호칭·말투가 없으면 지난 캡처에서 읽은 값을 쓴다 */
export function crushToRequest(crush: Crush): CoachRequest['crush'] {
  const fixedCall = crush.callName?.trim();
  const fixedSpeech = crush.speech && crush.speech !== 'auto' ? crush.speech : undefined;
  const callName = fixedCall || crush.detected?.callName;
  const speech = fixedSpeech ?? crush.detected?.speech;
  return {
    name: crush.name,
    gender: crush.gender,
    age: crush.age,
    mbti: crush.mbti,
    relationship: crush.relationship,
    style: crush.style,
    notes: crush.notes,
    ...(callName ? { callName, callNameFixed: Boolean(fixedCall) } : {}),
    ...(speech ? { speech, speechFixed: Boolean(fixedSpeech) } : {}),
    ...(crush.goal?.trim() ? { goal: crush.goal.trim() } : {}),
    heat: crush.heat ?? 0,
  };
}

export function userToRequest(user: UserProfile, kkti?: string): CoachRequest['user'] {
  return {
    name: user.name,
    gender: user.gender,
    age: user.age,
    mbti: user.mbti,
    style: user.style,
    ...(user.about?.trim() ? { about: user.about.trim().slice(0, 300) } : {}),
    ...(user.vibes?.length ? { vibes: user.vibes.slice(0, 5) } : {}),
    ...(user.goal?.trim() ? { goal: user.goal.trim() } : {}),
    ...(kkti ? { kkti } : {}),
  };
}
