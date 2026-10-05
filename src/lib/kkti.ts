/**
 * KKTI — 카톡으로 보는 진짜 연애 MBTI.
 *
 * 바이럴용 무료 테스트의 순수 로직과 데이터 (React 없이 — 테스트에서도 그대로 쓴다).
 * - 4개 축 × 3문항 = 12문항. 고른 답마다 그 축 점수(-2~+2)를 더한다.
 * - 축마다 한 글자씩 → 유형 코드 4글자 (예: 선빠폭직). 16유형.
 * - 같은 점수로 「카톡 속 진짜 MBTI」(확신도 %), 애니어그램 추정, 나만의 연애 컬러를 만든다.
 * - 답은 6글자 코드로 압축해 결과 링크(?a=)에 싣는다. 같은 답이면 언제나 같은 결과가 나온다.
 */
import type { KktiSaved, Tone } from '@/lib/types';

// ───────────────────────── 축 ─────────────────────────

export type KktiAxisKey = 'start' | 'speed' | 'express' | 'pace';

export interface KktiPole {
  /** 유형 코드에 들어가는 한 글자 */
  letter: string;
  /** 짧은 설명 (예: 먼저 연락) */
  label: string;
  /** 「카톡 속 진짜 MBTI」 글자 */
  mbti: string;
  /** 이유 문장용 연결형 (예: 먼저 다가가고) */
  and: string;
  /** 이유 문장용 꾸밈형 (예: 먼저 다가가는) */
  adn: string;
}

export interface KktiAxis {
  key: KktiAxisKey;
  label: string;
  emoji: string;
  /** 점수가 + 쪽 */
  plus: KktiPole;
  /** 점수가 - 쪽 */
  minus: KktiPole;
}

/** 축 순서 = 유형 코드 글자 순서 = MBTI 글자 순서 (E/I · S/N · F/T · J/P) */
export const KKTI_AXES: readonly KktiAxis[] = [
  {
    key: 'start',
    label: '연락 시작',
    emoji: '📲',
    plus: { letter: '선', label: '먼저 연락', mbti: 'E', and: '먼저 다가가고', adn: '먼저 다가가는' },
    minus: { letter: '후', label: '기다림', mbti: 'I', and: '상대를 기다려 주고', adn: '상대를 기다려 주는' },
  },
  {
    key: 'speed',
    label: '답장 속도',
    emoji: '⚡',
    plus: { letter: '빠', label: '즉답', mbti: 'S', and: '답장이 빠르고', adn: '답장이 빠른' },
    minus: { letter: '느', label: '느긋', mbti: 'N', and: '내 페이스를 지키고', adn: '내 페이스를 지키는' },
  },
  {
    key: 'express',
    label: '표현',
    emoji: '🎉',
    plus: { letter: '폭', label: '리액션 폭발', mbti: 'F', and: '감정 표현이 풍부하고', adn: '감정 표현이 풍부한' },
    minus: { letter: '담', label: '담백', mbti: 'T', and: '말을 아끼고', adn: '말을 아끼는' },
  },
  {
    key: 'pace',
    label: '진도',
    emoji: '🚀',
    plus: { letter: '직', label: '직진', mbti: 'J', and: '마음이 정해지면 직진하고', adn: '마음이 정해지면 직진하는' },
    minus: { letter: '밀', label: '밀당·신중', mbti: 'P', and: '관계를 신중하게 재고', adn: '관계를 신중하게 재는' },
  },
];

/** 축별 연속값 (-1 = 아랫글자 쪽 끝, +1 = 윗글자 쪽 끝) */
export type KktiAxisValues = Record<KktiAxisKey, number>;

// ───────────────────────── 질문 ─────────────────────────

export interface KktiOption {
  label: string;
  /** 이 질문 축의 점수 (-2~+2, + 가 선·빠·폭·직 쪽) */
  score: number;
}

export interface KktiQuestion {
  id: string;
  axis: KktiAxisKey;
  emoji: string;
  /** 그 사람에게서 온 카톡 — 말풍선으로 보여 준다 (없으면 상황만) */
  bubble?: string;
  /** 상황 + 질문 */
  prompt: string;
  options: KktiOption[];
}

/** 12문항 (축마다 3개, 지루하지 않게 축을 번갈아 배치). 순서·선택지 순서를 바꾸면 예전 결과 링크가 달라지니 주의 */
export const KKTI_QUESTIONS: readonly KktiQuestion[] = [
  {
    id: 'q1',
    axis: 'start',
    emoji: '🌙',
    prompt: '요즘 신경 쓰이는 그 사람, 오늘 하루 종일 카톡이 없다. 밤 10시, 나는?',
    options: [
      { label: '내가 먼저 "오늘 뭐 했어?" 보낸다. 고민은 사치', score: 2 },
      { label: '인스타 스토리만 올리고 반응을 기다린다', score: -1 },
      { label: '핑계로 쓸 밈이나 맛집 링크를 찾아 슬쩍 보낸다', score: 1 },
      { label: '먼저 보내면 지는 거야… 폰을 뒤집어 둔다', score: -2 },
    ],
  },
  {
    id: 'q2',
    axis: 'speed',
    emoji: '💬',
    bubble: '뭐해?',
    prompt: '그 사람에게 "뭐해?"가 왔다. 나는?',
    options: [
      { label: '미리보기로 확인만 하고 하던 거 마저 한다', score: -1 },
      { label: '알림 뜨자마자 1초 컷. 이미 치는 중', score: 2 },
      { label: '답장은 마음의 여유가 생길 때. 몇 시간쯤이야', score: -2 },
      { label: '바로 보긴 하는데, 너무 빠르면 좀 그러니까 3분 뒤에', score: 1 },
    ],
  },
  {
    id: 'q3',
    axis: 'express',
    emoji: '🥹',
    bubble: '오늘 너 생각났어',
    prompt: '그 사람의 이 한마디, 내 답장은?',
    options: [
      { label: '"헐ㅠㅠㅠ 나도!!! 🥹💕" 이모티콘 3연타', score: 2 },
      { label: '"ㅎㅎ 왜?? 무슨 일 있었어? 😊"', score: 1 },
      { label: '"오 왜?" (설렘은 마음속에만)', score: -1 },
      { label: '"ㅇㅇ 나도"', score: -2 },
    ],
  },
  {
    id: 'q4',
    axis: 'pace',
    emoji: '🚦',
    prompt: '썸 탄 지 2주, 분위기 좋다. 다음 스텝은?',
    options: [
      { label: '확신이 들 때까지 지금처럼 천천히 간다', score: -1 },
      { label: '"우리 무슨 사이야?" 직접 물어본다', score: 2 },
      { label: '일부러 연락 텀을 늘려 본다. 아쉬운 쪽이 다가오겠지', score: -2 },
      { label: '다음 약속에서 분위기 보고 고백 각을 잡는다', score: 1 },
    ],
  },
  {
    id: 'q5',
    axis: 'start',
    emoji: '🍝',
    prompt: '릴스 보다가 그 사람이랑 가고 싶은 맛집을 발견했다.',
    options: [
      { label: '바로 공유 + "여기 같이 갈래?"', score: 2 },
      { label: '"ㅋㅋ 이거 봐" 링크만 툭 보낸다', score: 1 },
      { label: '저장해 두고, 그 사람한테 연락 오면 그때 꺼낸다', score: -1 },
      { label: '저장 폴더에 고이 모셔 둔다 (영원히)', score: -2 },
    ],
  },
  {
    id: 'q6',
    axis: 'speed',
    emoji: '🔴',
    prompt: '평소 내 카톡의 안 읽은 메시지 숫자는?',
    options: [
      { label: '두 자릿수는 기본', score: -1 },
      { label: '0. 빨간 숫자는 못 참지', score: 2 },
      { label: '300+… 알림 끈 지 오래', score: -2 },
      { label: '한 자릿수. 틈틈이 정리한다', score: 1 },
    ],
  },
  {
    id: 'q7',
    axis: 'express',
    emoji: '🤣',
    bubble: '이거 완전 너잖아ㅋㅋㅋ 📷',
    prompt: '그 사람이 웃긴 짤을 보냈다. 내 리액션은?',
    options: [
      { label: '"ㅋㅋㅋㅋㅋㅋㅋ 미쳤다ㅋㅋㅋ" + 짤로 맞받아친다', score: 2 },
      { label: '"ㅋㅋ"', score: -1 },
      { label: '"ㅋㅋㅋㅋ 이거 뭐야" 정도', score: 1 },
      { label: '공감 이모지 하나 꾹', score: -2 },
    ],
  },
  {
    id: 'q8',
    axis: 'pace',
    emoji: '📅',
    bubble: '이번 주말에 뭐 해?',
    prompt: '주말 일정을 묻는 그 사람, 내 대답은?',
    options: [
      { label: '"아무것도 안 해! 왜, 만날래?" 바로 약속 잡기', score: 2 },
      { label: '"아직 계획 없어 ㅎㅎ 너는?" 공 넘기기', score: -1 },
      { label: '"일요일 괜찮아! 어디 갈까?" 일정부터 맞춘다', score: 1 },
      { label: '"토요일은 약속 있고… 일요일은 봐서?" 바쁜 척 한 번', score: -2 },
    ],
  },
  {
    id: 'q9',
    axis: 'start',
    emoji: '🔕',
    prompt: '대화가 끊긴 지 3일째. 마지막 메시지는 내가 보냈다.',
    options: [
      { label: '이번엔 그 사람 차례. 연락 올 때까지 기다린다', score: -1 },
      { label: '새 주제로 내가 다시 시작한다. 대화는 원래 내가 여는 거지', score: 2 },
      { label: '여기서 또 보내면 집착이다. 조용히 손 뗀다', score: -2 },
      { label: '하루만 더 기다려 보고, 그래도 없으면 보낸다', score: 1 },
    ],
  },
  {
    id: 'q10',
    axis: 'speed',
    emoji: '🎳',
    prompt: '친구들이랑 노는 중에 그 사람 카톡이 왔다.',
    options: [
      { label: '화장실 가는 척하고 바로 답장한다', score: 2 },
      { label: '"나 친구들이랑 있어서 이따 연락할게!" 먼저 보내 둔다', score: 1 },
      { label: '집에 가서 여유 있을 때 제대로 답장한다', score: -1 },
      { label: '다음 날 아침에 "헉 이제 봤다"', score: -2 },
    ],
  },
  {
    id: 'q11',
    axis: 'express',
    emoji: '🗣️',
    prompt: '친구가 내 카톡 말투를 한마디로 정리한다면?',
    options: [
      { label: '"용건만 간단히, 근데 은근 다정함"', score: -1 },
      { label: '"느낌표랑 이모티콘 없으면 화난 줄 앎"', score: 2 },
      { label: '"로봇이냐는 소리 자주 들음"', score: -2 },
      { label: '"ㅎㅎ랑 ㅋㅋ로 분위기 맞추는 편"', score: 1 },
    ],
  },
  {
    id: 'q12',
    axis: 'pace',
    emoji: '💘',
    bubble: '나 너 좀 좋은 것 같아',
    prompt: '훅 들어온 고백(?), 나도 그 사람이 좋다면?',
    options: [
      { label: '"나도!! 우리 사귈래?" 바로 쐐기', score: 2 },
      { label: '"나도 좋아 ㅎㅎ" 솔직하게 답한다', score: 1 },
      { label: '"ㅋㅋ 갑자기?" 살짝 떠보며 반응을 본다', score: -1 },
      { label: '"그래? 왜? ㅎㅎ" 한 번 더 애태운다', score: -2 },
    ],
  },
];

export const KKTI_QUESTION_COUNT = KKTI_QUESTIONS.length;

// ───────────────────────── 16유형 ─────────────────────────

export interface KktiType {
  /** 유형 코드 (예: 선빠폭직) */
  code: string;
  /** 별명 */
  name: string;
  emoji: string;
  oneLiner: string;
  /** 2~3문장 */
  description: string;
  strengths: string[];
  watchOut: string[];
  /** 잘 맞는 유형 코드 — 연락 시작만 반대(한 명이 다가가고 한 명이 받아 줌), 나머지는 같은 결 */
  bestMatch: string;
  /** 안 맞는 유형 코드 — 연락 시작은 같고(둘 다 주도·둘 다 기다림), 나머지는 전부 반대 */
  worstMatch: string;
  /** 이 유형에게 주는 연애 코칭 한 줄 */
  coachTip: string;
  /** 코칭에서 먼저 권하는 답장 톤 */
  recommendedTone: Tone;
}

const TYPE_LIST: KktiType[] = [
  {
    code: '선빠폭직',
    name: '직진 불도저',
    emoji: '🚜',
    oneLiner: '먼저 연락하고, 1초 만에 답하고, 마음 생기면 바로 고백각',
    description: '좋으면 좋다고 말해야 직성이 풀리는 타입. 선톡·칼답·리액션 폭탄으로 썸을 순식간에 데워요. 밀당이요? 그게 뭔데요.',
    strengths: ['상대가 내 마음을 헷갈릴 일이 없어요', '대화가 끊기지 않는 엄청난 추진력'],
    watchOut: ['상대 속도가 느리면 부담으로 느낄 수 있어요', '답장 재촉은 금지! 기다림도 플러팅이에요'],
    bestMatch: '후빠폭직',
    worstMatch: '선느담밀',
    coachTip: '설렘은 그대로, 속도만 반 박자 늦춰 보세요. 상대가 다가올 자리를 남겨 두면 더 깊어져요.',
    recommendedTone: 'cool',
  },
  {
    code: '선빠폭밀',
    name: '썸 장인',
    emoji: '🦊',
    oneLiner: '선톡·칼답·리액션은 만렙, 근데 고백은… 아직?',
    description: '대화 텐션을 끌어올리는 데는 천재. 설레는 말도 잘 던지는데, 정작 관계를 정의하는 순간엔 한 발 빼요. 썸을 즐길 줄 아는 진정한 장인.',
    strengths: ['처음 만난 사람과도 금방 설레는 분위기를 만들어요', '대화가 재밌어서 상대가 자꾸 생각나게 해요'],
    watchOut: ['썸이 길어지면 상대가 "혹시 어장?" 하고 의심할 수 있어요'],
    bestMatch: '후빠폭밀',
    worstMatch: '선느담직',
    coachTip: '플러팅 실력은 이미 충분해요. 이제 진심 한 문장이 썸을 끝내 줄 차례예요.',
    recommendedTone: 'sincere',
  },
  {
    code: '선빠담직',
    name: '약속 확정러',
    emoji: '📅',
    oneLiner: '"뭐해?" 대신 "토요일 7시 어때?"를 보내는 사람',
    description: '용건만 간단히, 대신 빠르고 확실하게. 말보다 약속과 행동으로 마음을 보여 줘요. 계획 없는 썸은 체질에 안 맞아요.',
    strengths: ['애매한 걸 싫어해서 관계가 금방 선명해져요', '약속을 칼같이 지켜 믿음이 가요'],
    watchOut: ['담백한 말투가 가끔 차갑게 읽힐 수 있어요', '약속 잡는 카톡이 업무 연락처럼 느껴지지 않게!'],
    bestMatch: '후빠담직',
    worstMatch: '선느폭밀',
    coachTip: '약속 잡는 카톡 끝에 리액션 하나만 붙여 보세요. "좋아! 기대된다 ㅎㅎ" 한마디면 온도가 확 올라가요.',
    recommendedTone: 'witty',
  },
  {
    code: '선빠담밀',
    name: '선톡 츤데레',
    emoji: '😼',
    oneLiner: '먼저 연락은 하는데 말투는 무심한 척',
    description: '관심 있으니까 먼저 톡은 보내지만, 감정은 쉽게 들키지 않아요. "ㅇㅇ", "그래" 사이에 숨겨 둔 마음을 알아채는 사람만 내 사람.',
    strengths: ['여유 있어 보여서 상대가 자꾸 궁금해해요', '선톡으로 대화의 주도권을 자연스럽게 잡아요'],
    watchOut: ['무심한 척이 길어지면 진짜 무관심으로 오해받아요'],
    bestMatch: '후빠담밀',
    worstMatch: '선느폭직',
    coachTip: '츤 세 번에 데레 한 번이 황금 비율이에요. 오늘은 "보고 싶었어" 한마디를 데레로 써 보세요.',
    recommendedTone: 'flirty',
  },
  {
    code: '선느폭직',
    name: '몰아치기 사랑꾼',
    emoji: '🌊',
    oneLiner: '답장은 늦어도, 올 때는 장문 + 이모지 폭탄',
    description: '먼저 연락하고 마음도 확실한데, 답장 리듬은 내 마음대로. 한동안 조용하다가 돌아오면 그동안 못 한 말을 파도처럼 몰아서 쏟아내요.',
    strengths: ['진심이 듬뿍 담긴 메시지로 감동을 줘요', '마음이 정해지면 흔들림 없이 다가가요'],
    watchOut: ['답장 공백이 길면 상대가 불안해할 수 있어요'],
    bestMatch: '후느폭직',
    worstMatch: '선빠담밀',
    coachTip: '긴 답장 한 번보다 짧은 답장 여러 번이 더 설레요. 바쁠 땐 "이따 길게 답할게!" 한 줄이면 충분해요.',
    recommendedTone: 'cool',
  },
  {
    code: '선느폭밀',
    name: '밀당 요정',
    emoji: '🧚',
    oneLiner: '선톡 던지고 사라졌다가, 리액션 폭탄 들고 귀환',
    description: '먼저 말을 걸지만 답장은 내 페이스, 표현은 화려하지만 진도는 천천히. 종잡을 수 없어서 오히려 자꾸 생각나게 만드는 요정 같은 타입.',
    strengths: ['예측 불가한 매력으로 상대의 호기심을 자극해요', '분위기 메이커라 대화가 늘 재밌어요'],
    watchOut: ['연락 리듬이 들쑥날쑥하면 상대가 지칠 수 있어요'],
    bestMatch: '후느폭밀',
    worstMatch: '선빠담직',
    coachTip: '매력은 이미 충분해요. 연락하는 시간대를 하나 정해 두는 "꾸준함" 한 스푼이면 상대가 안심해요.',
    recommendedTone: 'natural',
  },
  {
    code: '선느담직',
    name: '무심한 직진러',
    emoji: '🗿',
    oneLiner: '말수는 적은데 행동은 직진',
    description: '먼저 연락하고 마음도 분명하지만 카톡은 짧고 느긋해요. "밥 먹자", "데려다줄게" 같은 담백한 한마디에 진심을 다 담는 타입.',
    strengths: ['말보다 행동이라 믿음직해요', '흔들림 없는 태도로 상대를 편하게 해 줘요'],
    watchOut: ['답장이 느리고 짧아서 관심 없는 걸로 오해받기 쉬워요'],
    bestMatch: '후느담직',
    worstMatch: '선빠폭밀',
    coachTip: '행동은 이미 만점이에요. 답장에 질문 하나만 붙여 보세요. "넌 오늘 어땠어?"가 대화를 살려요.',
    recommendedTone: 'witty',
  },
  {
    code: '선느담밀',
    name: '밀당 낚시꾼',
    emoji: '🎣',
    oneLiner: '선톡 미끼 던져 놓고, 느긋하게 입질 기다리는 중',
    description: '대화의 시작은 내가 열지만, 감정과 진도는 천천히 재 보는 전략가. 무심한 듯 툭 던진 한마디로 상대를 애태우는 데 능해요.',
    strengths: ['여유 있는 태도가 묘한 긴장감을 만들어요', '상대를 차분히 관찰하고 판단해요'],
    watchOut: ['밀당이 길어지면 상대가 먼저 지쳐서 떠날 수 있어요'],
    bestMatch: '후느담밀',
    worstMatch: '선빠폭직',
    coachTip: '낚싯대를 너무 오래 드리우면 물고기도 떠나요. 이번엔 마음을 조금 더 분명하게 보여 주세요.',
    recommendedTone: 'sincere',
  },
  {
    code: '후빠폭직',
    name: '꼬리 흔드는 골댕이',
    emoji: '🐶',
    oneLiner: '먼저 연락은 못 해도, 연락 오면 꼬리 프로펠러',
    description: '선톡은 쑥스럽지만 일단 연락이 오면 칼답에 리액션 폭발. 마음이 생기면 숨김없이 다 보여 주는 순수한 직진 댕댕이.',
    strengths: ['리액션이 좋아서 상대가 대화할 맛이 나요', '한번 마음 주면 한결같아요'],
    watchOut: ['너무 빨리 다 보여 주면 상대가 긴장을 놓을 수 있어요', '연락 오기만 기다리다 타이밍을 놓쳐요'],
    bestMatch: '선빠폭직',
    worstMatch: '후느담밀',
    coachTip: '리액션 부자인 건 큰 장점! 가끔은 반 박자 쉬어 가는 여유와, 먼저 건네는 선톡 한 번이면 완벽해요.',
    recommendedTone: 'cool',
  },
  {
    code: '후빠폭밀',
    name: '선톡 기다리는 햄찌',
    emoji: '🐹',
    oneLiner: '폰 붙잡고 선톡 기다리는 중… 오면 바로 답장',
    description: '먼저 연락하긴 쑥스럽지만 알림 오면 누구보다 빠르게 달려가요. 리액션은 귀엽게 폭발하는데, 마음을 정하는 건 조심스러운 신중파 햄찌.',
    strengths: ['대화가 시작되면 사랑스러운 리액션으로 분위기를 살려요', '상대를 세심하게 배려해요'],
    watchOut: ['기다리기만 하면 관심 없다고 오해받을 수 있어요'],
    bestMatch: '선빠폭밀',
    worstMatch: '후느담직',
    coachTip: '먼저 말 걸기 쑥스러우면 질문 대신 공유부터! 귀여운 짤 하나 보내는 것도 훌륭한 선톡이에요.',
    recommendedTone: 'flirty',
  },
  {
    code: '후빠담직',
    name: '한결같은 칼답러',
    emoji: '⏱️',
    oneLiner: '선톡은 드물지만, 답장은 칼같이',
    description: '먼저 연락하는 편은 아니어도 받은 카톡엔 성실하게, 빠르게 답해요. 말은 짧아도 약속은 꼭 지키는, 알면 알수록 믿음 가는 타입.',
    strengths: ['꾸준하고 성실해서 신뢰를 줘요', '답장이 빨라서 상대가 불안할 틈이 없어요'],
    watchOut: ['담백한 답장이 계속되면 단답 핑퐁이 될 수 있어요'],
    bestMatch: '선빠담직',
    worstMatch: '후느폭밀',
    coachTip: '답장 끝에 질문이나 이모지 하나! 칼답에 온기 한 스푼이 더해지면 완벽해요.',
    recommendedTone: 'witty',
  },
  {
    code: '후빠담밀',
    name: '포커페이스 고양이',
    emoji: '🐈',
    oneLiner: '답장은 빠른데 속마음은 절대 안 보여 줌',
    description: '연락이 오면 곧잘 답하지만, 감정은 표정 관리 완벽. 다가올 듯 말 듯한 고양이 같은 매력으로 상대를 애태워요.',
    strengths: ['쿨하고 여유 있는 분위기가 매력적이에요', '감정 기복 없이 안정적이에요'],
    watchOut: ['상대가 내 마음을 몰라서 먼저 포기할 수 있어요'],
    bestMatch: '선빠담밀',
    worstMatch: '후느폭직',
    coachTip: '고양이가 먼저 다가올 때 사람들은 심쿵해요. 가끔은 호감을 살짝 티 내 보세요.',
    recommendedTone: 'flirty',
  },
  {
    code: '후느폭직',
    name: '진심 장문러',
    emoji: '📝',
    oneLiner: '답장 하나에 진심 한 바닥',
    description: '먼저 연락은 망설이고 답장도 신중하지만, 보낼 땐 마음을 꾹꾹 눌러 담은 장문. 확신이 서면 누구보다 깊고 진하게 사랑해요.',
    strengths: ['진정성 있는 표현으로 깊은 신뢰를 쌓아요', '상대의 마음을 섬세하게 읽어요'],
    watchOut: ['답장을 고민하다 타이밍을 놓칠 수 있어요', '초반 장문은 상대에게 무거울 수 있어요'],
    bestMatch: '선느폭직',
    worstMatch: '후빠담밀',
    coachTip: '완벽한 답장보다 빠른 한 줄이 나을 때도 있어요. 짧게 먼저 보내고, 진심은 만나서 전해요.',
    recommendedTone: 'natural',
  },
  {
    code: '후느폭밀',
    name: '새벽 감성 몽상가',
    emoji: '🌙',
    oneLiner: '답장 고민만 3시간, 보낼 땐 감성 폭발',
    description: '상대의 카톡 한 줄로 상상의 나래를 펼치는 로맨티스트. 표현은 풍부하지만 진도는 조심조심, 새벽 감성으로 마음을 키워 가요.',
    strengths: ['감수성이 풍부해서 대화가 따뜻하고 특별해요', '상대의 작은 말에도 진심으로 반응해요'],
    watchOut: ['상상이 앞서서 혼자 서운해질 수 있어요'],
    bestMatch: '선느폭밀',
    worstMatch: '후빠담직',
    coachTip: '머릿속 시나리오보다 실제 대화를 믿어 보세요. 궁금하면 가볍게 물어보는 게 정답이에요.',
    recommendedTone: 'natural',
  },
  {
    code: '후느담직',
    name: '겉철벽 속직진',
    emoji: '🧊',
    oneLiner: '겉은 철벽, 마음 정하면 반전 직진',
    description: '연락도 기다리고 답장도 느긋하고 말투는 담백. 그런데 확신이 서는 순간, 아무도 예상 못 한 직진으로 반전을 보여 주는 타입.',
    strengths: ['신중하게 고른 만큼 한번 정하면 진지해요', '감정에 휩쓸리지 않아 안정적이에요'],
    watchOut: ['철벽이 너무 두꺼우면 상대가 다가오기도 전에 포기해요'],
    bestMatch: '선느담직',
    worstMatch: '후빠폭밀',
    coachTip: '확신이 올 때까지 기다리지 말고 관심의 문을 조금 열어 두세요. 질문 하나가 문손잡이예요.',
    recommendedTone: 'sincere',
  },
  {
    code: '후느담밀',
    name: '신비주의 읽씹러',
    emoji: '🔮',
    oneLiner: '읽었지만 답은 마음 내킬 때. 신비주의 그 자체',
    description: '먼저 연락은 거의 없고, 답장은 느긋하고, 말은 짧고, 마음은 쉽게 안 보여 줘요. 알 수 없어서 오히려 궁금하게 만드는 미스터리 캐릭터.',
    strengths: ['혼자서도 충만해서 집착하지 않아요', '쉽게 휘둘리지 않는 단단함이 있어요'],
    watchOut: ['읽씹이 반복되면 상대는 관심 없다고 확신해요', '좋아하는 마음도 표현하지 않으면 전해지지 않아요'],
    bestMatch: '선느담밀',
    worstMatch: '후빠폭직',
    coachTip: '마음에 드는 사람에겐 답장 속도부터 바꿔 보세요. 신비주의는 유지하되, 읽씹만은 금지!',
    recommendedTone: 'witty',
  },
];

export const KKTI_TYPES: Readonly<Record<string, KktiType>> = Object.fromEntries(TYPE_LIST.map((t) => [t.code, t]));

/** 16유형 코드 (선·후 → 빠·느 → 폭·담 → 직·밀 순서) */
export const KKTI_CODES: readonly string[] = TYPE_LIST.map((t) => t.code);

export const kktiType = (code: string): KktiType | null => KKTI_TYPES[code] ?? null;

/** 유형 코드를 글자 4개로 */
export const codeLetters = (code: string): string[] => Array.from(code);

/** 받침 유무에 따라 조사 고르기 (예: 표현 → 은, 진도 → 는) */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return withoutBatchim;
  return (last - 0xac00) % 28 === 0 ? withoutBatchim : withBatchim;
}

/** 두 유형이 왜 잘 맞는지·안 맞는지 한 줄 (축을 비교해 만든다) */
export function matchReason(selfCode: string, otherCode: string): string {
  const a = codeLetters(selfCode);
  const b = codeLetters(otherCode);
  const rest = [1, 2, 3];
  const same = rest.filter((i) => a[i] === b[i]).map((i) => KKTI_AXES[i].label);
  const diff = rest.filter((i) => a[i] !== b[i]).map((i) => KKTI_AXES[i].label);
  const iLead = a[0] === KKTI_AXES[0].plus.letter;
  const head =
    a[0] !== b[0]
      ? iLead
        ? '내가 먼저 다가가면 반갑게 받아 주고'
        : '먼저 다가와 줘서 기다릴 필요가 없고'
      : iLead
        ? '둘 다 먼저 연락하려다 주도권 싸움이 나고'
        : '둘 다 선톡만 기다리다 대화가 시작도 안 되고';
  if (!diff.length) return `${head}, ${same.join('·')}까지 똑 닮았어요`;
  if (!same.length) return `${head}, ${diff.join('·')}까지 전부 반대예요`;
  const diffText = diff.join('·');
  return `${head}, ${diffText}${josa(diffText, '은', '는')} 서로 맞춰 가야 해요`;
}

// ───────────────────────── 애니어그램 추정 ─────────────────────────

export interface KktiEnneagram {
  /** 1~9 */
  number: number;
  name: string;
  /** 예: 2번 조력가 */
  title: string;
  /** 이유 한 줄 */
  reason: string;
  /** 「추정」임을 밝히는 안내 */
  note: string;
}

/** 축 값 [연락 시작, 답장 속도, 표현, 진도] 의 대표 모습 */
const ENNEAGRAM: { number: number; name: string; vibe: string; proto: [number, number, number, number] }[] = [
  { number: 1, name: '개혁가', vibe: '바르고 성실한 결', proto: [-0.2, 0.6, -0.7, 0.6] },
  { number: 2, name: '조력가', vibe: '다정하게 챙겨 주는 결', proto: [0.7, 0.8, 0.8, 0.2] },
  { number: 3, name: '성취가', vibe: '목표를 향해 달리는 결', proto: [0.7, 0.7, -0.2, 0.9] },
  { number: 4, name: '예술가', vibe: '나만의 감성을 지키는 결', proto: [-0.4, -0.7, 0.9, -0.5] },
  { number: 5, name: '사색가', vibe: '한발 물러서 관찰하는 결', proto: [-0.8, -0.6, -0.8, -0.4] },
  { number: 6, name: '충성가', vibe: '신중하고 의리 있는 결', proto: [-0.5, 0.8, 0.2, -0.6] },
  { number: 7, name: '열정가', vibe: '즐거움을 좇는 자유로운 결', proto: [0.9, 0.3, 0.8, -0.8] },
  { number: 8, name: '도전가', vibe: '거침없이 이끄는 결', proto: [0.9, -0.3, -0.6, 0.9] },
  { number: 9, name: '평화주의자', vibe: '편안함을 지키는 결', proto: [-0.8, -0.4, 0.3, -0.1] },
];

export const ENNEAGRAM_NOTE = '카톡 습관 12문항으로 본 재미용 추정이에요. 정확한 유형은 정식 검사로 확인해 보세요.';

const AXIS_ORDER: readonly KktiAxisKey[] = KKTI_AXES.map((a) => a.key);

/** 길이를 1로 맞춘 대표 모습 — 방향(코사인)으로 비교해야 가운데 몰린 답이 한 유형에 쏠리지 않는다 */
const ENNEAGRAM_UNIT = ENNEAGRAM.map((e) => {
  const n = Math.hypot(...e.proto);
  return e.proto.map((p) => p / n);
});

/** 축 값(-1~1)과 방향이 가장 닮은 애니어그램 유형을 고르고, 가장 잘 들어맞는 축 두 개로 이유를 만든다 */
export function estimateEnneagram(values: KktiAxisValues): KktiEnneagram {
  const v = AXIS_ORDER.map((k) => values[k]);
  let best = ENNEAGRAM[0];
  let bestScore = -Infinity;
  ENNEAGRAM.forEach((e, index) => {
    const score = ENNEAGRAM_UNIT[index].reduce((sum, p, i) => sum + p * v[i], 0);
    if (score > bestScore + 1e-9) {
      best = e;
      bestScore = score;
    }
  });
  // 대표 모습과 같은 방향으로 가장 크게 기운 축 두 개
  const ranked = AXIS_ORDER.map((key, i) => ({ i, fit: best.proto[i] * v[i], weight: Math.abs(best.proto[i]) }))
    .sort((x, y) => y.fit - x.fit || y.weight - x.weight)
    .slice(0, 2)
    .sort((x, y) => x.i - y.i);
  const poleOf = (i: number) => {
    const axis = KKTI_AXES[i];
    const lean = v[i] !== 0 ? v[i] : best.proto[i];
    return lean >= 0 ? axis.plus : axis.minus;
  };
  const [first, second] = ranked.map((r) => poleOf(r.i));
  return {
    number: best.number,
    name: best.name,
    title: `${best.number}번 ${best.name}`,
    reason: `${first.and} ${second.adn} 모습에서 ${best.number}번 ${best.name}의 ${best.vibe}이 보여요.`,
    note: ENNEAGRAM_NOTE,
  };
}

// ───────────────────────── 나만의 연애 컬러 ─────────────────────────

export interface KktiNamedColor {
  name: string;
  hex: string;
  /** 색의 느낌 한 줄 */
  mood: string;
}

/** 이름 있는 색 — 계산한 색과 가장 가까운 이름을 붙인다 */
export const KKTI_COLORS: readonly KktiNamedColor[] = [
  { name: '체리 콕', hex: '#E83049', mood: '톡 쏘는 탄산처럼, 거침없이 설렘을 터뜨리는 색' },
  { name: '새벽 와인', hex: '#732639', mood: '천천히 취하듯 깊어지는, 어른스러운 사랑의 색' },
  { name: '딸기 우유', hex: '#F9B8C3', mood: '한 모금에 기분이 풀리는 달달하고 순한 색' },
  { name: '로즈 쿼츠', hex: '#DAA9B6', mood: '조용히 마음을 어루만져 주는 다정한 색' },
  { name: '핫핑크 팝', hex: '#F04C9E', mood: '등장만으로 분위기를 바꾸는 톡톡 튀는 색' },
  { name: '빈티지 로즈', hex: '#B06D78', mood: '오래 볼수록 정이 드는 은은한 색' },
  { name: '라즈베리 잼', hex: '#A5275B', mood: '새콤달콤, 한번 빠지면 헤어나기 힘든 색' },
  { name: '벚꽃 엔딩', hex: '#F6CBD6', mood: '봄바람처럼 살랑, 첫 설렘을 닮은 색' },
  { name: '노을 코랄', hex: '#FF7F6B', mood: '해 질 녘 하늘처럼 따뜻하고 솔직한 설렘의 색' },
  { name: '복숭아 소다', hex: '#FFC2A3', mood: '보기만 해도 기분 좋아지는 상큼 발랄한 색' },
  { name: '불꽃놀이 레드', hex: '#E93420', mood: '한순간에 밤하늘을 수놓는 강렬한 고백의 색' },
  { name: '레드 벨벳', hex: '#8C1C1C', mood: '깊고 진해서 한번 보면 잊히지 않는 색' },
  { name: '테라코타', hex: '#B85C3D', mood: '흙처럼 단단하고 따뜻한, 믿음 가는 색' },
  { name: '오렌지 마멀레이드', hex: '#F48D34', mood: '햇살을 머금은 듯 밝고 에너지 넘치는 색' },
  { name: '살구 젤리', hex: '#F6B98E', mood: '말랑말랑, 곁에 있으면 편안해지는 색' },
  { name: '시나몬 라떼', hex: '#B48664', mood: '포근한 카페처럼 오래 머물고 싶은 색' },
  { name: '모카 브라운', hex: '#6E4A35', mood: '진한 커피처럼 묵직하고 깊은 색' },
  { name: '버터 크림', hex: '#FAE6A8', mood: '부드럽게 녹아드는 다정함의 색' },
  { name: '레몬 사탕', hex: '#FBEE60', mood: '입안 가득 상큼, 웃음이 터지는 색' },
  { name: '허니 머스타드', hex: '#DF9F20', mood: '달콤함 뒤에 톡 쏘는 반전 매력의 색' },
  { name: '바닐라 라떼', hex: '#E3D2B5', mood: '부드럽고 편안해서 매일 찾게 되는 색' },
  { name: '카라멜 마키아토', hex: '#A66F30', mood: '달콤 쌉싸름, 알수록 깊은 맛이 나는 색' },
  { name: '해바라기', hex: '#F6CD28', mood: '한 사람만 해맑게 바라보는 일편단심의 색' },
  { name: '라임 소다', hex: '#A9E25A', mood: '청량하게 톡 터지는 반전 매력의 색' },
  { name: '말차 라떼', hex: '#8CB168', mood: '쌉쌀하지만 자꾸 생각나는 은근한 색' },
  { name: '올리브 숲', hex: '#556732', mood: '흔들림 없이 깊고 차분한 색' },
  { name: '아보카도', hex: '#839B3B', mood: '겉은 단단해도 속은 부드러운 반전의 색' },
  { name: '민트 초코', hex: '#8DE2CD', mood: '호불호? 좋아하는 사람은 미치게 좋아하는 색' },
  { name: '스피어민트', hex: '#5EEDC0', mood: '한 번 씹으면 정신이 번쩍, 산뜻하게 다가가는 색' },
  { name: '청포도 에이드', hex: '#BCE9A5', mood: '싱그럽고 풋풋한 첫사랑의 색' },
  { name: '포레스트 그린', hex: '#2A6F4D', mood: '깊은 숲처럼 든든하게 곁을 지키는 색' },
  { name: '에메랄드', hex: '#20B678', mood: '한결같이 빛나는 귀한 마음의 색' },
  { name: '세이지 그린', hex: '#8BB191', mood: '말없이 편안함을 건네는 차분한 색' },
  { name: '여름 바다', hex: '#22C3C3', mood: '시원하게 탁 트인 솔직함의 색' },
  { name: '아쿠아 소다', hex: '#82E4ED', mood: '맑고 청량해서 대화가 술술 풀리는 색' },
  { name: '심해 청록', hex: '#1D6472', mood: '깊이를 알 수 없어 더 궁금해지는 색' },
  { name: '박하 사탕', hex: '#C0EDE4', mood: '화하게 기분을 깨우는 상쾌한 색' },
  { name: '맑은 하늘', hex: '#7BC2F4', mood: '구름 한 점 없이 투명한 마음의 색' },
  { name: '서핑 블루', hex: '#29A9E0', mood: '파도 타듯 경쾌하게 다가가는 색' },
  { name: '코발트 블루', hex: '#1F5CD6', mood: '확신에 찬, 선명하고 시원한 색' },
  { name: '밤하늘 네이비', hex: '#1D2B63', mood: '말없이 깊은 밤처럼 신비로운 색' },
  { name: '데님 블루', hex: '#5073A5', mood: '오래 입은 청바지처럼 편안하고 믿음직한 색' },
  { name: '아이스 블루', hex: '#C4E3F3', mood: '차가운 듯 맑아서 오히려 끌리는 색' },
  { name: '블루 아워', hex: '#3D488F', mood: '해가 진 직후처럼 고요하게 설레는 색' },
  { name: '안개 블루', hex: '#A2B3C3', mood: '흐릿해서 더 알고 싶어지는 색' },
  { name: '새벽 라벤더', hex: '#B7A0E3', mood: '잠 못 드는 새벽, 몽글몽글한 감성의 색' },
  { name: '바이올렛 나잇', hex: '#522D86', mood: '밤이 깊을수록 진해지는 마음의 색' },
  { name: '라일락 향기', hex: '#D4B5E3', mood: '은은한 향기처럼 오래 남는 색' },
  { name: '포도 젤리', hex: '#8A2EB8', mood: '탱글탱글, 한번 맛보면 계속 생각나는 색' },
  { name: '블루베리 요거트', hex: '#9994D1', mood: '새콤달콤 부드러운, 편안한 설렘의 색' },
  { name: '울트라 마린', hex: '#4E42D7', mood: '깊고 선명해서 눈을 뗄 수 없는 색' },
  { name: '퍼플 팝', hex: '#8F5CF5', mood: '톡 튀는데 묘하게 신비로운, 반전 매력의 색' },
  { name: '미드나잇 퍼플', hex: '#3E1E96', mood: '자정이 넘어도 잠들지 않는 깊은 마음의 색' },
  { name: '자두 와인', hex: '#723772', mood: '무르익을수록 깊어지는 어른의 색' },
  { name: '아메시스트', hex: '#B561D1', mood: '신비롭고 우아하게 시선을 끄는 색' },
  { name: '매직 마젠타', hex: '#DD3CC2', mood: '마법처럼 분위기를 바꾸는 대담한 색' },
  { name: '모브 핑크', hex: '#C695B6', mood: '부드럽지만 존재감 있는 세련된 색' },
  { name: '오로라 핑크', hex: '#F5A3E0', mood: '밤하늘 오로라처럼 꿈결 같은 색' },
  { name: '오트밀', hex: '#DDD3C6', mood: '자극 없이 편안해서 매일 보고 싶은 색' },
  { name: '몽글 그레이지', hex: '#B0A69B', mood: '튀지 않아도 은근히 끌리는 색' },
  { name: '구름 그레이', hex: '#C0C6CE', mood: '흐린 날 구름처럼 포근한 색' },
  { name: '새벽 차콜', hex: '#434956', mood: '말수는 적어도 묵직한 진심의 색' },
  { name: '샌드 베이지', hex: '#C6B495', mood: '따뜻한 모래사장처럼 편안한 색' },
];

export interface KktiColor {
  /** 이 사람만의 색 (#RRGGBB) */
  hex: string;
  /** 가장 가까운 이름 있는 색의 이름 */
  name: string;
  /** 색의 느낌 한 줄 */
  description: string;
  /** 이름 있는 색의 원래 hex */
  namedHex: string;
  /** 색상(0~360) · 채도(%) · 명도(%) */
  hsl: { h: number; s: number; l: number };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * 표현(폭↔담) × 진도(직↔밀) 평면의 각도 → 색상.
 * 폭직=코랄, 직=호박색, 담직=민트, 담=파랑, 담밀=블루바이올렛, 밀=보라, 폭밀=핑크, 폭=체리.
 * [각도, 색상(360을 넘겨도 됨 — 마지막에 나머지 연산)]
 */
const HUE_ANCHORS: [number, number][] = [
  [0, 350],
  [45, 372],
  [90, 405],
  [135, 525],
  [180, 570],
  [225, 615],
  [270, 645],
  [315, 685],
  [360, 710],
];

function hueAt(angle: number): number {
  for (let i = 1; i < HUE_ANCHORS.length; i++) {
    const [a1, h1] = HUE_ANCHORS[i];
    if (angle <= a1) {
      const [a0, h0] = HUE_ANCHORS[i - 1];
      return h0 + ((angle - a0) / (a1 - a0)) * (h1 - h0);
    }
  }
  return HUE_ANCHORS[0][1];
}

/** 같은 seed 면 언제나 같은 수열 (mulberry32) */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const hue = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)]
    .map((x) => Math.round(x * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** sRGB → CIELAB (D65) — 사람 눈에 가까운 색 거리 계산용 */
function hexToLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const NAMED_LAB = KKTI_COLORS.map((c) => ({ color: c, lab: hexToLab(c.hex) }));

/** 가장 가까운 이름 있는 색 */
export function nearestNamedColor(hex: string): KktiNamedColor {
  const [l, a, b] = hexToLab(hex);
  let best = NAMED_LAB[0];
  let bestDistance = Infinity;
  for (const item of NAMED_LAB) {
    const d = (item.lab[0] - l) ** 2 + (item.lab[1] - a) ** 2 + (item.lab[2] - b) ** 2;
    if (d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best.color;
}

/**
 * 나만의 연애 컬러.
 * - 색상(H): 표현(폭↔담) × 진도(직↔밀) 평면에서의 방향
 * - 채도(S): 표현·진도가 한쪽으로 뚜렷할수록, 먼저 연락하는 편일수록 선명하게
 * - 명도(L): 답장이 빠를수록 밝게, 느긋할수록 깊게 (먼저 연락하는 편이면 조금 더 진하게)
 * - seed 가 있으면 고른 답 조합마다 아주 조금씩 흔들어서, 같은 유형이라도 사람마다 미묘하게 다른 색이 나온다
 */
export function loveColor(values: KktiAxisValues, seed?: number): KktiColor {
  const { start, speed, express, pace } = values;
  const radius = Math.min(1, Math.hypot(express, pace));
  const angle = ((Math.atan2(pace, express) * 180) / Math.PI + 360) % 360;
  let h = hueAt(angle);
  let s = 22 + 42 * radius + 26 * ((start + 1) / 2);
  let l = 55 + 18 * speed - 7 * start;
  if (seed !== undefined) {
    const rand = seededRandom(seed);
    h += (rand() * 2 - 1) * 8;
    s += (rand() * 2 - 1) * 6;
    l += (rand() * 2 - 1) * 4;
  }
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 10, 95);
  l = clamp(l, 24, 86);
  const hex = hslToHex(h, s, l);
  const named = nearestNamedColor(hex);
  return {
    hex,
    name: named.name,
    description: named.mood,
    namedHex: named.hex,
    hsl: { h: Math.round(h), s: Math.round(s), l: Math.round(l) },
  };
}

// ───────────────────────── 화면용 색 도우미 ─────────────────────────

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const INK_DARK = '#191F28';
const INK_LIGHT = '#FFFFFF';

/** 이 색 위에 올릴 글자색 — 흰색과 진한 회색 중 대비가 큰 쪽 */
export function readableTextOn(hex: string): string {
  return contrastRatio(hex, INK_LIGHT) >= contrastRatio(hex, INK_DARK) ? INK_LIGHT : INK_DARK;
}

/** a 와 b 를 t(0~1) 만큼 섞는다 */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const w = clamp(t, 0, 1);
  return `#${ca
    .map((v, i) => Math.round(v + (cb[i] - v) * w).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/**
 * 배경(bg) 위에서 최소 대비(min)가 나올 때까지 색을 조금씩 진하게(밝은 배경) 또는 밝게(어두운 배경) 만든다.
 * 연애 컬러를 카드 위 글자·막대에 쓸 때, 라이트·다크 모드 어디서든 읽히게 하려고 쓴다.
 */
export function legibleOn(hex: string, bg: string, min = 4.5): string {
  const toward = readableTextOn(bg) === INK_LIGHT ? '#FFFFFF' : '#000000';
  for (let step = 0; step <= 20; step++) {
    const c = mixHex(hex, toward, step / 20);
    if (contrastRatio(c, bg) >= min) return c;
  }
  return toward === '#FFFFFF' ? INK_LIGHT : INK_DARK;
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

// ───────────────────────── 답 코드 (결과 링크) ─────────────────────────

const RADIX = KKTI_QUESTIONS.map((q) => q.options.length);
const COMBINATIONS = RADIX.reduce((a, b) => a * b, 1);
const BODY_LENGTH = (COMBINATIONS - 1).toString(36).length;
/** 문항·선택지가 바뀌면 이 값을 올린다 → 예전 링크는 체크 글자가 안 맞아 「다시 하기」로 안내된다 */
const CODE_SALT = 'kkti-v1';

function checkChar(body: string): string {
  const src = CODE_SALT + body;
  let h = 7;
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) % 1000003;
  return (h % 36).toString(36);
}

export function isValidAnswers(answers: readonly number[]): boolean {
  return answers.length === RADIX.length && answers.every((a, i) => Number.isInteger(a) && a >= 0 && a < RADIX[i]);
}

/** 고른 답 번호들 → 순서를 담은 하나의 수 (혼합 진법) */
function packAnswers(answers: readonly number[]): number {
  let n = 0;
  let unit = 1;
  answers.forEach((a, i) => {
    n += a * unit;
    unit *= RADIX[i];
  });
  return n;
}

/** 12개 답(선택지 번호) → 6글자 코드 (36진수 5글자 + 확인 글자 1개) */
export function encodeAnswers(indices: readonly number[]): string {
  if (!isValidAnswers(indices)) throw new Error('KKTI: 12문항의 답이 모두 있어야 결과 코드를 만들 수 있어요.');
  const body = packAnswers(indices).toString(36).padStart(BODY_LENGTH, '0');
  return body + checkChar(body);
}

/** 6글자 코드 → 답 번호들. 잘리거나 바뀐 코드면 null (SNS 에 붙여 넣다 뒤에 붙은 「.」「)」 같은 기호는 무시) */
export function decodeAnswers(s: string | null | undefined): number[] | null {
  if (typeof s !== 'string') return null;
  const code = /^[0-9a-z]+/.exec(s.trim().toLowerCase())?.[0] ?? '';
  if (code.length !== BODY_LENGTH + 1) return null;
  const body = code.slice(0, BODY_LENGTH);
  if (checkChar(body) !== code[BODY_LENGTH]) return null;
  let n = parseInt(body, 36);
  if (!Number.isSafeInteger(n) || n < 0 || n >= COMBINATIONS) return null;
  const answers: number[] = [];
  for (const r of RADIX) {
    answers.push(n % r);
    n = Math.floor(n / r);
  }
  return answers;
}

// ───────────────────────── 결과 계산 ─────────────────────────

export interface KktiAxisResult {
  key: KktiAxisKey;
  label: string;
  emoji: string;
  plus: KktiPole;
  minus: KktiPole;
  /** 합계 점수 (-6~+6) */
  score: number;
  /** -1~1 연속값 */
  value: number;
  /** 결과로 고른 쪽 */
  pole: KktiPole;
  /** + 쪽(선·빠·폭·직) 퍼센트 0~100 */
  plusPercent: number;
  /** 고른 쪽 퍼센트 51~100 */
  percent: number;
}

export interface KktiMbti {
  /** 예: ESFJ */
  type: string;
  letters: { letter: string; from: string; confidence: number }[];
  /** 네 글자 확신도 평균 */
  confidence: number;
}

export interface KktiResult {
  code: string;
  type: KktiType;
  axes: KktiAxisResult[];
  mbti: KktiMbti;
  enneagram: KktiEnneagram;
  color: KktiColor;
  answers: number[];
  /** 결과 링크용 답 코드 */
  encoded: string;
  /** 공유할 결과 링크 */
  url: string;
}

export const KKTI_SITE = 'https://mylovecoach.vercel.app';
export const KKTI_TEST_URL = `${KKTI_SITE}/kkti`;

export const resultUrl = (answersEncoded: string) => `${KKTI_SITE}/kkti/result?a=${encodeURIComponent(answersEncoded)}`;

const MAX_SCORE: Record<KktiAxisKey, number> = KKTI_QUESTIONS.reduce(
  (acc, q) => {
    acc[q.axis] += Math.max(...q.options.map((o) => Math.abs(o.score)));
    return acc;
  },
  { start: 0, speed: 0, express: 0, pace: 0 } as Record<KktiAxisKey, number>,
);

export function computeKkti(answers: readonly number[]): KktiResult {
  if (!isValidAnswers(answers)) throw new Error('KKTI: 답이 올바르지 않아요.');
  const total: Record<KktiAxisKey, number> = { start: 0, speed: 0, express: 0, pace: 0 };
  // 합이 0 으로 비기면, 그 축에서 가장 확실하게(절댓값 큰) 고른 답 쪽으로 기운다
  const strongest: Record<KktiAxisKey, number> = { start: 0, speed: 0, express: 0, pace: 0 };
  KKTI_QUESTIONS.forEach((q, i) => {
    const score = q.options[answers[i]].score;
    total[q.axis] += score;
    if (Math.abs(score) > Math.abs(strongest[q.axis])) strongest[q.axis] = score;
  });

  const axes: KktiAxisResult[] = KKTI_AXES.map((axis) => {
    const score = total[axis.key];
    const max = MAX_SCORE[axis.key] || 1;
    const lean = score !== 0 ? Math.sign(score) : strongest[axis.key] < 0 ? -1 : 1;
    // 비긴 경우는 반 점만큼 기운 것으로 보여 준다
    const shown = score !== 0 ? score / max : (lean * 0.5) / max;
    const plusPercent = Math.round(50 + shown * 50);
    const pole = lean > 0 ? axis.plus : axis.minus;
    return {
      key: axis.key,
      label: axis.label,
      emoji: axis.emoji,
      plus: axis.plus,
      minus: axis.minus,
      score,
      value: score / max,
      pole,
      plusPercent,
      percent: lean > 0 ? plusPercent : 100 - plusPercent,
    };
  });

  const code = axes.map((a) => a.pole.letter).join('');
  const type = KKTI_TYPES[code];
  const values = Object.fromEntries(axes.map((a) => [a.key, a.value])) as KktiAxisValues;
  const letters = axes.map((a) => ({ letter: a.pole.mbti, from: a.pole.letter, confidence: a.percent }));
  const encoded = encodeAnswers(answers);

  return {
    code,
    type,
    axes,
    mbti: {
      type: letters.map((l) => l.letter).join(''),
      letters,
      confidence: Math.round(letters.reduce((sum, l) => sum + l.confidence, 0) / letters.length),
    },
    enneagram: estimateEnneagram(values),
    color: loveColor(values, packAnswers(answers)),
    answers: [...answers],
    encoded,
    url: resultUrl(encoded),
  };
}

/** 결과 링크의 답 코드로 바로 결과 계산 (잘못된 코드면 null) */
export function kktiFromCode(encoded: string | null | undefined): KktiResult | null {
  const answers = decodeAnswers(encoded);
  return answers ? computeKkti(answers) : null;
}

/** 프로필에 저장할 모양 */
export function toSaved(result: KktiResult, at: number = Date.now()): KktiSaved {
  return {
    code: result.code,
    name: result.type.name,
    emoji: result.type.emoji,
    color: result.color.hex,
    colorName: result.color.name,
    mbti: result.mbti.type,
    enneagram: result.enneagram.number,
    at,
  };
}

/** SNS 공유 문구 — X(280자, 한글 2자 계산)에도 들어가는 길이 */
export function shareText(result: KktiResult, url: string = result.url): string {
  const { type, mbti, color } = result;
  return [
    `나의 KKTI는 ${type.emoji} ${type.code} 「${type.name}」`,
    `"${type.oneLiner}"`,
    `카톡 속 진짜 MBTI ${mbti.type} · 연애 컬러 ${color.name}`,
    `너도 1분 만에 해 봐 👉 ${url}`,
    '#KKTI #카톡MBTI #연애MBTI',
  ].join('\n');
}
