import { L } from '@/lib/i18n';
import type { Gender, Relationship, Temperature, Tone } from '@/lib/types';

export const TONES: { key: Tone; label: string; emoji: string; description: string }[] = [
  { key: 'natural', label: L('자연스럽게', 'Natural'), emoji: '😊', description: L('부담 없이 대화가 이어지는 톤', 'Easygoing, keeps the convo flowing') },
  { key: 'flirty', label: L('설레게', 'Flirty'), emoji: '🔥', description: L('은근한 호감이 느껴지는 플러팅', 'Subtle flirting that shows interest') },
  { key: 'witty', label: L('유머러스', 'Witty'), emoji: '🤣', description: L('가볍게 웃음을 주는 센스', 'Light and playful, makes them laugh') },
  { key: 'cool', label: L('쿨하게', 'Chill'), emoji: '😎', description: L('여유 있고 담백하게', 'Relaxed and low-key') },
  { key: 'sincere', label: L('진심으로', 'Sincere'), emoji: '🥺', description: L('솔직하고 따뜻하게', 'Honest and warm') },
];

export const toneLabel = (tone: Tone) => TONES.find((t) => t.key === tone) ?? TONES[0];

export const RELATIONSHIPS: { key: Relationship; label: string; emoji: string }[] = [
  { key: 'crush', label: L('짝사랑', 'Crush'), emoji: '💘' },
  { key: 'talking', label: L('썸', 'Talking stage'), emoji: '💬' },
  { key: 'blind_date', label: L('소개팅', 'Blind date'), emoji: '🍽️' },
  { key: 'friend', label: L('친구', 'Friend'), emoji: '🙌' },
  { key: 'dating', label: L('연인', 'Dating'), emoji: '💕' },
  { key: 'ex', label: L('재회', 'Ex'), emoji: '🔁' },
];

export const relationshipLabel = (r: Relationship) => RELATIONSHIPS.find((x) => x.key === r) ?? RELATIONSHIPS[1];

export const GENDERS: { key: Gender; label: string }[] = [
  { key: 'female', label: L('여성', 'Woman') },
  { key: 'male', label: L('남성', 'Man') },
  { key: 'other', label: L('기타', 'Other') },
];

export const genderLabel = (g: Gender) => GENDERS.find((x) => x.key === g)?.label ?? '';

export const MBTI_LIST = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
  'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP',
  'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
] as const;

// 태그·목표는 고른 글자 그대로 저장·AI 에 보낸다 → 영어판은 영어 글자로 저장 (한국어판 저장값은 그대로)
export const CRUSH_STYLE_TAGS = L(
  [
    '답장 느림', '답장 빠름', '츤데레', '리액션 부자', '무뚝뚝', '장난기 많음',
    '진지함', '이모티콘 많이 씀', '워커홀릭', '집순이/집돌이', '운동 좋아함',
    '맛집 탐방', '여행 좋아함', '영화/드라마', '게임', '음악', '반려동물', '낯가림',
  ],
  [
    'Slow replier', 'Fast replier', 'Hot and cold', 'Big reactions', 'Dry texter', 'Playful',
    'Serious', 'Emoji lover', 'Workaholic', 'Homebody', 'Into fitness',
    'Foodie', 'Loves travel', 'Movies/TV', 'Gamer', 'Music', 'Pet lover', 'Shy at first',
  ],
);

export const MY_STYLE_TAGS = L(
  [
    '낯가림', '적극적', '장난기 많음', '진지함', '리액션 좋음', '말수 적음',
    '이모티콘 애용', '유머 있음', '배려심 많음', '직진 스타일', '눈치 빠름',
  ],
  [
    'Shy at first', 'Outgoing', 'Playful', 'Serious', 'Great reactions', 'Quiet',
    'Emoji lover', 'Funny', 'Thoughtful', 'Straight shooter', 'Reads the room',
  ],
);

export const TEMPERATURES: Record<Temperature, { label: string; emoji: string; description: string }> = {
  hot: { label: L('뜨거움', 'Hot'), emoji: '🔥', description: L('호감이 확실해요. 자신 있게 가도 돼요.', "They're clearly into you. Go for it.") },
  warm: { label: L('따뜻함', 'Warm'), emoji: '🌤️', description: L('긍정적 신호가 있어요. 천천히 거리 좁혀봐요.', 'Good signs here. Close the gap slowly.') },
  neutral: { label: L('보통', 'Neutral'), emoji: '☁️', description: L('아직 판단하긴 일러요. 대화를 더 쌓아봐요.', 'Too early to tell. Keep the convo going.') },
  cold: { label: L('차가움', 'Cold'), emoji: '🧊', description: L('지금은 밀어붙이기보다 여유가 필요해요.', 'Give it some space instead of pushing.') },
  unknown: { label: L('분석 전', 'Not yet'), emoji: '💭', description: L('대화를 올리면 온도를 알려드려요.', "Share your chat and we'll read the interest level.") },
};

/** 이 사람과의 목표 (상대별) */
export const CRUSH_GOALS = L(
  ['연락 이어가기', '첫 약속 잡기', '썸 → 연애', '고백 성공', '다시 만나기', '권태기 극복', '오래 행복하게', '동거·결혼 이야기'],
  ['Keep talking', 'Set up a first date', 'Talking stage → dating', 'Ask them out', 'Get back together', 'Beat the rut', 'Stay happy long-term', 'Moving in / marriage'],
);

/** 나의 연애 목표 */
export const MY_GOALS = L(
  ['올해 안에 연애 시작', '썸 끝내고 확실하게', '소개팅 애프터 성공', '재회하고 싶어요', '지금 연애 오래 가기', '동거·결혼 준비', '그냥 연애 감 익히기'],
  ['Start dating this year', 'Make the talking stage official', 'Land a second date', 'Get back with my ex', 'Make my relationship last', 'Moving in / marriage', 'Just get better at dating'],
);

/** 추구미 — 상대에게 보이고 싶은 내 모습 */
export const VIBE_TAGS = L(
  [
    '다정한', '여유로운', '시크한', '유쾌한', '어른스러운', '귀여운', '솔직한', '센스 있는',
    '지적인', '든든한', '설레게 하는', '편안한', '미스터리한', '적극적인', '차분한', '밝은',
  ],
  [
    'Sweet', 'Laid-back', 'Chic', 'Fun', 'Mature', 'Cute', 'Honest', 'Clever',
    'Smart', 'Reliable', 'Flirty', 'Easy to be around', 'Mysterious', 'Bold', 'Calm', 'Bright',
  ],
);

// 존댓말·반말은 영어에 없다 — 영어판 화면은 이 선택지를 숨긴다 (crush-form). 값은 그대로 둔다
export const SPEECH_OPTIONS: { key: 'auto' | 'polite' | 'casual'; label: string; description: string }[] = [
  { key: 'auto', label: L('🪞 캡처 따라', '🪞 Match the chat'), description: L('대화에서 쓰던 말투 그대로', 'Same style you already use') },
  { key: 'polite', label: L('🙇 존댓말', '🙇 Polite'), description: L('항상 존댓말로', 'Always polite') },
  { key: 'casual', label: L('👋 반말', '👋 Casual'), description: L('항상 반말로', 'Always casual') },
];

export const EMOJI_OPTIONS: { key: 'on' | 'off' | 'auto'; label: string }[] = [
  { key: 'on', label: L('😊 넣기', '😊 Use emoji') },
  { key: 'auto', label: L('🪞 대화 따라', '🪞 Match the chat') },
  { key: 'off', label: L('🚫 빼기', '🚫 No emoji') },
];
