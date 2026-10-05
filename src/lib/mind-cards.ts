import type { Gender } from '@/lib/types';

/**
 * 「이 상황에서 남자(여자)는 어떻게 생각할까?」 랜덤 카드.
 * 앱이 상황 카드를 무작위로 뽑아 보여 주고, 누르면 AI 가 그 사람 입장의 속마음을 풀어 준다.
 */
export type MindCategory = '연락' | '썸' | '데이트' | '연애중' | '이별·재회';

export interface MindCard {
  id: string;
  category: MindCategory;
  emoji: string;
  /** {them} 자리에 남자/여자/상대가 들어간다 */
  situation: string;
}

export const MIND_CATEGORIES: MindCategory[] = ['연락', '썸', '데이트', '연애중', '이별·재회'];

/*
 * 작성 규칙: {them} 에 들어가는 「남자·여자·상대」는 모두 받침이 없으므로
 * {them} 바로 뒤에는 받침 없는 말에 붙는 조사(가·는·를·와·랑·의·에게·한테)만 쓴다.
 * 이·은·을·과·으로 는 쓰지 않는다 (테스트로 확인).
 */
export const MIND_CARDS: MindCard[] = [
  // 연락
  { id: 'text-1', category: '연락', emoji: '💬', situation: '{them}가 "뭐해?"라고만 보내고 2시간째 답이 없어요.' },
  { id: 'text-2', category: '연락', emoji: '👀', situation: '{them}가 내 카톡을 바로 읽고, 답장은 다음 날 아침에야 보냈어요.' },
  { id: 'text-3', category: '연락', emoji: '🐢', situation: '칼답하던 {them}가 사흘째 답장이 몇 시간씩 늦어요.' },
  { id: 'text-4', category: '연락', emoji: '🌙', situation: '새벽 1시에 {them}가 "자?"라고 보냈어요.' },
  { id: 'text-5', category: '연락', emoji: '🍺', situation: '{them}가 꼭 술 마신 날에만 먼저 연락해요.' },
  { id: 'text-6', category: '연락', emoji: '📱', situation: '{them}가 내 스토리는 제일 먼저 보는데, 카톡은 내가 먼저 해야만 와요.' },
  { id: 'text-7', category: '연락', emoji: '📩', situation: '평소 단답만 하던 {them}가 오늘은 먼저 긴 카톡을 보냈어요.' },
  { id: 'text-8', category: '연락', emoji: '📞', situation: '카톡은 매일 하는데 {them}가 전화하자는 말은 한 번도 안 해요.' },

  // 썸
  { id: 'some-1', category: '썸', emoji: '🤔', situation: '{them}가 "너 같은 사람 만나고 싶다"고 했어요.' },
  { id: 'some-2', category: '썸', emoji: '😳', situation: '{them}가 장난처럼 "우리 사귈까?" 하더니 바로 "ㅋㅋ 농담"이라고 했어요.' },
  { id: 'some-3', category: '썸', emoji: '🌀', situation: '세 번 만났는데 {them}는 아직 고백도, 선 긋기도 안 해요.' },
  { id: 'some-4', category: '썸', emoji: '🙊', situation: '"우리 무슨 사이야?"라고 물었더니 {them}가 웃으면서 말을 돌렸어요.' },
  { id: 'some-5', category: '썸', emoji: '🍪', situation: '지나가듯 말한 내 최애 과자를 {them}가 기억했다가 사 왔어요.' },
  { id: 'some-6', category: '썸', emoji: '🚧', situation: '{them}가 "요즘 연애할 생각 없어"라면서 연락은 매일 해요.' },
  { id: 'some-7', category: '썸', emoji: '📲', situation: '{them}가 밤마다 통화하자고 하는데, 만나자는 말은 없어요.' },
  { id: 'some-8', category: '썸', emoji: '💌', situation: '썸 타는 중인데 {them}가 소개팅 들어왔다는 얘기를 나한테 했어요.' },

  // 데이트
  { id: 'date-1', category: '데이트', emoji: '🎬', situation: '첫 데이트 후 {them}가 "오늘 재밌었어요"만 보내고 다음 약속 얘기는 없어요.' },
  { id: 'date-2', category: '데이트', emoji: '💳', situation: '{them}가 첫 데이트 비용을 다 내고 "다음엔 커피 사 줘요"라고 했어요.' },
  { id: 'date-3', category: '데이트', emoji: '📵', situation: '데이트 내내 {them}가 휴대폰을 자주 확인했어요.' },
  { id: 'date-4', category: '데이트', emoji: '📍', situation: '{them}가 데이트 장소를 매번 나한테 정하라고 해요.' },
  { id: 'date-5', category: '데이트', emoji: '🤝', situation: '걷다가 손이 몇 번 스쳤는데 {them}가 피하지 않았어요.' },
  { id: 'date-6', category: '데이트', emoji: '😶', situation: '{them}가 데이트 중에 전 연인 얘기를 꺼냈어요.' },
  { id: 'date-7', category: '데이트', emoji: '🤒', situation: '{them}가 약속 당일 아침에 컨디션이 안 좋다며 다음으로 미루자고 했어요.' },
  { id: 'date-8', category: '데이트', emoji: '📸', situation: '{them}가 같이 찍은 사진을 자기 인스타 스토리에 올렸어요.' },

  // 연애중
  { id: 'couple-1', category: '연애중', emoji: '📉', situation: '사귄 지 100일쯤 되니 {them}의 연락이 눈에 띄게 줄었어요.' },
  { id: 'couple-2', category: '연애중', emoji: '🙄', situation: '{them}가 "그냥 알아서 해"라고 하고 대화를 끝냈어요.' },
  { id: 'couple-3', category: '연애중', emoji: '😢', situation: '서운하다고 말했더니 {them}가 "그게 왜 서운해?"라고 했어요.' },
  { id: 'couple-4', category: '연애중', emoji: '📅', situation: '{them}가 기념일을 깜빡하고, 다음 날 아무 일 없다는 듯 연락했어요.' },
  { id: 'couple-5', category: '연애중', emoji: '🍰', situation: '싸운 다음 날 {them}가 사과 대신 내가 좋아하는 케이크를 사 왔어요.' },
  { id: 'couple-6', category: '연애중', emoji: '🏠', situation: '7년째 만나는 {them}에게 같이 살아 보자고 했더니 "생각해 볼게"라고만 했어요.' },
  { id: 'couple-7', category: '연애중', emoji: '📺', situation: '{them}가 주말마다 "그냥 집에서 쉬자"고 해요.' },
  { id: 'couple-8', category: '연애중', emoji: '💍', situation: '결혼 얘기만 나오면 {them}가 슬쩍 화제를 돌려요.' },

  // 이별·재회
  { id: 'ex-1', category: '이별·재회', emoji: '📨', situation: '헤어진 지 두 달, {them}가 "잘 지내?"라고 연락했어요.' },
  { id: 'ex-2', category: '이별·재회', emoji: '⌛', situation: '{them}가 헤어지자는 말 대신 "시간을 좀 갖자"고 했어요.' },
  { id: 'ex-3', category: '이별·재회', emoji: '👻', situation: '헤어진 {them}가 아직 내 인스타를 팔로우하고 스토리도 다 봐요.' },
  { id: 'ex-4', category: '이별·재회', emoji: '👤', situation: '헤어진 {them}가 차단은 안 하고 프로필 사진만 내렸어요.' },
  { id: 'ex-5', category: '이별·재회', emoji: '🥃', situation: '{them}가 술 취해서 "보고 싶다"고 보내고, 다음 날엔 아무 말이 없어요.' },
  { id: 'ex-6', category: '이별·재회', emoji: '☔', situation: '헤어질 때 {them}가 "너는 잘못 없어, 내가 문제야"라고 했어요.' },
  { id: 'ex-7', category: '이별·재회', emoji: '🎁', situation: '헤어진 {them}가 내 생일에 "생일 축하해" 한 줄만 보냈어요.' },
  { id: 'ex-8', category: '이별·재회', emoji: '🔁', situation: '다시 만나기로 한 {them}가 예전보다 연락은 줄었는데, 만나면 더 다정해요.' },
];

/** 상대를 가리키는 말: male → '남자', female → '여자', other → '상대' */
export function themLabel(gender: Gender): string {
  switch (gender) {
    case 'male':
      return '남자';
    case 'female':
      return '여자';
    default:
      return '상대';
  }
}

/** situation 안의 {them} 을 themLabel 로 바꾼다 */
export function renderSituation(card: MindCard, gender: Gender): string {
  const label = themLabel(gender);
  return card.situation.replace(/\{them\}/g, () => label);
}

/** 0 이상 length 미만의 정수. rng 가 범위를 벗어난 값을 줘도 배열 밖을 가리키지 않게 막는다 */
function pickIndex(length: number, rng: () => number): number {
  const i = Math.floor(rng() * length);
  return Number.isFinite(i) ? Math.min(length - 1, Math.max(0, i)) : 0;
}

/** 무작위 카드 하나. exclude 의 id 는 빼고 뽑되, 전부 제외되면 아무거나. rng 주입 가능(테스트용) */
export function drawMindCard(exclude: string[] = [], rng: () => number = Math.random): MindCard {
  const skip = new Set(exclude);
  const pool = MIND_CARDS.filter((c) => !skip.has(c.id));
  const from = pool.length > 0 ? pool : MIND_CARDS;
  return from[pickIndex(from.length, rng)];
}

/**
 * 채팅 입력창 위에 무작위로 띄울 짧은 질문. {name} 자리에 상대 이름이 들어간다.
 * 이름 끝 받침과 상관없게 항상 「{name}님」 뒤에 조사를 붙인다 (님 → 은·이·을·이랑).
 */
export const CHAT_QUESTIONS: string[] = [
  '{name}님은 지금 무슨 생각일까?',
  '{name}님이 나한테 관심 있는 걸까?',
  '{name}님 답장이 늦는 이유가 뭘까?',
  '{name}님한테 지금 먼저 연락해도 될까?',
  '{name}님이 좋아할 데이트 코스는?',
  '{name}님한테 고백하면 받아 줄까?',
  '{name}님 호감 온도는 지금 몇 도쯤일까?',
  '{name}님이 방금 한 말, 무슨 뜻이야?',
  '{name}님한테 약속은 언제 잡는 게 좋을까?',
  '{name}님이 싫어할 만한 말투는 뭐야?',
  '{name}님이랑 대화가 끊기지 않으려면?',
  '{name}님은 어떤 스타일한테 끌릴까?',
  '{name}님이 나를 친구로만 보는 걸까?',
  '{name}님한테 어떤 칭찬이 먹힐까?',
  '{name}님 마음을 확인할 방법이 있을까?',
  '{name}님이 혹시 서운했던 걸까?',
  '{name}님한테 다음엔 뭘 물어볼까?',
  '{name}님이 밀당하는 걸까?',
  '{name}님 기분 풀어 주려면 뭐라고 할까?',
  '{name}님이랑 잘될 가능성, 솔직히 어때?',
];

/** 중복 없이 count 개를 뽑아 {name} 을 상대 이름으로 바꾼다. 이름이 비어 있으면 '상대' */
export function drawChatQuestions(count: number, name: string, rng: () => number = Math.random): string[] {
  const n = Math.max(0, Math.min(Math.floor(count), CHAT_QUESTIONS.length));
  if (!(n > 0)) return [];
  const pool = [...CHAT_QUESTIONS];
  // 앞에서부터 n 칸만 섞는 Fisher–Yates
  for (let i = 0; i < n; i++) {
    const j = i + pickIndex(pool.length - i, rng);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const who = name.trim() || '상대';
  // 이름에 $& 같은 문자가 있어도 그대로 들어가도록 치환 함수를 쓴다
  return pool.slice(0, n).map((q) => q.replace(/\{name\}/g, () => who));
}
