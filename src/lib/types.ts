/** 앱 전반에서 쓰는 도메인 타입 */
import type { CrushReport, MindReading } from './ai-schemas';

export type { CrushReport, MindReading } from './ai-schemas';

export type Gender = 'female' | 'male' | 'other';

export type Relationship = 'crush' | 'talking' | 'blind_date' | 'friend' | 'dating' | 'ex';

export type Tone = 'natural' | 'flirty' | 'witty' | 'cool' | 'sincere';

export type Temperature = 'hot' | 'warm' | 'neutral' | 'cold' | 'unknown';

/** 상대에게 쓰는 말투 설정. auto 면 대화 캡처에서 쓰던 말투를 그대로 따라간다 */
export type SpeechPref = 'auto' | 'polite' | 'casual';

/** 대화 캡처에서 읽어낸 나의 말투 */
export type SpeechLevel = 'polite' | 'casual' | 'mixed' | 'unknown';

/** 답장에 이모지 넣기. auto 면 대화에서 쓰던 만큼 */
export type EmojiPref = 'auto' | 'on' | 'off';

/** KKTI(카톡으로 보는 진짜 연애 MBTI) 검사 결과 */
export interface KktiSaved {
  /** 유형 코드 (예: 선빠폭직) */
  code: string;
  /** 유형 별명 */
  name: string;
  emoji: string;
  /** 나만의 연애 컬러 */
  color: string;
  colorName: string;
  /** 카톡 습관으로 본 진짜 MBTI */
  mbti: string;
  /** 애니어그램 추정 (1~9) */
  enneagram: number;
  at: number;
}

export interface UserProfile {
  name: string;
  gender: Gender;
  age?: number;
  mbti?: string;
  /** 나의 평소 말투/성격 (예: 장난기 많음, 낯가림) */
  style: string[];
  /** 기본 답장 톤 */
  defaultTone: Tone;
  /** 나를 소개하는 메모 (직업·취미·연애 스타일 등) */
  about?: string;
  /** 추구미 — 상대에게 보이고 싶은 내 모습 (최대 3개) */
  vibes?: string[];
  /** 나의 연애 목표 */
  goal?: string;
  /** 답장에 이모지 넣기 (없으면 넣기) */
  emoji?: EmojiPref;
  createdAt: number;
}

/** 누적 호감 온도 변화 한 번 */
export interface HeatPoint {
  at: number;
  value: number;
  delta: number;
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
  /** 내가 상대를 부르는 호칭 (예: 언니, 오빠, 민지야). 비워 두면 캡처에서 알아서 읽는다 */
  callName?: string;
  /** 상대에게 쓰는 말투. 없거나 auto 면 캡처에서 읽은 말투를 따른다 */
  speech?: SpeechPref;
  /** 캡처에서 자동으로 알아낸 호칭·말투 (직접 정하지 않았을 때 다음 요청에 쓴다) */
  detected?: { callName?: string; speech?: 'polite' | 'casual'; at: number };
  /** 이 사람과의 목표 */
  goal?: string;
  /** 누적 호감 온도. 0°에서 시작해 대화마다 오르내린다 (-20 ~ 100) */
  heat?: number;
  /** 온도 변화 기록 (오래된 순, 최근 60개) */
  heatLog?: HeatPoint[];
  /** 마지막으로 만든 상대 분석 보고서. profileKey 는 그때 보낸 상대·내 프로필의 지문 (reportProfileKey — 예전 보고서에는 없다) */
  report?: { data: CrushReport; at: number; basedOn: number; profileKey?: string };
  /** 비밀 상담 — 기기에 저장하지 않고 채팅방을 나가면 지운다 */
  secret?: boolean;
}

export interface CoachReply {
  tone: Tone;
  /** 상대에게 보낼 답장 문구 */
  text: string;
  /** 왜 이 답장이 효과적인지 한 줄 */
  why: string;
  /** 이 답장을 보내면 상대가 보낼 법한 반응 (상대 말투로) */
  expectedReaction?: string;
  /** 대화가 좋게 이어질 가능성 (%) */
  successRate?: number;
}

export interface CoachAnalysis {
  /** 코치의 핵심 메시지 (2~4문장) */
  summary: string;
  temperature: Temperature;
  /** 0~100. 판단 불가면 null */
  interestScore: number | null;
  /** 이번 대화로 누적 호감 온도가 움직이는 폭 (-20 ~ +20). 예전 서버 응답에는 없다 */
  heatDelta?: number;
  /** 캡처에서 읽은, 내가 상대를 부르는 호칭 */
  callName?: string | null;
  /** 캡처에서 읽은 나의 말투 */
  speechLevel?: SpeechLevel;
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
  emoji?: EmojiPref;
  toneChosen?: boolean;
  emojiChosen?: boolean;
  /** 코치 분석 결과 */
  analysis?: CoachAnalysis;
  /** 이 분석으로 바뀐 누적 호감 온도 */
  heat?: { before: number; after: number; delta: number };
  /** 사용자가 복사(선택)한 답장 인덱스 */
  selectedReplyIndex?: number;
  /** 「다른 답장 더 보기」 요청이면 바꿀 코치 카드(메시지) id — 실패 뒤 다시 시도할 때 같은 카드로 다시 보낸다 */
  variationOf?: string;
  /** 보낸 캡처의 짧은 지문 — 같은 캡처를 질문·톤만 바꿔 다시 분석해도 누적 온도는 한 번만 움직이게 */
  imageHash?: string;
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
  /** 코치가 제안한 답장 (최근 몇 턴만) — 「2번 답장 더 짧게」·「다른 답장 더 보기」가 앞 답장을 알 수 있게 */
  replies?: string[];
  /** 코치가 대화에서 읽어낸 포인트 (최근 몇 턴만) — 캡처는 다시 보내지 않으므로 이어지는 질문의 근거가 된다 */
  insights?: string[];
}

/** 연애 연습 상대역 */
export interface PracticePersona {
  id: string;
  name: string;
  emoji: string;
  gender: Gender;
  age: number;
  mbti: string;
  job: string;
  style: string[];
  relationship: Relationship;
  /** 사용자에게 보여 줄 상황 설명 */
  scenario: string;
  /** 상대가 먼저 보내는 첫 메시지 */
  opener: string;
  /** 상대가 쓰는 말투 */
  speech: 'polite' | 'casual';
  difficulty: 1 | 2 | 3;
  hint: string;
  color: string;
}

export interface PracticeTurn {
  id: string;
  role: 'me' | 'them';
  text: string;
  at: number;
  /** 내 메시지에 대한 코치 한마디 */
  feedback?: string;
  /** 더 좋은 메시지 예시 */
  better?: string;
  /** 이 메시지로 바뀐 온도 */
  delta?: number;
}

export interface PracticeSession {
  id: string;
  persona: PracticePersona;
  turns: PracticeTurn[];
  /** 연습 온도 (0°에서 시작) */
  heat: number;
  /** 상대 기분 이모지 */
  mood: string;
  startedAt: number;
  updatedAt: number;
  ended?: boolean;
  /** 이 연습으로 이용 횟수를 이미 차감했는지 (연습 한 번 = 1회) */
  charged?: boolean;
}

/** 속마음 카드 결과 보관용 */
export interface MindAnswer {
  situation: string;
  perspective: Gender;
  reading: MindReading;
  at: number;
  /** 재사용 키 (mindCacheKey). 같은 키의 예전 기록은 목록에서 한 번만 보인다. 예전 기록에는 없다 */
  key?: string;
}
