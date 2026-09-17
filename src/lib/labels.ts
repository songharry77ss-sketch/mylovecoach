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
