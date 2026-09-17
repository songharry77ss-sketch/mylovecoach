/** 앱 전반에서 쓰는 도메인 타입 */

export type Gender = 'female' | 'male' | 'other';

export type Relationship = 'crush' | 'talking' | 'blind_date' | 'friend' | 'dating' | 'ex';

export type Tone = 'natural' | 'flirty' | 'witty' | 'cool' | 'sincere';

export type Temperature = 'hot' | 'warm' | 'neutral' | 'cold' | 'unknown';

export interface UserProfile {
  name: string;
  gender: Gender;
  age?: number;
  mbti?: string;
  /** 나의 평소 말투/성격 (예: 장난기 많음, 낯가림) */
  style: string[];
  /** 기본 답장 톤 */
  defaultTone: Tone;
  createdAt: number;
}

export interface Crush {
  id: string;
  name: string;
  gender: Gender;
  age?: number;
  mbti?: string;
  relationship: Relationship;
  /** 상대 스타일 태그 (예: 츤데레, 강아지상, 워커홀릭) */
  style: string[];
  /** 사진(선택) - 로컬 파일 URI */
  photoUri?: string;
  /** 어떻게 알게 됐는지 등 메모 */
  notes: string;
  createdAt: number;
  updatedAt: number;
  lastMessageAt?: number;
  /** 최근 분석에서 나온 호감 온도 */
  lastTemperature?: Temperature;
  lastInterestScore?: number;
}

export interface CoachReply {
  tone: Tone;
  /** 상대에게 보낼 답장 문구 */
  text: string;
  /** 왜 이 답장이 효과적인지 한 줄 */
  why: string;
}

export interface CoachAnalysis {
  /** 코치의 핵심 메시지 (2~4문장) */
  summary: string;
  temperature: Temperature;
  /** 0~100. 판단 불가면 null */
  interestScore: number | null;
  /** 대화에서 읽어낸 포인트들 */
  insights: string[];
  /** 추천 답장 0~3개 */
  replies: CoachReply[];
  /** 다음 스텝 제안 */
  nextStep: string;
  /** 주의할 점 (없으면 빈 배열) */
  warnings: string[];
}

export type MessageRole = 'user' | 'coach';

export interface ChatMessage {
  id: string;
  crushId: string;
  role: MessageRole;
  createdAt: number;
  /** 사용자가 올린 스크린샷 로컬 URI */
  imageUri?: string;
  /** 사용자가 적은 질문/상황 설명, 또는 코치의 오류 안내 */
  text?: string;
  /** 요청한 톤 */
  tone?: Tone;
  /** 코치 분석 결과 */
  analysis?: CoachAnalysis;
  /** 사용자가 복사(선택)한 답장 인덱스 */
  selectedReplyIndex?: number;
  /** 요청 실패 시 */
  error?: string;
  /** 응답 대기 중 */
  pending?: boolean;
}

export interface HistoryTurn {
  /** 사용자가 적은 메모/질문 */
  userNote?: string;
  /** 코치 요약 */
  coachSummary?: string;
  /** 사용자가 실제로 선택한 답장 */
  chosenReply?: string;
}
