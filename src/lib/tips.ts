import { L } from '@/lib/i18n';
import { MIND_CARDS, type MindCard } from '@/lib/mind-cards';

/**
 * 연애 팁 + 「연애팁 백서」(11/12 회의 8번 — 팁은 많은데 산만하다 → 「어떤 고민이 있어요?」로 묶는다).
 * 팁(TIPS)·속마음 카드(mind-cards 의 MIND_CARDS)는 지우지 않고, 아래 WORRIES 의 묶음표로 고민마다 다시 쓴다.
 * 모든 팁·속마음 카드는 적어도 한 고민에 들어간다 (테스트로 확인).
 * 새 문구는 사실처럼 단정하지 않고 코치 말투로(~해 봐요, ~일 수 있어요).
 */
export interface Tip {
  id: string;
  category: '시작' | '대화' | '약속' | '온도' | '위기';
  emoji: string;
  title: string;
  body: string;
}

const TIPS_KO: Tip[] = [
  { id: 'start-1', category: '시작', emoji: '👋', title: '첫 메시지는 "공통점 + 가벼운 질문"', body: '소개팅·모임에서 만났다면 그날 나눈 얘기를 살짝 꺼내고, 답하기 쉬운 질문 하나로 끝내 봐요. "오늘 얘기한 그 카페 진짜 가봤어요?" 같은 식이면 부담이 덜해요.' },
  { id: 'start-2', category: '시작', emoji: '📸', title: '프로필 사진·스토리는 좋은 대화 소재', body: '상대 스토리에 반응하는 건 자연스러운 시작이에요. 다만 평가("예쁘다")보다 상황("여기 어디예요? 분위기 좋다")에 반응하는 쪽이 훨씬 덜 부담스러워요.' },
  { id: 'talk-1', category: '대화', emoji: '🏓', title: '대화는 탁구처럼, 질문은 한 번에 하나', body: '질문을 두세 개 몰아 보내면 취조처럼 느껴질 수 있어요. 상대 답에 리액션 한 줄 + 새 질문 하나. 이 리듬이 오래 가요.' },
  { id: 'talk-2', category: '대화', emoji: '🪞', title: '말투 미러링', body: '상대가 "ㅋㅋ"를 두 개 쓰면 나도 비슷하게, 이모티콘을 잘 안 쓰면 나도 줄여 봐요. 말투 온도가 맞으면 편안함이 생겨요.' },
  { id: 'talk-3', category: '대화', emoji: '⏱️', title: '답장 속도는 상대의 1~1.5배', body: '상대가 10분 걸리면 나도 10~15분쯤. 너무 빠르면 조급해 보이고, 너무 늦으면 관심 없어 보일 수 있어요. 다만 시간 재느라 대화가 끊기면 본말전도예요!' },
  { id: 'talk-4', category: '대화', emoji: '🎯', title: '구체적인 칭찬이 기억에 남아요', body: '"센스 있다"보다 "아까 그 말 진짜 웃겼어요, 그런 드립 어디서 배워요?"처럼 상황을 짚어 칭찬하면 진심이 더 잘 전해져요.' },
  { id: 'date-1', category: '약속', emoji: '📅', title: '약속은 "언제+무엇"을 같이', body: '"언제 한번 봐요"는 흘러가기 쉬워요. "이번 주 토요일에 그 전시 같이 볼래요?"처럼 날짜와 할 일을 함께 제안해 봐요. 안 된다고 해도 다른 날을 묻기 쉬워요.' },
  { id: 'date-2', category: '약속', emoji: '🍜', title: '첫 만남은 1~2시간짜리로', body: '부담 없는 식사나 카페가 좋아요. 잘 맞으면 2차로 자연스럽게 늘리고, 애매하면 깔끔하게 마무리할 수 있어요.' },
  { id: 'temp-1', category: '온도', emoji: '🔥', title: '호감 신호 체크리스트', body: '먼저 연락 / 질문으로 대화를 이어 감 / 자기 얘기를 자세히 함 / 이모티콘·애칭 사용 / 다음 만남 언급. 세 개 이상 보이면 온도가 꽤 높을 가능성이 커요.' },
  { id: 'temp-2', category: '온도', emoji: '🧊', title: '단답이 계속되면 잠깐 쉬어 가기', body: '단답 + 늦은 답장 + 질문 없음이 반복되면 밀어붙이지 말고 며칠 쉬어 봐요. 상대가 먼저 연락하면 온도가 돌아온 신호일 수 있고, 아니면 다른 인연에 마음을 열어 볼 때예요.' },
  { id: 'crisis-1', category: '위기', emoji: '🙏', title: '실수했다면 짧고 솔직하게', body: '변명을 길게 늘어놓기보다 "아까 그 말은 내가 생각이 짧았어. 미안" 한 문장이 훨씬 회복이 빨라요. 그다음은 상대 반응을 기다려 봐요.' },
  { id: 'crisis-2', category: '위기', emoji: '🚪', title: '거절은 존중이 최선의 매너', body: '상대가 완곡하게든 직접적이든 거절 의사를 보였다면 그 선택을 존중해 주세요. 깔끔하게 물러나는 모습이 오히려 좋은 인상으로 남아요.' },

  // 2026-11-17 백서용으로 더한 팁 — 코치 지식(lib/knowledge/stage.ts)의 원칙을 풀어 쓴 것
  { id: 'reply-1', category: '대화', emoji: '💭', title: '읽씹엔 재촉 말고 새 화제로', body: '"왜 답 안 해?"는 상대를 더 멀어지게 할 수 있어요. 하루쯤 두고, 지난 대화와 상관없는 가벼운 얘기로 다시 말을 걸면 덜 어색해요.' },
  { id: 'talk-5', category: '대화', emoji: '🔑', title: '열린 질문으로 이어 가기', body: '"응/아니"로 끝나는 질문보다 "주말엔 주로 뭐 해요?"처럼 얘기가 나오는 질문이 대화를 길게 이어 줘요.' },
  { id: 'some-1', category: '온도', emoji: '👀', title: '말보다 행동을 봐요', body: '"연애 생각 없어" 같은 말보다, 먼저 연락하는지·약속을 지키는지·시간을 내는지가 마음을 더 잘 보여 줄 때가 많아요.' },
  { id: 'some-2', category: '온도', emoji: '☕', title: '관계 확인은 만나서 가볍게', body: '"우리 무슨 사이야?"는 카톡보다 얼굴 보고 꺼내는 편이 부담이 덜해요. 답을 재촉하기보다 내 마음을 먼저 살짝 보여 줘요.' },
  { id: 'date-3', category: '약속', emoji: '⏰', title: '대화가 잘 통한 날이 타이밍', body: '즐겁게 대화한 흐름을 타서 제안하면 자연스러워요. 서너 번 즐겁게 얘기를 나눴다면 가볍게 한번 꺼내 봐도 좋아요.' },
  { id: 'after-1', category: '약속', emoji: '🌙', title: '만난 날 안부는 그날 안에', body: '헤어지고 한두 시간 안에 "잘 들어갔어요? 오늘 즐거웠어요" 정도면 충분해요. 길게 쓰기보다 짧은 소감 한 줄이 부담이 없어요.' },
  { id: 'after-2', category: '약속', emoji: '✉️', title: '애프터는 마음 한마디 + 약속 한 줄', body: '"오늘 얘기 재밌었어요. 다음 주에 그 파스타집 같이 가요"처럼 짧게. 길고 진지한 고백보다 다음 만남 제안이 자연스러워요.' },
  { id: 'fight-1', category: '위기', emoji: '🗣️', title: '서운함은 "나는"으로 시작해요', body: '"너는 왜 맨날 그래" 대신 "나는 ~해서 서운했어"라고 말하면, 상대가 방어하기보다 들어 줄 가능성이 커져요.' },
  { id: 'fight-2', category: '위기', emoji: '⏸️', title: '카톡으로 싸우지 말고 한 템포', body: '감정이 올라온 채 긴 카톡을 주고받으면 오해가 커지기 쉬워요. "조금 이따 얘기하자"고 한 뒤 차분해지면 통화나 만나서 풀어 봐요.' },
  { id: 'ex-1', category: '위기', emoji: '🕊️', title: '재회 연락은 짧고 담백하게', body: '헤어진 이유를 먼저 인정하는 짧은 연락이 부담이 덜해요. 매달리거나 미안함을 자극하는 말은 오히려 멀어지게 할 수 있어요.' },
  { id: 'ex-2', category: '위기', emoji: '⌛', title: '보내기 전에 하루만 두고 보기', body: '밤늦게, 술 마시고 쓴 연락은 다음 날 후회하기 쉬워요. 써 둔 글을 하루 뒤에 다시 읽어 보고 보내도 늦지 않아요.' },
];

/** 영어판 팁 — 한국어판과 id·분류·이모지·순서가 같다 (카톡·소개팅 같은 말은 해외 데이트 문화에 맞게 바꿨다) */
const TIPS_EN: Tip[] = [
  { id: 'start-1', category: '시작', emoji: '👋', title: 'First text: something in common + an easy question', body: 'If you met on a date or through friends, bring up something you talked about and end with one easy question. Something like "Did you ever try that café we talked about?" keeps it low-pressure.' },
  { id: 'start-2', category: '시작', emoji: '📸', title: 'Their photos and stories are great openers', body: 'Replying to their story is a natural way in. Just react to the moment ("wait, where is this? looks so good") instead of rating them ("you\'re so pretty") — it feels way less intense.' },
  { id: 'talk-1', category: '대화', emoji: '🏓', title: 'Keep it a rally: one question at a time', body: 'Firing off two or three questions at once can feel like an interview. React to their answer in one line, then ask one new question. That rhythm lasts.' },
  { id: 'talk-2', category: '대화', emoji: '🪞', title: 'Mirror their texting style', body: 'If they send "hahaha," you can too. If they barely use emoji, tone yours down. When your texting vibes match, things just feel easier.' },
  { id: 'talk-3', category: '대화', emoji: '⏱️', title: 'Reply in about 1–1.5x their time', body: 'If they take 10 minutes, take 10 to 15. Too fast can look eager, too slow can look uninterested. But if timing your replies kills the convo, you\'ve missed the point!' },
  { id: 'talk-4', category: '대화', emoji: '🎯', title: 'Specific compliments stick', body: 'Instead of "you\'re funny," try "that joke earlier killed me, where do you even come up with that?" Pointing to a real moment makes it feel genuine.' },
  { id: 'date-1', category: '약속', emoji: '📅', title: 'Ask with a "when + what"', body: '"We should hang out sometime" tends to fade. Suggest a day and a plan, like "Want to check out that exhibit with me this Saturday?" Even if they can\'t, it\'s easy to pick another day.' },
  { id: 'date-2', category: '약속', emoji: '🍜', title: 'Keep first dates to 1–2 hours', body: 'Coffee or a casual meal is perfect. If it\'s going well, extend it naturally. If it\'s not clicking, it\'s easy to wrap up.' },
  { id: 'temp-1', category: '온도', emoji: '🔥', title: 'Signs they\'re into you', body: 'They text first / keep the convo going with questions / share details about themselves / use emoji or nicknames / bring up seeing you again. Three or more? There\'s a good chance the interest is real.' },
  { id: 'temp-2', category: '온도', emoji: '🧊', title: 'Dry texts on repeat? Take a breather', body: 'If it\'s short replies, slow replies, and no questions over and over, don\'t push — take a few days off. If they reach out first, that\'s a good sign. If not, it might be time to open up to someone new.' },
  { id: 'crisis-1', category: '위기', emoji: '🙏', title: 'Messed up? Keep it short and honest', body: 'Skip the long explanation. One line like "That was thoughtless of me, I\'m sorry" repairs things way faster. Then give them room to respond.' },
  { id: 'crisis-2', category: '위기', emoji: '🚪', title: 'Respecting a no is the best look', body: 'Whether they turn you down gently or directly, respect their choice. Bowing out gracefully actually leaves a good impression.' },

  { id: 'reply-1', category: '대화', emoji: '💭', title: 'Left on read? Don\'t chase — change the subject', body: '"Why aren\'t you answering?" can push them further away. Give it a day, then reach out with something light and unrelated. It\'s way less awkward.' },
  { id: 'talk-5', category: '대화', emoji: '🔑', title: 'Keep it going with open questions', body: 'Instead of yes-or-no questions, ask things like "What do you usually get up to on weekends?" They give the conversation room to grow.' },
  { id: 'some-1', category: '온도', emoji: '👀', title: 'Watch what they do, not what they say', body: 'Whether they text first, keep plans, and make time for you often says more than "I\'m not looking for anything right now."' },
  { id: 'some-2', category: '온도', emoji: '☕', title: 'Have the "what are we" talk in person', body: '"So what are we?" lands softer face to face than over text. Instead of pushing for an answer, show a little of how you feel first.' },
  { id: 'date-3', category: '약속', emoji: '⏰', title: 'Ask on a day the convo is flowing', body: 'Asking while you\'re on a good roll feels natural. If you\'ve had three or four fun conversations, it\'s okay to float the idea.' },
  { id: 'after-1', category: '약속', emoji: '🌙', title: 'Check in the same night', body: 'Within an hour or two of saying bye, "Get home okay? I had a really good time tonight" is plenty. A short one-liner beats a long message.' },
  { id: 'after-2', category: '약속', emoji: '✉️', title: 'Asking for date two: one feeling + one plan', body: 'Keep it short: "Had so much fun talking today. Let\'s try that pasta place next week." Suggesting the next date feels more natural than a long, serious confession.' },
  { id: 'fight-1', category: '위기', emoji: '🗣️', title: 'Start with "I" when you\'re hurt', body: 'Instead of "Why do you always do that," try "I felt hurt when…" They\'re more likely to listen than get defensive.' },
  { id: 'fight-2', category: '위기', emoji: '⏸️', title: 'Don\'t fight over text — take a beat', body: 'Trading long texts while you\'re upset tends to blow things up. Say "let\'s talk a little later," then sort it out on a call or in person once you\'ve cooled down.' },
  { id: 'ex-1', category: '위기', emoji: '🕊️', title: 'Keep texts to an ex short and simple', body: 'A short message that first owns why things ended feels less heavy. Pleading or guilt-tripping usually pushes them further away.' },
  { id: 'ex-2', category: '위기', emoji: '⌛', title: 'Sleep on it before you send', body: 'Texts written late at night or after a few drinks are easy to regret. Reread it tomorrow — it\'s not too late to send it then.' },
];

export const TIPS: Tip[] = L(TIPS_KO, TIPS_EN);

export const TIP_CATEGORIES = ['전체', '시작', '대화', '약속', '온도', '위기'] as const;

export type WorryId = 'late-reply' | 'some' | 'first-text' | 'talk-dies' | 'ask-out' | 'after-date' | 'fight' | 'ex';

export interface WorryStep {
  title: string;
  body: string;
}

/** 백서의 고민 하나 — 탐색 탭의 고민 카드와 그 해답 화면(app/tips/[topic]) */
export interface Worry {
  id: WorryId;
  /** 고민 카드 제목 — 이용자가 하는 말 그대로 */
  title: string;
  /** 카드 아래 작은 글 — 찾는 말(읽씹·애프터 등) */
  keywords: string;
  /** 해답 화면 맨 위 한 줄 결론 */
  answer: string;
  /** 해결 단계 2~4개 */
  steps: WorryStep[];
  /** 같이 보여 줄 팁 (TIPS id) */
  tips: string[];
  /** 「이럴 때 그 사람 속마음은?」 상황 카드 (MIND_CARDS id) */
  minds: string[];
  /** 「이 상황, 센딧에게 물어보기」로 채팅방에 보내는 글 */
  ask: string;
}

const WORRIES_KO: Worry[] = [
  {
    id: 'late-reply',
    title: '답장이 늦어요',
    keywords: '읽씹 · 단답',
    answer: '재촉하기보다 템포를 맞추고, 하루쯤 지나면 가벼운 새 얘기로 다시 말을 걸어 봐요.',
    steps: [
      { title: '바로 결론 내지 않기', body: '바쁘거나 뭐라고 할지 고민 중일 수도 있어요. 한두 번 늦은 걸로 마음을 단정하진 말아요.' },
      { title: '내 답장도 템포 맞추기', body: '상대가 한 시간 걸리면 나도 비슷하게. 나만 계속 칼답하면 조급해 보일 수 있어요.' },
      { title: '하루 지나면 새 화제로', body: '"왜 답 안 해?" 대신 답하기 쉬운 가벼운 질문 하나로 다시 열어요.' },
      { title: '며칠째면 한발 물러나기', body: '단답·늦은 답·질문 없음이 계속되면 잠깐 쉬면서 상대가 먼저 오는지 봐요.' },
    ],
    tips: ['talk-3', 'reply-1', 'temp-2'],
    minds: ['text-1', 'text-2', 'text-3'],
    ask: '상대 답장이 자꾸 늦어요. 다시 연락해도 될까요? 뭐라고 보내면 좋을까요?',
  },
  {
    id: 'some',
    title: '썸인지 헷갈려요',
    keywords: '호감 신호 · 우리 무슨 사이',
    answer: '말보다 행동을 봐요. 먼저 연락하고 시간을 내 준다면 마음이 있을 가능성이 커요.',
    steps: [
      { title: '호감 신호 세어 보기', body: '먼저 연락하는지, 질문으로 대화를 잇는지, 다음 만남 얘기를 꺼내는지 하나씩 체크해 봐요.' },
      { title: '말과 행동이 다르면 행동 쪽으로', body: '"연애 생각 없어"라면서 매일 연락한다면, 말 한마디보다 꾸준한 행동을 더 믿어 봐요.' },
      { title: '확인은 만나서 가볍게', body: '몇 번 만났는데도 애매하면, 만난 자리에서 내 마음을 먼저 살짝 보여 줘요.' },
    ],
    tips: ['temp-1', 'some-1', 'some-2'],
    minds: ['some-1', 'some-2', 'some-3', 'some-4', 'some-5', 'some-6', 'some-8', 'text-4', 'text-5'],
    ask: '썸인지 그냥 친구인지 헷갈려요. 상대 마음이 어떤 것 같아요?',
  },
  {
    id: 'first-text',
    title: '먼저 말 걸고 싶어요',
    keywords: '첫 연락 · 선톡',
    answer: '거창한 말보다 공통점 하나와 답하기 쉬운 질문 하나면 충분해요.',
    steps: [
      { title: '꺼낼 거리 하나 고르기', body: '그날 나눈 얘기, 상대 스토리, 둘 다 아는 장소처럼 이어 갈 거리를 하나 골라요.' },
      { title: '질문은 하나만', body: '답하기 쉬운 질문 하나로 끝내면 상대도 부담 없이 답할 수 있어요.' },
      { title: '칭찬은 구체적으로', body: '"멋있어요"보다 "그 사진 분위기 좋다, 어디예요?"처럼 상황을 짚어 봐요.' },
    ],
    tips: ['start-1', 'start-2', 'talk-4'],
    minds: ['text-6'],
    ask: '좋아하는 사람한테 먼저 연락하고 싶어요. 첫 메시지 뭐라고 보내면 좋을까요?',
  },
  {
    id: 'talk-dies',
    title: '대화가 자꾸 끊겨요',
    keywords: '할 말이 없어요 · 단답',
    answer: '리액션 한 줄에 질문 하나, 탁구처럼 주고받는 리듬을 만들어 봐요.',
    steps: [
      { title: '리액션 먼저', body: '"헐 진짜요? ㅋㅋ"처럼 상대 말에 반응부터 해 줘요. 들어 주는 느낌이 대화를 이어 줘요.' },
      { title: '열린 질문 하나', body: '"응/아니"로 끝나지 않게, 얘기가 나오는 질문을 하나만 붙여요.' },
      { title: '말투 온도 맞추기', body: 'ㅋㅋ 개수, 이모티콘, 문장 길이를 상대와 비슷하게 맞춰 봐요.' },
    ],
    tips: ['talk-1', 'talk-5', 'talk-2'],
    minds: ['text-7'],
    ask: '상대랑 카톡하면 대화가 자꾸 끊겨요. 어떻게 이어 가면 좋을까요?',
  },
  {
    id: 'ask-out',
    title: '약속 잡고 싶어요',
    keywords: '데이트 신청 · 첫 만남',
    answer: '"언제 한번"보다 날짜와 할 일을 같이 꺼내면 상대도 답하기 쉬워져요.',
    steps: [
      { title: '흐름 좋은 날 꺼내기', body: '대화가 즐겁게 이어진 날, 그 흐름을 타서 제안하면 자연스러워요.' },
      { title: '"언제 + 무엇"을 같이', body: '"이번 주 토요일에 그 전시 같이 볼래요?"처럼 구체적으로 물어봐요.' },
      { title: '첫 만남은 짧게', body: '한두 시간짜리 카페나 식사면 서로 부담이 덜해요. 잘 맞으면 그때 늘려요.' },
    ],
    tips: ['date-1', 'date-3', 'date-2'],
    minds: ['some-7', 'text-8', 'date-4', 'date-7'],
    ask: '상대한테 데이트 신청하고 싶어요. 언제, 뭐라고 말하면 좋을까요?',
  },
  {
    id: 'after-date',
    title: '애프터가 애매해요',
    keywords: '첫 만남 뒤 · 다음 약속',
    answer: '그날 안에 짧은 안부를 보내고, 다음 약속은 마음 한마디와 함께 가볍게 꺼내 봐요.',
    steps: [
      { title: '그날 안에 안부 한 줄', body: '"잘 들어갔어요? 오늘 즐거웠어요" 정도면 충분해요.' },
      { title: '상대 반응 살피기', body: '질문으로 대화를 잇는지, 그날 얘기를 다시 꺼내는지 봐요.' },
      { title: '애프터는 짧고 구체적으로', body: '마음 한마디에 다음 약속 한 줄을 붙여 제안해 봐요.' },
    ],
    tips: ['after-1', 'after-2', 'temp-1'],
    minds: ['date-1', 'date-2', 'date-3', 'date-5', 'date-6', 'date-8'],
    ask: '첫 데이트 끝나고 연락이 애매해요. 애프터 신청해도 될까요? 뭐라고 보낼까요?',
  },
  {
    id: 'fight',
    title: '연애 중에 다퉜어요',
    keywords: '서운함 · 화해',
    answer: '이기려 하기보다 짧게 사과하고, 서운한 마음은 "나는"으로 말해 봐요.',
    steps: [
      { title: '한 템포 쉬기', body: '감정이 올라온 채 긴 카톡을 보내면 오해가 커지기 쉬워요. 조금 차분해진 뒤에 얘기해요.' },
      { title: '내 잘못은 짧게 인정', body: '변명보다 "그 말은 내가 생각이 짧았어, 미안" 한 문장이 먼저예요.' },
      { title: '서운함은 "나는"으로', body: '"너는 왜"보다 "나는 ~해서 서운했어"라고 말하면 상대도 들어 주기 쉬워요.' },
      { title: '풀렸으면 같이 할 일 하나', body: '화해했다면 작은 약속 하나를 정해 분위기를 바꿔 봐요.' },
    ],
    tips: ['crisis-1', 'fight-1', 'fight-2'],
    minds: ['couple-1', 'couple-2', 'couple-3', 'couple-4', 'couple-5', 'couple-6', 'couple-7', 'couple-8'],
    ask: '애인이랑 다퉜어요. 먼저 뭐라고 연락하면 좋을까요?',
  },
  {
    id: 'ex',
    title: '다시 연락하고 싶어요',
    keywords: '이별 · 재회',
    answer: '보내기 전에 하루만 두고, 연락은 짧고 담백하게 해 봐요.',
    steps: [
      { title: '보내기 전에 하루 두기', body: '밤늦게, 술 마시고 쓴 연락은 다음 날 후회하기 쉬워요.' },
      { title: '헤어진 이유 먼저 인정하기', body: '매달리기보다 지난 일을 담담하게 인정하는 한두 줄이 부담이 덜해요.' },
      { title: '답이 없으면 존중하기', body: '상대가 거리를 두면 그 선택을 존중해요. 깔끔하게 물러나는 모습도 좋은 기억으로 남아요.' },
    ],
    tips: ['ex-2', 'ex-1', 'crisis-2'],
    minds: ['ex-1', 'ex-2', 'ex-3', 'ex-4', 'ex-5', 'ex-6', 'ex-7', 'ex-8'],
    ask: '헤어진 사람한테 다시 연락하고 싶어요. 해도 될까요? 뭐라고 보내면 좋을까요?',
  },
];

/**
 * 영어판 고민 — 한국어판과 id·순서·묶은 팁·속마음 카드가 같다.
 * 제목은 탐색 탭 고민 버튼(두 칸, 한 줄)에 들어가게 18자 안으로 짧게.
 */
const WORRIES_EN: Worry[] = [
  {
    id: 'late-reply',
    title: 'Slow replies',
    keywords: 'Left on read · Dry texts',
    answer: 'Don\'t chase. Match their pace, and if a day goes by, reopen with something light and new.',
    steps: [
      { title: 'Don\'t jump to conclusions', body: 'They might be busy, or still figuring out what to say. One or two slow replies don\'t tell you how they feel.' },
      { title: 'Match their pace', body: 'If they take an hour, you can too. Replying instantly every single time can come off a little eager.' },
      { title: 'After a day, start fresh', body: 'Skip the "why aren\'t you answering?" and reopen with one easy, low-key question.' },
      { title: 'Been days? Step back', body: 'If it\'s short replies, slow replies, and no questions for days, give it a rest and see if they reach out first.' },
    ],
    tips: ['talk-3', 'reply-1', 'temp-2'],
    minds: ['text-1', 'text-2', 'text-3'],
    ask: 'They keep taking forever to reply. Should I text again? What should I say?',
  },
  {
    id: 'some',
    title: 'Are we a thing?',
    keywords: 'Signs of interest · What are we',
    answer: 'Watch what they do, not just what they say. If they text first and make time for you, there\'s a good chance they\'re into you.',
    steps: [
      { title: 'Count the signs', body: 'Do they text first, keep the convo going with questions, bring up hanging out again? Check them off one by one.' },
      { title: 'Trust actions over words', body: 'If they say they\'re "not looking for anything" but text you every day, trust the steady behavior over one line.' },
      { title: 'Ask in person, keep it light', body: 'Still unclear after a few dates? Face to face, show a little of how you feel first.' },
    ],
    tips: ['temp-1', 'some-1', 'some-2'],
    minds: ['some-1', 'some-2', 'some-3', 'some-4', 'some-5', 'some-6', 'some-8', 'text-4', 'text-5'],
    ask: 'I can\'t tell if we\'re a thing or just friends. What do you think they\'re feeling?',
  },
  {
    id: 'first-text',
    title: 'Texting first',
    keywords: 'First message · Opening line',
    answer: 'No need for anything big. One thing you have in common and one easy question is plenty.',
    steps: [
      { title: 'Pick one thing to bring up', body: 'Something you talked about, their story, a place you both know — pick one thing to build on.' },
      { title: 'Just one question', body: 'End with one easy question so they can answer without overthinking it.' },
      { title: 'Make compliments specific', body: 'Instead of "you look great," try "that photo has such a vibe, where is that?"' },
    ],
    tips: ['start-1', 'start-2', 'talk-4'],
    minds: ['text-6'],
    ask: 'I want to text someone I like first. What should my first message be?',
  },
  {
    id: 'talk-dies',
    title: 'Convo keeps dying',
    keywords: 'Nothing to say · Dry texts',
    answer: 'React first, then ask one question. Keep it going back and forth like a rally.',
    steps: [
      { title: 'React first', body: 'Start with a reaction like "wait, seriously? lol". Feeling heard is what keeps people talking.' },
      { title: 'One open question', body: 'Add one question they can\'t answer with just a yes or no.' },
      { title: 'Match their energy', body: 'Mirror how they text — how much they laugh, how many emoji, how long their messages are.' },
    ],
    tips: ['talk-1', 'talk-5', 'talk-2'],
    minds: ['text-7'],
    ask: 'Our texts keep fizzling out. How do I keep the conversation going?',
  },
  {
    id: 'ask-out',
    title: 'Asking them out',
    keywords: 'Date invite · First date',
    answer: 'Skip "we should hang out sometime." Suggest a day and a plan, and it gets way easier for them to say yes.',
    steps: [
      { title: 'Ask when the vibe is good', body: 'On a day the convo is flowing, ride that energy. It feels natural.' },
      { title: 'Say "when + what"', body: 'Be specific, like "Want to check out that exhibit with me this Saturday?"' },
      { title: 'Keep the first date short', body: 'An hour or two over coffee or a meal is low-pressure for both of you. If it\'s going well, stretch it out.' },
    ],
    tips: ['date-1', 'date-3', 'date-2'],
    minds: ['some-7', 'text-8', 'date-4', 'date-7'],
    ask: 'I want to ask them out. When should I do it, and what should I say?',
  },
  {
    id: 'after-date',
    title: 'Second date?',
    keywords: 'After a first date · Next plans',
    answer: 'Send a short text that same day, then bring up the next plan lightly, with a little warmth.',
    steps: [
      { title: 'Text that same night', body: '"Get home okay? I had a really good time" is plenty.' },
      { title: 'Read their response', body: 'Do they ask questions back? Bring up something from the date?' },
      { title: 'Keep the ask short and specific', body: 'Add one line about how you felt, then suggest the next plan.' },
    ],
    tips: ['after-1', 'after-2', 'temp-1'],
    minds: ['date-1', 'date-2', 'date-3', 'date-5', 'date-6', 'date-8'],
    ask: 'Our first date is over and I can\'t read the vibe. Should I ask for a second date? What should I text?',
  },
  {
    id: 'fight',
    title: 'We had a fight',
    keywords: 'Hurt feelings · Making up',
    answer: 'Don\'t try to win. Apologize briefly, and share what hurt with "I" statements.',
    steps: [
      { title: 'Take a beat', body: 'Long texts sent while you\'re heated tend to make things worse. Talk once you\'ve cooled down a little.' },
      { title: 'Own your part, briefly', body: 'Before any explanation, one line like "That was thoughtless of me, I\'m sorry" comes first.' },
      { title: 'Start with "I felt"', body: 'Instead of "why do you always…", try "I felt hurt when…" It\'s easier for them to hear.' },
      { title: 'Made up? Plan something', body: 'Once you\'re good again, make one small plan together to reset the mood.' },
    ],
    tips: ['crisis-1', 'fight-1', 'fight-2'],
    minds: ['couple-1', 'couple-2', 'couple-3', 'couple-4', 'couple-5', 'couple-6', 'couple-7', 'couple-8'],
    ask: 'I had a fight with my partner. What should I text first?',
  },
  {
    id: 'ex',
    title: 'Texting my ex',
    keywords: 'Breakup · Getting back together',
    answer: 'Sleep on it before you send, and keep the message short and simple.',
    steps: [
      { title: 'Wait a day before sending', body: 'Late-night or after-drinks texts are easy to regret in the morning.' },
      { title: 'Own why it ended', body: 'Instead of pleading, a line or two that calmly acknowledges what happened feels less heavy.' },
      { title: 'No reply? Respect it', body: 'If they keep their distance, respect that. Stepping back gracefully leaves a good memory too.' },
    ],
    tips: ['ex-2', 'ex-1', 'crisis-2'],
    minds: ['ex-1', 'ex-2', 'ex-3', 'ex-4', 'ex-5', 'ex-6', 'ex-7', 'ex-8'],
    ask: 'I want to reach out to my ex. Should I? What should I say?',
  },
];

/** 묶음표 — 순서가 탐색 탭 고민 카드 순서다 (자주 묻는 것부터) */
export const WORRIES: Worry[] = L(WORRIES_KO, WORRIES_EN);

/** 주소의 고민 id 로 찾는다 (없으면 undefined) */
export function worryById(id: string | undefined): Worry | undefined {
  return WORRIES.find((w) => w.id === id);
}

/** 그 고민에 묶은 팁 — 묶음표 순서대로 */
export function tipsOf(worry: Worry): Tip[] {
  return worry.tips.map((id) => TIPS.find((t) => t.id === id)).filter((t): t is Tip => t != null);
}

/** 그 고민에 묶은 속마음 상황 카드 — 묶음표 순서대로 */
export function mindsOf(worry: Worry): MindCard[] {
  return worry.minds.map((id) => MIND_CARDS.find((c) => c.id === id)).filter((c): c is MindCard => c != null);
}
