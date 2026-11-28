/**
 * KKTI 영어 문구 (Texting Type Test) — 앱 화면과 서버(api/)가 같이 쓰는 판 (2026-11-28 공유 카드·미리보기 세계화).
 *
 * 앱 화면은 kkti-en.ts 의 kktiCopy 로 지금 언어의 문구를 고르고, 서버(api/_kkti-card·api/_kkti-share)는 이 파일의 값으로
 * 영어 결과 카드 그림·링크 미리보기를 만든다. 문구 자체는 한 군데(여기)에만 둔다 — kkti-en.ts 는 다시 내보내기만 한다.
 *
 * ⚠️ 서버가 불러 쓰는 파일이라 @/lib/i18n·expo·react-native 를 불러오지 않는다 (kkti.ts 와 같은 규칙).
 *    런타임에 불러오는 것은 상대 경로(./kkti)로만 — 서버 함수는 '@/…' 별칭을 풀지 못한다.
 *
 * 열쇠는 kkti.ts 의 유형 코드(선빠폭직)·문항 id·축 key·색 hex·궁합 등급 min. 점수·궁합·색 계산은 전부 kkti.ts 하나.
 * 영어 유형 코드: 축마다 영어 글자 한 개 — F/W(First move·Waits) · R/L(Rapid·Laid-back) · H/D(Hype·Dry) · A/S(All-in·Slow burn).
 *
 * 맨 아래 「공유 링크 언어」: 한국어가 아닌 사람이 보낸 공유 링크에는 ?l=언어 가 붙는다 (/k/코드?l=en).
 * 서버는 그 언어로 미리보기 문구를, 한국어가 아니면 영어 카드 그림을 내고, 결과 화면(?lang=언어)으로 넘긴다.
 * l 이 없는 링크(지금까지 나간 모든 링크)는 한국어 그대로다.
 */
import { KKTI_AXES, cardUrl, codeLetters, shareUrl, type KktiAxisKey, type KktiCardShape, type KktiFit, type KktiLead, type KktiMatch } from './kkti';

// ───────────────────────── 영어 문구 ─────────────────────────

export interface KktiPoleEn {
  /** 영어 유형 코드 글자 */
  letter: string;
  /** 짧은 설명 (유형 카드 글자 아래 — 짧게) */
  label: string;
  /** 애니어그램 이유 문장용 동명사구 (예: making the first move) */
  trait: string;
}

export interface KktiAxisEn {
  label: string;
  plus: KktiPoleEn;
  minus: KktiPoleEn;
}

export const KKTI_AXES_EN: Readonly<Record<KktiAxisKey, KktiAxisEn>> = {
  start: {
    label: 'Who texts first',
    plus: { letter: 'F', label: 'First move', trait: 'making the first move' },
    minus: { letter: 'W', label: 'Waits', trait: 'letting them come to you' },
  },
  speed: {
    label: 'Reply speed',
    plus: { letter: 'R', label: 'Rapid', trait: 'replying in seconds' },
    minus: { letter: 'L', label: 'Laid-back', trait: 'texting at your own pace' },
  },
  express: {
    label: 'Expressiveness',
    plus: { letter: 'H', label: 'Hype', trait: 'wearing your heart on your sleeve' },
    minus: { letter: 'D', label: 'Dry', trait: 'keeping it short and low-key' },
  },
  pace: {
    label: 'Pace',
    plus: { letter: 'A', label: 'All-in', trait: 'going all in once you decide' },
    minus: { letter: 'S', label: 'Slow burn', trait: 'taking things slow and careful' },
  },
};

export interface KktiQuestionEn {
  bubble?: string;
  prompt: string;
  /** kkti.ts 선택지와 같은 순서·같은 개수 */
  options: string[];
}

/** 문항 id → 영어 (선택지 순서는 점수와 묶여 있으니 kkti.ts 와 같은 순서로) */
export const KKTI_QUESTIONS_EN: Readonly<Record<string, KktiQuestionEn>> = {
  q1: {
    prompt: "Your crush hasn't texted all day. It's 10 PM. You…",
    options: [
      'Text first: "what\'d you do today?" Overthinking is a luxury',
      'Post an IG story and wait for them to react',
      'Find a meme or a food spot to send as an excuse',
      'Texting first = losing… Phone goes face down',
    ],
  },
  q2: {
    bubble: 'wyd?',
    prompt: 'Your crush texts "wyd?" You…',
    options: [
      'Peek at the preview and finish what you were doing',
      'Reply in 1 second flat. Already typing',
      "Reply when you've got the headspace. A few hours, tops",
      "See it right away, but wait 3 min so you don't look too eager",
    ],
  },
  q3: {
    bubble: 'thought of you today',
    prompt: 'They send you this. Your reply?',
    options: [
      '"omg stoppp me too!!! 🥹💕" + a triple emoji combo',
      '"haha why?? did something happen? 😊"',
      '"oh why?" (butterflies kept strictly internal)',
      '"k same"',
    ],
  },
  q4: {
    prompt: "Two weeks into the talking stage and it's going great. Next move?",
    options: [
      "Keep it slow like this until you're sure",
      'Ask straight up: "so what are we?"',
      'Text less on purpose. Whoever misses it more will come closer',
      'Read the vibe on the next date and plan to make it official',
    ],
  },
  q5: {
    prompt: "Scrolling Reels, you find a place you'd love to try with them.",
    options: [
      'Send it right away + "wanna go?"',
      'Just drop the link: "lol look at this"',
      'Save it and bring it up next time they text you',
      'It lives in your saved folder (forever)',
    ],
  },
  q6: {
    prompt: 'How many unread messages are usually sitting on your phone?',
    options: ['Double digits, minimum', "Zero. Can't stand the red badge", '300+… notifications have been off for ages', 'Single digits. I clear them as I go'],
  },
  q7: {
    bubble: 'this is literally you lmao 📷',
    prompt: 'They send you a funny meme. Your reaction?',
    options: ['"LMAOOO I\'m dead 😭" + fire back a meme', '"lol"', '"hahaha what is this" energy', 'Just a heart react'],
  },
  q8: {
    bubble: 'what are you up to this weekend?',
    prompt: 'They ask about your weekend. You say…',
    options: [
      '"Nothing! Why, wanna hang?" Lock in plans on the spot',
      '"No plans yet haha, you?" Toss it back',
      '"Sunday works! Where should we go?" Get it on the calendar',
      '"Saturday I\'ve got plans… Sunday maybe?" Play busy once',
    ],
  },
  q9: {
    prompt: "The chat's been dead for 3 days. You sent the last message.",
    options: [
      "It's their turn. Wait until they text",
      'Start a new topic. Opening convos is just what you do',
      'Another text would be clingy. Quietly let it go',
      'Give it one more day, then text if nothing',
    ],
  },
  q10: {
    prompt: "You're out with friends when they text.",
    options: [
      'Fake a bathroom trip and reply right away',
      'Send "with friends rn, will text later!" first',
      'Reply properly once you get home',
      'Next morning: "omg just saw this"',
    ],
  },
  q11: {
    prompt: 'How would your friends sum up your texting style?',
    options: [
      '"Short and to the point, but low-key sweet"',
      '"No exclamation points or emojis = we think you\'re mad"',
      '"Gets asked \'are you a robot?\' a lot"',
      '"Matches the vibe with lots of haha and lol"',
    ],
  },
  q12: {
    bubble: 'i think i kinda like you',
    prompt: 'Out-of-nowhere confession(?). If you like them too…',
    options: [
      '"Me too!! Wanna make it official?" Seal the deal',
      '"I like you too 😊" Answer honestly',
      '"lol where\'d that come from?" Test the waters',
      '"Oh yeah? Why? 😏" Make them wait a little longer',
    ],
  },
};

export interface KktiTypeEn {
  name: string;
  oneLiner: string;
  description: string;
  /** kkti.ts 와 같은 개수 */
  strengths: string[];
  watchOut: string[];
  coachTip: string;
}

/** 유형 코드(선빠폭직) → 영어 */
export const KKTI_TYPES_EN: Readonly<Record<string, KktiTypeEn>> = {
  선빠폭직: {
    name: 'Full-Send Bulldozer',
    oneLiner: 'Texts first, replies in a second, and shoots their shot the minute feelings hit',
    description:
      'If you like someone, you HAVE to say it. First texts, instant replies and reaction bombs heat up the talking stage in no time. Playing hard to get? Never heard of her.',
    strengths: ['They never have to guess how you feel', 'Unstoppable momentum. The convo never dies'],
    watchOut: ["If they're slower, it can feel like a lot", 'No "??" follow-ups! Waiting is flirting too'],
    coachTip: 'Keep the butterflies, just slow down half a beat. Leave room for them to come to you and things get deeper.',
  },
  선빠폭밀: {
    name: 'Talking-Stage Master',
    oneLiner: 'First texts, fast replies, max-level reactions. Making it official, though? …Not yet',
    description:
      "A genius at turning up the energy in any chat. You drop flirty lines with ease, but the second it's time to define the relationship, you take a step back. A true master of the talking stage.",
    strengths: ['You can spark chemistry with someone you just met', "Your texts are so fun they can't stop thinking about you"],
    watchOut: ["If the talking stage drags on, they might wonder if they're just on your roster"],
    coachTip: 'Your flirting game is already strong. Now one honest sentence is all it takes to end the talking stage.',
  },
  선빠담직: {
    name: 'Lock-It-In Planner',
    oneLiner: 'Sends "Sat 7pm?" instead of "wyd?"',
    description:
      "Short and to the point, but fast and clear. You show how you feel with plans and actions, not words. A talking stage with no plans just isn't your thing.",
    strengths: ['You hate vague, so things get clear fast', 'You keep every plan, so people trust you'],
    watchOut: ['Your no-frills texting can sometimes read as cold', "Don't let your plan texts sound like a work email!"],
    coachTip: 'Add one reaction to the end of your plan texts. A quick "Yay! Can\'t wait 😊" warms things right up.',
  },
  선빠담밀: {
    name: 'Nonchalant First Texter',
    oneLiner: "Texts first, then acts like they couldn't care less",
    description:
      'You\'re interested, so you text first, but you never let your feelings show. Only someone who can spot the heart hidden between "k" and "sure" gets to be your person.',
    strengths: ['You seem so unbothered that they keep getting curious', 'Texting first lets you set the vibe naturally'],
    watchOut: ["Act indifferent too long and they'll think you really don't care"],
    coachTip: 'Three parts cool, one part sweet is the golden ratio. Today, spend your sweet on a simple "missed you."',
  },
  선느폭직: {
    name: 'Tidal Wave Lover',
    oneLiner: 'Replies late, but when they do: a paragraph + an emoji storm',
    description:
      "You text first and you know what you want, but your reply rhythm is all your own. You go quiet for a while, then come back and flood them with everything you didn't get to say.",
    strengths: ['Your heartfelt messages really land', "Once you've decided, you go for it without wavering"],
    watchOut: ['Long gaps between replies can make them anxious'],
    coachTip: 'A few short texts beat one long one. When you\'re busy, a quick "will reply properly later!" is plenty.',
  },
  선느폭밀: {
    name: 'Mixed-Signals Fairy',
    oneLiner: 'Sends the first text, vanishes, then returns with a reaction bomb',
    description:
      "You start the convo but reply on your own time. Big on expression, slow on progress. You're so hard to read that they can't stop thinking about you, like a mischievous little fairy.",
    strengths: ['Your unpredictable charm keeps them curious', "You're the mood maker, so the chat is always fun"],
    watchOut: ['An all-over-the-place texting rhythm can wear them out'],
    coachTip: "The charm is already there. Add a dash of consistency (like texting around the same time) and they'll feel secure.",
  },
  선느담직: {
    name: 'Quiet Straight Shooter',
    oneLiner: 'Few words, all action',
    description:
      'You text first and you know what you want, but your texts are short and unhurried. You pack all your feelings into simple lines like "let\'s eat" or "I\'ll walk you home."',
    strengths: ['Actions over words make you dependable', 'Your steady energy puts them at ease'],
    watchOut: ['Slow, short replies are easy to mistake for no interest'],
    coachTip: 'Your actions are already 10/10. Just add one question to your replies. "How was your day?" keeps the chat alive.',
  },
  선느담밀: {
    name: 'Bait-and-Wait Angler',
    oneLiner: 'Drops a first-text bait, then waits patiently for a bite',
    description:
      "You open the convo, but you take your time with feelings and progress. A strategist who's great at keeping them on their toes with one casual line.",
    strengths: ['Your laid-back attitude creates a delicious tension', 'You observe calmly before making a call'],
    watchOut: ['Drag out the push and pull too long and they might get tired and swim away'],
    coachTip: 'Leave the line in too long and even the fish swim off. This time, show how you feel a little more clearly.',
  },
  후빠폭직: {
    name: 'Golden Retriever Energy',
    oneLiner: "Can't text first, but when they do? Tail goes full propeller",
    description:
      'Texting first feels awkward, but once they hit you up, it\'s instant replies and reactions everywhere. When you catch feelings, you show all of it, no filter. Pure, all-in puppy energy.',
    strengths: ['Your reactions make texting you so fun', "Once you're in, you're loyal through and through"],
    watchOut: ['Show everything too fast and they might get a little too comfortable', 'Waiting for them to text first can make you miss your moment'],
    coachTip: 'Being reaction-rich is a huge plus! Take a half-beat pause now and then, and send the first text once in a while. Perfect.',
  },
  후빠폭밀: {
    name: 'Standby Hamster',
    oneLiner: 'Clutching the phone waiting for their text… replies the second it lands',
    description:
      "Texting first feels too shy, but when that notification pops, you're there faster than anyone. Your reactions are adorably extra, but deciding how you feel? You're careful about that. A cautious little hamster.",
    strengths: ['Once the chat starts, your cute reactions light it up', "You're thoughtful and considerate"],
    watchOut: ["Only ever waiting can look like you're not interested"],
    coachTip: 'If starting a convo feels awkward, share instead of asking! Sending one cute meme totally counts as texting first.',
  },
  후빠담직: {
    name: 'Steady Speed Texter',
    oneLiner: 'Rarely texts first, but always replies right on time',
    description:
      "You're not usually the one to start, but you answer every text fast and reliably. Few words, but you always keep your promises. The more people get to know you, the more they trust you.",
    strengths: ['Consistent and reliable, so people trust you', 'You reply so fast they never have time to worry'],
    watchOut: ['Too many plain replies can turn into one-word ping-pong'],
    coachTip: "End your reply with a question or an emoji! Add a dash of warmth to that speed and you're golden.",
  },
  후빠담밀: {
    name: 'Poker-Face Cat',
    oneLiner: 'Replies fast, but never shows their cards',
    description:
      'You reply when they text, but your feelings stay perfectly hidden. Like a cat that might come closer… or might not, you keep them guessing.',
    strengths: ['Your cool, easygoing vibe is magnetic', 'Steady, with no emotional rollercoasters'],
    watchOut: ["If they can't read you, they might give up first"],
    coachTip: 'People melt when a cat comes to them first. Every now and then, let your interest show a little.',
  },
  후느폭직: {
    name: 'Heartfelt Paragraph Texter',
    oneLiner: 'Every reply is a whole heartfelt paragraph',
    description:
      "You hesitate to text first and take your time replying, but when you do send, it's a long message packed with feeling. Once you're sure, you love deeper and harder than anyone.",
    strengths: ['Your sincerity builds deep trust', 'You read their feelings with care'],
    watchOut: ['Overthinking a reply can make you miss the moment', 'Paragraphs early on can feel heavy'],
    coachTip: 'Sometimes a quick one-liner beats the perfect reply. Send something short first, and save the deep stuff for in person.',
  },
  후느폭밀: {
    name: 'Slow-Burn Romantic',
    oneLiner: 'Spends 3 hours drafting a reply, then sends pure 2 AM feels',
    description:
      'One text from them and your imagination runs wild. A romantic who\'s big on expression but careful with progress, letting feelings grow in those late-night thoughts.',
    strengths: ['Your sensitivity makes every chat warm and special', 'You genuinely react to even their smallest words'],
    watchOut: ['Your imagination can run ahead and leave you hurt over nothing'],
    coachTip: "Trust the real conversation over the scenarios in your head. If you're curious, just ask. Lightly.",
  },
  후느담직: {
    name: 'Ice Wall Plot Twist',
    oneLiner: 'Ice wall on the outside, full speed ahead once they decide',
    description:
      "You wait for them to text, reply at your own pace, and keep it plain. But the moment you're sure, you pull a plot twist nobody saw coming and go all in.",
    strengths: ["You choose carefully, so once you decide, you're serious", "Emotions don't sweep you away, so you're steady"],
    watchOut: ["If your wall is too thick, they'll give up before they even get close"],
    coachTip: "Don't wait until you're sure. Crack the door open a little. One question is the doorknob.",
  },
  후느담밀: {
    name: 'Left-on-Read Mystic',
    oneLiner: 'Read it. Will reply whenever. Mystery in human form',
    description:
      "You rarely text first, reply slowly, keep it short, and never show your hand. You're so hard to figure out that people can't help being curious. A true mystery character.",
    strengths: ["You're happy on your own, so you never get clingy", "You're grounded and hard to sway"],
    watchOut: ["Leave them on read too often and they'll be sure you're not interested", "Even real feelings don't get through if you never show them"],
    coachTip: 'For someone you like, start by changing your reply speed. Keep the mystery, but no more leaving them on read!',
  },
};

/** 애니어그램 번호 → 영어 이름·결 (Riso-Hudson 이름) */
export const KKTI_ENNEAGRAM_EN: Readonly<Record<number, { name: string; vibe: string }>> = {
  1: { name: 'Reformer', vibe: 'principled and dependable' },
  2: { name: 'Helper', vibe: 'warm and always looking out for people' },
  3: { name: 'Achiever', vibe: 'driven and goal-focused' },
  4: { name: 'Individualist', vibe: 'true to your own feelings' },
  5: { name: 'Investigator', vibe: 'observing from a step back' },
  6: { name: 'Loyalist', vibe: 'careful and loyal' },
  7: { name: 'Enthusiast', vibe: 'fun-chasing and free-spirited' },
  8: { name: 'Challenger', vibe: 'bold and ready to lead' },
  9: { name: 'Peacemaker', vibe: 'all about keeping the peace' },
};

export const ENNEAGRAM_NOTE_EN = "A just-for-fun guess from 12 texting-habit questions. Take an official test to find your real type.";

/** 이름 있는 색의 hex → 영어 이름·느낌 */
export const KKTI_COLORS_EN: Readonly<Record<string, { name: string; mood: string }>> = {
  '#E83049': { name: 'Cherry Cola', mood: 'Fizzy like soda, bursting with butterflies and zero hesitation' },
  '#732639': { name: 'Midnight Wine', mood: 'Deepens slowly like a good wine, a grown-up kind of love' },
  '#F9B8C3': { name: 'Strawberry Milk', mood: 'Sweet and gentle, one sip and your mood melts' },
  '#DAA9B6': { name: 'Rose Quartz', mood: 'A tender color that quietly soothes the heart' },
  '#F04C9E': { name: 'Hot Pink Pop', mood: 'Changes the whole vibe just by showing up' },
  '#B06D78': { name: 'Vintage Rose', mood: 'A soft color that grows on you the longer you look' },
  '#A5275B': { name: 'Raspberry Jam', mood: "Sweet and tangy, and once you're hooked there's no escape" },
  '#F6CBD6': { name: 'Cherry Blossom', mood: 'Light as a spring breeze, just like a first crush' },
  '#FF7F6B': { name: 'Sunset Coral', mood: 'Warm, honest butterflies, like the sky at golden hour' },
  '#FFC2A3': { name: 'Peach Soda', mood: 'Bright and bubbly, an instant good mood' },
  '#E93420': { name: 'Firework Red', mood: 'A bold confession that lights up the night in a flash' },
  '#8C1C1C': { name: 'Red Velvet', mood: "Deep and rich, impossible to forget once you've seen it" },
  '#B85C3D': { name: 'Terracotta', mood: 'Solid and warm like earth, a color you can trust' },
  '#F48D34': { name: 'Orange Marmalade', mood: 'Bright and full of energy, like it soaked up the sunshine' },
  '#F6B98E': { name: 'Apricot Jelly', mood: 'Soft and squishy, so comforting to be around' },
  '#B48664': { name: 'Cinnamon Latte', mood: 'Cozy like a café you never want to leave' },
  '#6E4A35': { name: 'Mocha Brown', mood: 'Bold and deep like a strong cup of coffee' },
  '#FAE6A8': { name: 'Buttercream', mood: 'A soft, melt-in-your-mouth kind of sweetness' },
  '#FBEE60': { name: 'Lemon Drop', mood: 'A burst of zing that makes you laugh out loud' },
  '#DF9F20': { name: 'Honey Mustard', mood: 'Sweet with a kick, full of surprise charm' },
  '#E3D2B5': { name: 'Vanilla Latte', mood: 'Smooth and comforting, the one you reach for every day' },
  '#A66F30': { name: 'Caramel Macchiato', mood: 'Bittersweet, and richer the more you get to know it' },
  '#F6CD28': { name: 'Sunflower', mood: 'Brightly devoted to just one person' },
  '#A9E25A': { name: 'Lime Soda', mood: 'Fresh and fizzy with a surprise twist' },
  '#8CB168': { name: 'Matcha Latte', mood: 'A little bitter, but you keep craving it' },
  '#556732': { name: 'Olive Grove', mood: 'Deep, calm and unshakable' },
  '#839B3B': { name: 'Avocado', mood: 'Tough on the outside, soft on the inside' },
  '#8DE2CD': { name: 'Mint Chocolate Chip', mood: 'Love it or hate it, and the ones who love it are obsessed' },
  '#5EEDC0': { name: 'Spearmint', mood: "One chew and you're wide awake, a fresh way to make a move" },
  '#BCE9A5': { name: 'Green Grape Fizz', mood: 'Fresh and innocent, the color of first love' },
  '#2A6F4D': { name: 'Forest Green', mood: 'Steady by your side like a deep forest' },
  '#20B678': { name: 'Emerald', mood: 'A rare heart that shines just as bright, always' },
  '#8BB191': { name: 'Sage Green', mood: 'A calm color that offers comfort without a word' },
  '#22C3C3': { name: 'Summer Sea', mood: 'Wide-open honesty, cool as the ocean' },
  '#82E4ED': { name: 'Aqua Soda', mood: 'Clear and refreshing, so the conversation just flows' },
  '#1D6472': { name: 'Deep Sea Teal', mood: "So deep you can't see the bottom, which makes it more intriguing" },
  '#C0EDE4': { name: 'Peppermint', mood: 'A crisp color that wakes up your mood' },
  '#7BC2F4': { name: 'Clear Sky', mood: 'Not a cloud in sight, a totally transparent heart' },
  '#29A9E0': { name: 'Surf Blue', mood: 'Rolls in light and easy, like catching a wave' },
  '#1F5CD6': { name: 'Cobalt Blue', mood: 'Vivid, crisp and full of confidence' },
  '#1D2B63': { name: 'Night Sky Navy', mood: 'Mysterious like a deep, quiet night' },
  '#5073A5': { name: 'Denim Blue', mood: 'Comfy and dependable, like your favorite jeans' },
  '#C4E3F3': { name: 'Ice Blue', mood: 'Cool but clear, which is exactly why it draws you in' },
  '#3D488F': { name: 'Blue Hour', mood: 'Quiet butterflies, like the moment right after sunset' },
  '#A2B3C3': { name: 'Misty Blue', mood: 'A little hazy, so you want to know more' },
  '#B7A0E3': { name: 'Dawn Lavender', mood: "Dreamy late-night feels when you just can't sleep" },
  '#522D86': { name: 'Violet Night', mood: 'A heart that gets deeper as the night goes on' },
  '#D4B5E3': { name: 'Lilac Breeze', mood: 'Lingers long, like a soft perfume' },
  '#8A2EB8': { name: 'Grape Jelly', mood: "Bouncy and sweet, one taste and you're hooked" },
  '#9994D1': { name: 'Blueberry Yogurt', mood: 'Sweet, tangy and smooth, the comfy kind of butterflies' },
  '#4E42D7': { name: 'Ultramarine', mood: "So deep and vivid you can't look away" },
  '#8F5CF5': { name: 'Purple Pop', mood: 'Poppy yet strangely mysterious, a plot-twist kind of charm' },
  '#3E1E96': { name: 'Midnight Purple', mood: 'A deep heart that stays up long past midnight' },
  '#723772': { name: 'Plum Wine', mood: 'A grown-up color that deepens as it ripens' },
  '#B561D1': { name: 'Amethyst', mood: 'Mysterious and elegant, it turns heads' },
  '#DD3CC2': { name: 'Magic Magenta', mood: 'A bold color that changes the vibe like magic' },
  '#C695B6': { name: 'Mauve Pink', mood: 'Soft but with presence, effortlessly chic' },
  '#F5A3E0': { name: 'Aurora Pink', mood: 'Dreamy like the northern lights' },
  '#DDD3C6': { name: 'Oatmeal', mood: 'Easy and calming, the color you want to see every day' },
  '#B0A69B': { name: 'Cozy Greige', mood: "Doesn't try to stand out, but quietly pulls you in" },
  '#C0C6CE': { name: 'Cloud Gray', mood: 'Soft and cozy like clouds on a gray day' },
  '#434956': { name: 'Dawn Charcoal', mood: 'Few words, but a heavy dose of sincerity' },
  '#C6B495': { name: 'Sand Beige', mood: 'Comfy like a warm, sandy beach' },
};

/** 궁합 등급 min → 영어 */
export const KKTI_MATCH_TIERS_EN: Readonly<Record<number, { label: string; line: string }>> = {
  90: { label: 'Soulmates', line: 'Your texting styles are totally in sync. Combos like this are rare!' },
  78: { label: 'Perfect Match', line: 'You two click on so much without even saying it.' },
  64: { label: 'Great Banter', line: 'The more you sync up, the better this combo gets.' },
  50: { label: 'Opposites Attract', line: "You're different enough to be fascinated by each other." },
  0: { label: 'Total Opposites', line: 'Complete opposites, which is exactly why sparks fly.' },
};

export const KKTI_FIT_LABEL_EN: Readonly<Record<KktiFit, string>> = { good: 'Great fit', ok: 'Solid', care: 'Work on it' };

export const KKTI_MATCH_LINES_EN: Readonly<Record<KktiAxisKey, { plus: string; minus: string; differ: string; close?: string }>> = {
  start: {
    plus: 'Both first-texters! The chat never dies, just take turns leading',
    minus: "You both wait for the other to text first, so decide who's going first",
    differ: 'One makes the first move, the other happily catches it',
  },
  speed: {
    plus: 'Both instant repliers, so the chat flies back and forth like ping-pong',
    minus: 'Both laid-back, so slow replies never hurt anyone\'s feelings',
    differ: 'Different reply speeds. Fast one: no nagging. Slow one: a quick "will reply later!"',
    close: 'Similar reply speeds, so nobody gets worn out waiting',
  },
  express: {
    plus: 'Two hype texters together = the chat is a party',
    minus: "Two low-key texters, so it's comfy even with few words",
    differ: 'One is all hype, one is dry. "k" isn\'t cold, it\'s just their style',
    close: 'Similar levels of expression, so no hurt feelings over mismatched energy',
  },
  pace: {
    plus: 'Both all-in, so things move fast and easy',
    minus: 'Both careful, so things deepen slowly. But someone has to be brave eventually',
    differ: 'All-in meets slow burn. Matching your pace is the homework here',
    close: "Similar pace, so it's easy to stay in step",
  },
};

export const KKTI_MATCH_TIPS_EN: Readonly<Record<KktiAxisKey, string>> = {
  start: "Take turns texting first! Decide whose turn it is today.",
  speed: "Reply speed isn't how much someone cares. Tell each other your usual pace first.",
  express: 'You just express things differently. A little more reacting, a little less assuming!',
  pace: "Go at the slower person's pace. Just don't hide how you feel.",
};
export const KKTI_MATCH_TIP_ALL_GOOD_EN = "You're already on the same wavelength. Keep this rhythm going.";

/** 궁합 이유 문장의 앞부분 — 누가 먼저 다가가는지 */
export const KKTI_LEAD_EN: Readonly<Record<KktiLead, string>> = {
  i_lead: 'You make the first move and they happily catch it',
  they_lead: 'They make the first move, so you never have to wait',
  both_lead: "You'd both race to text first and fight over who leads",
  both_wait: "You'd both wait for the other to text first, so nothing ever starts",
};

// ───────────────────────── 영어로 고르기 (언어와 상관없이 영어) ─────────────────────────

/** 영어 유형 코드 (예: 선빠폭직 → FRHA). 모르는 글자는 그대로 둔다 — 화면·그림 표시용, 링크·저장에는 쓰지 않는다 */
export function kktiEnglishCode(code: string): string {
  return codeLetters(code)
    .map((letter, i) => {
      const axis = KKTI_AXES[i];
      if (!axis) return letter;
      const en = KKTI_AXES_EN[axis.key];
      return letter === axis.plus.letter ? en.plus.letter : letter === axis.minus.letter ? en.minus.letter : letter;
    })
    .join('');
}

/** 애니어그램 이름 (예: Type 2 Helper). 모르는 번호면 null */
export function kktiEnneagramTitleEn(number: number): string | null {
  const en = KKTI_ENNEAGRAM_EN[number];
  return en ? `Type ${number} ${en.name}` : null;
}

export interface KktiMatchCopy {
  tier: { label: string; line: string; emoji: string };
  axes: { key: KktiAxisKey; label: string; fitLabel: string; line: string }[];
  tip: string;
}

/** 궁합 결과의 영어 문구 (등급·축별 한 줄·한마디). 영어가 빠진 칸은 kkti.ts 값 그대로 */
export function kktiMatchEn(m: KktiMatch): KktiMatchCopy {
  const tier = KKTI_MATCH_TIERS_EN[m.tier.min];
  return {
    tier: { label: tier?.label ?? m.tier.label, line: tier?.line ?? m.tier.line, emoji: m.tier.emoji },
    axes: m.axes.map((a) => {
      const lines = KKTI_MATCH_LINES_EN[a.key];
      return { key: a.key, label: KKTI_AXES_EN[a.key].label, fitLabel: KKTI_FIT_LABEL_EN[a.fit], line: lines[a.lineKey] ?? lines.differ };
    }),
    tip: m.tipKey ? KKTI_MATCH_TIPS_EN[m.tipKey] : KKTI_MATCH_TIP_ALL_GOOD_EN,
  };
}

// ───────────────────────── 공유 링크 언어 ─────────────────────────

/** 앱이 지원하는 언어 — src/lib/i18n.ts 의 LANGS 와 같다 (서버는 i18n.ts 를 못 불러와 따로 둔다. 테스트가 맞춰 본다) */
export const KKTI_SHARE_LANGS = [
  'ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'vi', 'th', 'ar', 'hi',
  'pl', 'nl', 'sv', 'da', 'nb', 'fi', 'cs', 'sk', 'hu', 'ro', 'uk', 'el', 'he', 'hr', 'ms', 'ca',
] as const;
export type KktiShareLang = (typeof KKTI_SHARE_LANGS)[number];

/**
 * 공유 링크의 l(또는 화면 주소의 lang) 값 → 언어.
 * 비었으면 한국어 (예전 링크는 모두 한국어), 모르는 값은 영어 (한국어가 아닌 사람이 보낸 링크라서).
 * 받은 글자는 그대로 쓰지 않고 언제나 이 목록의 값으로 바꿔 쓴다.
 */
export function kktiShareLang(value: unknown): KktiShareLang {
  const raw = typeof value === 'string' ? value.trim().replace(/_/g, '-').toLowerCase() : '';
  if (!raw) return 'ko';
  const exact = KKTI_SHARE_LANGS.find((l) => l.toLowerCase() === raw);
  if (exact) return exact;
  const [base, ...rest] = raw.split('-');
  if (base === 'zh') return rest.some((r) => ['hant', 'tw', 'hk', 'mo'].includes(r)) ? 'zh-Hant' : 'zh-Hans';
  if (base === 'no' || base === 'nn') return 'nb';
  if (base === 'iw') return 'he';
  if (base === 'in') return 'id';
  return KKTI_SHARE_LANGS.find((l) => l === base) ?? 'en';
}

/** 카드 그림의 언어 — 한국어가 아니면 모두 영어 그림 (글꼴이 한글·라틴뿐). 같은 그림을 CDN 에서 나눠 쓰게 l=en 하나로 모은다 */
export const kktiCardLang = (lang: KktiShareLang): 'ko' | 'en' => (lang === 'ko' ? 'ko' : 'en');

/** 주소에 l=언어 를 붙인다. 한국어는 붙이지 않는다 (지금까지 나간 링크와 같은 주소) */
export function withKktiLang(url: string, lang: KktiShareLang): string {
  if (lang === 'ko') return url;
  return `${url}${url.includes('?') ? '&' : '?'}l=${encodeURIComponent(lang)}`;
}

/** 공유 링크 (/k/내코드[-상대코드][?l=언어]) */
export const kktiShareUrlFor = (lang: KktiShareLang, answersEncoded: string, withEncoded?: string | null): string =>
  withKktiLang(shareUrl(answersEncoded, withEncoded), lang);

/** 결과 카드 그림 주소 — 한국어가 아니면 영어 카드(l=en) */
export const kktiCardUrlFor = (lang: KktiShareLang, answersEncoded: string, withEncoded?: string | null, shape: KktiCardShape = 'og', site?: string): string =>
  withKktiLang(cardUrl(answersEncoded, withEncoded, shape, site), kktiCardLang(lang));
