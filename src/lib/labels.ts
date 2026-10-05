import type { Gender, Relationship, Temperature, Tone } from '@/lib/types';

export const TONES: { key: Tone; label: string; emoji: string; description: string }[] = [
  { key: 'natural', label: '자연스럽게', emoji: '😊', description: '부담 없이 대화가 이어지는 톤' },
  { key: 'flirty', label: '설레게', emoji: '🔥', description: '은근한 호감이 느껴지는 플러팅' },
  { key: 'witty', label: '유머러스', emoji: '🤣', description: '가볍게 웃음을 주는 센스' },
  { key: 'cool', label: '쿨하게', emoji: '😎', description: '여유 있고 담백하게' },
  { key: 'sincere', label: '진심으로', emoji: '🥺', description: '솔직하고 따뜻하게' },
];

export const toneLabel = (tone: Tone) => TONES.find((t) => t.key === tone) ?? TONES[0];

export const RELATIONSHIPS: { key: Relationship; label: string; emoji: string }[] = [
  { key: 'crush', label: '짝사랑', emoji: '💘' },
  { key: 'talking', label: '썸', emoji: '💬' },
  { key: 'blind_date', label: '소개팅', emoji: '🍽️' },
  { key: 'friend', label: '친구', emoji: '🙌' },
  { key: 'dating', label: '연인', emoji: '💕' },
  { key: 'ex', label: '재회', emoji: '🔁' },
];

export const relationshipLabel = (r: Relationship) => RELATIONSHIPS.find((x) => x.key === r) ?? RELATIONSHIPS[1];

export const GENDERS: { key: Gender; label: string }[] = [
  { key: 'female', label: '여성' },
  { key: 'male', label: '남성' },
  { key: 'other', label: '기타' },
];

export const genderLabel = (g: Gender) => GENDERS.find((x) => x.key === g)?.label ?? '';

export const MBTI_LIST = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
  'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP',
  'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
] as const;

export const CRUSH_STYLE_TAGS = [
  '답장 느림', '답장 빠름', '츤데레', '리액션 부자', '무뚝뚝', '장난기 많음',
  '진지함', '이모티콘 많이 씀', '워커홀릭', '집순이/집돌이', '운동 좋아함',
  '맛집 탐방', '여행 좋아함', '영화/드라마', '게임', '음악', '반려동물', '낯가림',
];

export const MY_STYLE_TAGS = [
  '낯가림', '적극적', '장난기 많음', '진지함', '리액션 좋음', '말수 적음',
  '이모티콘 애용', '유머 있음', '배려심 많음', '직진 스타일', '눈치 빠름',
];

export const TEMPERATURES: Record<Temperature, { label: string; emoji: string; description: string }> = {
  hot: { label: '뜨거움', emoji: '🔥', description: '호감이 확실해요. 자신 있게 가도 돼요.' },
  warm: { label: '따뜻함', emoji: '🌤️', description: '긍정적 신호가 있어요. 천천히 거리 좁혀봐요.' },
  neutral: { label: '보통', emoji: '☁️', description: '아직 판단하긴 일러요. 대화를 더 쌓아봐요.' },
  cold: { label: '차가움', emoji: '🧊', description: '지금은 밀어붙이기보다 여유가 필요해요.' },
  unknown: { label: '분석 전', emoji: '💭', description: '대화를 올리면 온도를 알려드려요.' },
};

/** 이 사람과의 목표 (상대별) */
export const CRUSH_GOALS = ['연락 이어가기', '첫 약속 잡기', '썸 → 연애', '고백 성공', '다시 만나기', '권태기 극복', '오래 행복하게', '동거·결혼 이야기'];

/** 나의 연애 목표 */
export const MY_GOALS = ['올해 안에 연애 시작', '썸 끝내고 확실하게', '소개팅 애프터 성공', '재회하고 싶어요', '지금 연애 오래 가기', '동거·결혼 준비', '그냥 연애 감 익히기'];

/** 추구미 — 상대에게 보이고 싶은 내 모습 */
export const VIBE_TAGS = [
  '다정한', '여유로운', '시크한', '유쾌한', '어른스러운', '귀여운', '솔직한', '센스 있는',
  '지적인', '든든한', '설레게 하는', '편안한', '미스터리한', '적극적인', '차분한', '밝은',
];

export const SPEECH_OPTIONS: { key: 'auto' | 'polite' | 'casual'; label: string; description: string }[] = [
  { key: 'auto', label: '🪞 캡처 따라', description: '대화에서 쓰던 말투 그대로' },
  { key: 'polite', label: '🙇 존댓말', description: '항상 존댓말로' },
  { key: 'casual', label: '👋 반말', description: '항상 반말로' },
];

export const EMOJI_OPTIONS: { key: 'on' | 'off' | 'auto'; label: string }[] = [
  { key: 'on', label: '😊 넣기' },
  { key: 'auto', label: '🪞 대화 따라' },
  { key: 'off', label: '🚫 빼기' },
];
