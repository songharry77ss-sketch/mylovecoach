import { isUnnamedCrush } from '@/components/crush/crush-name';
import type { CrushReport, MindReading, PracticeReply } from '@/lib/ai-schemas';
import type { MindRequest, PracticeRequest, ReportRequest } from '@/lib/ai-tasks';
import { CoachAnalysisReadSchema, normalizeAnalysis, type CoachRequest } from '@/lib/coach-schema';
import { L, isEn } from '@/lib/i18n';
import { fillThem } from '@/lib/mind-cards';
import type { CoachAnalysis } from '@/lib/types';

/**
 * 데모 빌드(EXPO_PUBLIC_DEMO_MODE=1) 전용 샘플 결과.
 * 실제 AI 호출 없이 UI 흐름을 보여주기 위한 것으로, 결과 문구에 "데모 샘플"임을 표시합니다.
 * (영어판은 스토어 스크린샷용이라 표시 없이 자연스러운 영어 결과 — 아래 demoAnalysisEn 등)
 */
export const isDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE === '1';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 앱 사용 영상 녹화(tools/social-make/record-app.mjs)가 페이지에 미리 넣어 두는 값.
 * analysis 는 운영 코치 서버(/api/coach)가 실제로 돌려준 결과다 — 데모 빌드에서만 읽고, 운영 앱은 이 함수를 부르지 않는다
 */
export interface DemoInjection {
  analysis?: unknown;
  /** 「분석 중」을 보여 줄 시간 (기본 2초) */
  waitMs?: number;
  /** 앱이 실제로 만든 요청 — 녹화가 결과를 받을 때 보낸 요청과 같은지 맞춰 본다 */
  request?: CoachRequest;
}

const injection = (): DemoInjection | undefined => (globalThis as { __SENDIT_DEMO__?: DemoInjection }).__SENDIT_DEMO__;

/** 넣어 둔 실제 결과를 서버 응답과 같은 검사·정리를 거쳐 돌려준다. 형식이 틀리면 샘플로 넘어가지 않고 실패한다 (녹화에 샘플이 섞이지 않게) */
async function injectedAnalysis(inj: DemoInjection, req: CoachRequest): Promise<CoachAnalysis> {
  inj.request = req;
  await wait(Math.min(8000, Math.max(300, inj.waitMs ?? 2000)));
  const parsed = CoachAnalysisReadSchema.safeParse(inj.analysis);
  if (!parsed.success) throw new Error(L('넣어 둔 분석 결과의 형식이 맞지 않아요.', "The injected analysis result isn't in the right format."));
  return normalizeAnalysis(parsed.data);
}

export async function demoAnalysis(req: CoachRequest): Promise<CoachAnalysis> {
  const inj = injection();
  if (inj?.analysis) return injectedAnalysis(inj, req);
  await wait(2200);
  if (isEn) return demoAnalysisEn(req);
  const name = req.crush.name;
  const hasImage = Boolean(req.image);
  // 호칭·말투를 지키는지 데모에서도 보이도록 요청의 값을 그대로 쓴다
  const call = req.crush.callName?.trim() || (name === '상대' || name === '비밀 상담' ? '' : name);
  const lead = (t: string) => (call ? `${call} ${t}` : t);
  const polite = req.crush.speech === 'polite' || (!req.crush.speech && req.crush.relationship === 'blind_date');
  const emoji = req.emoji !== 'off';
  const e = (s: string) => (emoji ? ` ${s}` : '');
  const replies: CoachAnalysis['replies'] = polite
    ? [
        { tone: req.tone, text: lead(`이번 주말에 시간 괜찮으시면 저번에 말씀하신 성수 카페 같이 가실래요?${e('☕️')}`), why: '이전 대화를 기억한다는 신호와 구체적인 제안이 함께 있어요.', expectedReaction: '오 좋아요!! 토요일 괜찮으세요?', successRate: 78 },
        { tone: 'natural', text: `저 요즘 파스타 맛집 찾는 중인데 ${call || '혹시'} 어디 좋아하세요?${e('🍝')}`, why: '답하기 쉬운 질문이라 부담 없이 대화가 이어져요.', expectedReaction: '헉 저 파스타 진짜 좋아해요 ㅎㅎ', successRate: 71 },
        { tone: 'witty', text: `${call ? `${call} 덕분에` : '덕분에'} 오늘 하루 버텼어요 ㅋㅋ 주말엔 제가 맛있는 거 살게요${e('🤭')}`, why: '가벼운 칭찬과 약속을 한 번에 담았어요.', expectedReaction: 'ㅋㅋㅋ 뭐예요 좋아요', successRate: 64 },
      ]
    : [
        { tone: req.tone, text: lead(`이번 주말에 나랑 성수 카페 투어 갈래? 저번에 말한 데${e('☕️')}`), why: '이전 대화를 기억하고 있다는 걸 보여 주면서 약속으로 연결돼요.', expectedReaction: '헐 좋아!! 토요일 어때?', successRate: 82 },
        { tone: 'natural', text: `토요일에 시간 되면 그 파스타집 같이 가보자${e('🍝')}`, why: '담백한 제안이라 부담이 없어요.', expectedReaction: '오 콜 ㅋㅋ 몇 시?', successRate: 74 },
        { tone: 'cool', text: `주말에 별일 없으면 밥이나 먹자. 내가 맛집 하나 알아둠${e('😎')}`, why: '여유 있어 보이고 상대가 고르기 쉬워요.', expectedReaction: 'ㅋㅋ 어디길래', successRate: 66 },
      ];
  const remembered = req.crush.memory ?? [];
  return {
    callName: req.crush.callName ?? null,
    speechLevel: polite ? 'polite' : 'casual',
    summary: `(데모 샘플) ${name}님이 먼저 주말 계획을 물어본 건 꽤 좋은 신호예요. ${
      remembered.length ? '지난번에 말한 성수 카페 얘기를 기억하고 있으니, 그걸로 자연스럽게 약속을 잡아 봐요.' : '지금은 부담 없이 구체적인 제안을 던져도 괜찮은 타이밍이에요.'
    }${hasImage ? ' 올려주신 캡처 기준으로 분위기는 편안한 편이에요.' : ''}`,
    temperature: 'warm',
    interestScore: 68,
    heatDelta: hasImage ? 12 : req.text?.trim() ? 4 : 6,
    insights: [
      `${name}님이 먼저 질문을 던지며 대화를 이어가고 있어요.`,
      `이모티콘과 "ㅋㅋ" 사용량이 ${req.user.name || '나'}님과 비슷해서 편안한 분위기예요.`,
      req.crush.mbti ? `${req.crush.mbti} 성향이라면 즉흥적인 제안에도 잘 반응할 가능성이 높아요.` : '아직 약속 얘기가 나온 적은 없어서, 가벼운 제안이 좋아요.',
    ],
    replies,
    nextStep: '답이 긍정적이면 바로 시간과 장소를 정해서 확정해요. 애매하면 다음 주로 살짝 미뤄 여지를 남기세요.',
    warnings: ['같은 날 두 번 이상 약속을 재촉하지 마세요.', '이 결과는 데모용 샘플이에요. 실제 앱에서는 AI가 캡처를 분석해 답장을 만들어요.'],
    memory: req.remember === false || !req.today ? [] : demoMemory(req, remembered),
  };
}

/**
 * 데모용 「센딧이 기억하는 이야기」 — 요청마다 한 줄씩 늘어나게 해서 기억 카드·시트를 확인할 수 있게 한다.
 * 실제로는 AI 가 캡처·대화를 읽고 기존 기억을 고쳐 돌려준다
 */
function demoMemory(req: CoachRequest, remembered: string[]): string[] {
  const who = req.crush.name === '상대' || req.crush.name === '비밀 상담' ? '상대' : req.crush.name;
  const day = req.today ?? '오늘';
  const ga = `${who}${josa(who, '이', '가')}`;
  const neun = `${who}${josa(who, '은', '는')}`;
  const pool = [
    `${ga} 먼저 주말 계획을 물어봄 (${day})`,
    `${neun} 성수 카페 투어와 파스타를 좋아함`,
    `${neun} 평일엔 야근이 잦아 답장이 늦는 편`,
    `내가 "주말에 카페 갈래?"라고 보냄 (${day})`,
    `${ga} "토요일 괜찮아!"라고 답함 — 토요일 약속 잡는 중`,
    `${neun} 강아지를 키우고 전시회를 좋아함`,
    `서로 ㅋㅋ를 자주 쓰는 편안한 썸 단계`,
  ];
  const next = pool.find((line) => !remembered.includes(line));
  // 첫 대화에는 두 줄, 그다음부터 한 줄씩 (최대 8줄)
  const fresh = remembered.length ? (next ? [next] : []) : pool.slice(0, 2);
  return [...remembered, ...fresh].slice(-8);
}

export async function demoReport(req: ReportRequest): Promise<CrushReport> {
  await wait(1800);
  if (isEn) return demoReportEn(req);
  const name = req.crush.name;
  return {
    headline: `천천히 데워지는 신중한 다정파`,
    keywords: ['신중함', '리액션', '맛집러', '배려심'],
    personality: `(데모 샘플) ${name}님은 처음엔 조심스럽지만 마음을 열면 리액션이 풍부해지는 타입이에요. 대화를 이어가려는 노력이 꾸준히 보여요.`,
    textingStyle: '답장은 30분~1시간 텀이지만 길고 성실하게 와요. "ㅋㅋ"와 이모지를 적당히 섞어요.',
    greenFlags: ['먼저 주말 계획을 물어봤어요.', '대화가 끊길 때 질문으로 이어 줬어요.', '내가 한 얘기를 기억하고 있었어요.'],
    redFlags: ['밤늦은 시간엔 답장이 짧아지는 편이에요.'],
    interests: ['카페 투어', '파스타', '전시회', '강아지'],
    strategy: ['구체적인 날짜와 장소로 가볍게 제안하세요.', '상대가 좋아하는 맛집 얘기로 대화를 시작하세요.', '답장 텀은 상대와 비슷하게 맞추세요.'],
    roadmap: [
      { title: '편한 대화', action: '관심사 질문으로 하루 한 번 대화를 이어가요.' },
      { title: '첫 약속', action: '이번 주 안에 카페 약속을 제안해요.' },
      { title: '마음 확인', action: '두 번째 만남 뒤 솔직한 호감 표현을 해 봐요.' },
    ],
    innerThought: '이 사람이랑 얘기하면 은근 재밌는데… 먼저 만나자고 해주면 좋겠다',
    compatibility: 76,
    compatibilityNote: '대화 리듬과 관심사가 잘 맞고, 온도가 꾸준히 오르고 있어요.',
  };
}

export async function demoMind(req: MindRequest): Promise<MindReading> {
  await wait(1500);
  if (isEn) return demoMindEn(req);
  const who = req.perspective === 'male' ? '남자' : req.perspective === 'female' ? '여자' : '상대';
  return {
    headline: `(데모 샘플) 관심은 있는데 타이밍을 놓친 쪽일 가능성이 커요`,
    innerVoice: '아 답장해야 하는데… 뭐라고 보내야 덜 어색하지',
    possibilities: [
      { label: '진짜 바빴음', percent: 45, reason: `많은 ${who}는 바쁠 때 짧게라도 답하는 걸 미루는 편이에요.` },
      { label: '답장 고민 중', percent: 35, reason: '좋은 답을 하고 싶어서 오히려 늦어지는 경우가 많아요.' },
      { label: '관심이 식는 중', percent: 20, reason: '이런 일이 반복되면 이 가능성이 커져요.' },
    ],
    advice: '오늘은 재촉하지 말고, 내일 가벼운 새 화제로 먼저 말을 걸어 보세요.',
    sampleReply: '오늘 엄청 바빴나 봐요 ㅎㅎ 저녁은 먹었어요?',
  };
}

export async function demoPractice(req: PracticeRequest): Promise<PracticeReply> {
  await wait(1200);
  if (isEn) return demoPracticeEn(req);
  const last = req.turns[req.turns.length - 1]?.text ?? '';
  const asked = /[?？]/.test(last);
  const polite = req.persona.speech === 'polite';
  return {
    replies: asked
      ? [polite ? '오 저도 그거 좋아해요 ㅎㅎ' : '오 나도 그거 좋아해 ㅋㅋ', polite ? '혹시 주말에 시간 되세요?' : '주말에 뭐 해?']
      : [polite ? 'ㅎㅎ 그렇구나요' : 'ㅋㅋ 그렇구나'],
    heatDelta: asked ? 7 : 1,
    mood: asked ? '😊' : '🙂',
    feedback: asked ? '(데모) 질문으로 대화를 이어간 게 좋았어요!' : '(데모) 질문을 하나 붙이면 대화가 더 쉽게 이어져요.',
    better: asked ? '' : '저도 그래요 ㅎㅎ 요즘 빠진 거 있어요?',
    ended: false,
  };
}

/*
 * ── 영어판 데모 (My Love Coach) ──
 * 웹 데모(?lang=en)와 영어 스토어 스크린샷에 그대로 찍히므로 「데모 샘플」 표시 없이 자연스러운 영어로 쓴다.
 * 장면: 내가 데이트를 신청했더니 상대가 "haha maybe 👀" 라고 답한 순간. 대명사는 상대 성별에 맞춘다(fillThem).
 * 영어에는 존댓말·반말이 없어 답장은 한 벌(casual)만 둔다.
 */

/** 이름을 모르는 방(기본 상대·비밀 상담)인지 — 영어판 저장값(Them·Private chat)도 함께 본다 */
const unnamedEn = (name: string) => isUnnamedCrush(name) || name === '비밀 상담' || name === 'Private chat';

function demoAnalysisEn(req: CoachRequest): CoachAnalysis {
  const name = req.crush.name;
  const g = req.crush.gender;
  const unnamed = unnamedEn(name);
  // 호칭이 있으면 첫 답장 앞에 붙인다 (한국어판처럼 요청 값을 그대로 써서 호칭을 지키는지 보이게)
  const call = req.crush.callName?.trim() || (unnamed ? '' : name);
  const lead = (t: string) => (call ? `${call}, ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t);
  const emoji = req.emoji !== 'off';
  const e = (s: string) => (emoji ? ` ${s}` : '');
  const hasImage = Boolean(req.image);
  const remembered = req.crush.memory ?? [];
  const whose = unnamed ? 'Their' : `${name}'s`;
  const who = unnamed ? fillThem('{They}', g) : name;
  const replies: CoachAnalysis['replies'] = [
    {
      tone: req.tone,
      text: lead(`Ok I'm taking that as a yes. Saturday at that taco place you mentioned?${e('😌')}`),
      why: 'Confident and playful, it brings back something they said, and it turns "maybe" into a real plan.',
      expectedReaction: 'lol fine you got me 😂 what time?',
      successRate: 81,
    },
    {
      tone: 'natural',
      text: `Haha fair. Free Saturday afternoon? Coffee's on me${e('☕️')}`,
      why: 'Low-pressure and specific, so it\'s easy to say yes.',
      expectedReaction: 'saturday works! where?',
      successRate: 74,
    },
    {
      tone: 'witty',
      text: `"Maybe" is my favorite kind of yes. I'll pick the place, you pick dessert${e('👀')}`,
      why: 'Turns the maybe into a little game and makes the plan sound fun.',
      expectedReaction: "hahaha deal. you're confident huh",
      successRate: 66,
    },
  ];
  return {
    callName: req.crush.callName ?? null,
    speechLevel: 'casual',
    summary: `${whose} "haha maybe 👀" isn't a no — it's a playful maybe, and the emoji says ${fillThem("{they're}", g)} curious. ${
      remembered.length ? fillThem('{They} mentioned that taco place last time, so use it to lock in a real plan.', g) : "Make it easy to say yes with a specific day and place."
    }${hasImage ? ' Going by your screenshot, the vibe is relaxed and a little flirty.' : ''}`,
    temperature: 'warm',
    interestScore: 68,
    heatDelta: hasImage ? 12 : req.text?.trim() ? 4 : 6,
    insights: [
      `${who} left the door open with an emoji — that's interest, not a brush-off.`,
      'You two text with a similar energy and emoji use, so the convo feels easy.',
      req.crush.mbti ? fillThem(`As an ${req.crush.mbti}, {they}'ll probably love a spontaneous, specific plan.`, g) : 'Nothing is locked in yet, so a light, specific ask works best.',
    ],
    replies,
    nextStep: fillThem("If {they} say{s} yes, lock in the time and place right away. If it's still vague, give it a day and leave the door open.", g),
    warnings: ["Don't push for an answer more than once in a day.", fillThem("If {they} {does}n't reply tonight, skip the double text — give it until tomorrow.", g)],
    memory: req.remember === false || !req.today ? [] : demoMemoryEn(req, remembered),
  };
}

/** 영어판 「코치가 기억하는 이야기」 — 한국어판처럼 요청마다 한 줄씩 늘어난다 */
function demoMemoryEn(req: CoachRequest, remembered: string[]): string[] {
  const who = unnamedEn(req.crush.name) ? fillThem('{They}', req.crush.gender) : req.crush.name;
  const day = req.today ?? 'today';
  const pool = [
    `${who} replied "haha maybe 👀" when I asked about Saturday (${day})`,
    'Loves taco spots and live music',
    'Works late on weekdays, so replies come slowly',
    `I asked "free Saturday afternoon?" (${day})`,
    `${who} said "Saturday works!" — making plans for Saturday`,
    'Has a dog and loves art exhibits',
    'Easy, flirty talking stage — lots of emoji on both sides',
  ];
  const next = pool.find((line) => !remembered.includes(line));
  const fresh = remembered.length ? (next ? [next] : []) : pool.slice(0, 2);
  return [...remembered, ...fresh].slice(-8);
}

function demoReportEn(req: ReportRequest): CrushReport {
  const g = req.crush.gender;
  const who = unnamedEn(req.crush.name) ? 'This person' : req.crush.name;
  return {
    headline: 'Slow to warm up, sweet once they do',
    keywords: ['Thoughtful', 'Expressive', 'Foodie', 'Caring'],
    personality: fillThem(`${who} is a little careful at first, but gets really expressive once {they} open{s} up. {They} consistently put{s} in effort to keep the conversation going.`, g),
    textingStyle: fillThem('Replies take 30 minutes to an hour, but they\'re long and thoughtful. {They} mix{es} in "haha" and emoji just enough.', g),
    greenFlags: ['Asked about your weekend plans first.', 'Kept the convo going with questions when it slowed down.', 'Remembered things you told them.'],
    redFlags: ['Replies get shorter late at night.'],
    interests: ['Coffee shops', 'Tacos', 'Art exhibits', 'Dogs'],
    strategy: ['Suggest something light with a specific day and place.', 'Open with their favorite food spots.', 'Match their reply pace.'],
    roadmap: [
      { title: 'Easy convo', action: 'Keep a daily chat going with questions about their interests.' },
      { title: 'First date', action: 'Suggest coffee sometime this week.' },
      { title: 'Make it clear', action: "After the second date, let them know you're into them." },
    ],
    innerThought: 'Talking to them is honestly so fun… I kinda hope they ask me out first',
    compatibility: 76,
    compatibilityNote: 'Your texting rhythm and interests line up, and the heat keeps climbing.',
  };
}

function demoMindEn(req: MindRequest): MindReading {
  const people = req.perspective === 'male' ? 'guys' : req.perspective === 'female' ? 'girls' : 'people';
  return {
    headline: fillThem("{They're} probably interested — {they} just missed the moment", req.perspective),
    innerVoice: 'ugh I need to reply… what do I even say so it doesn\'t sound weird',
    possibilities: [
      { label: 'Genuinely busy', percent: 45, reason: `A lot of ${people} put off replying when they're busy, even if it's just a quick text.` },
      { label: 'Overthinking the reply', percent: 35, reason: 'Wanting to send the perfect reply often makes it take longer.' },
      { label: 'Losing interest', percent: 20, reason: 'If this keeps happening, this one gets more likely.' },
    ],
    advice: "Don't chase today. Tomorrow, reach out first with something light and new.",
    sampleReply: 'Sounds like today was crazy haha. Did you get to eat dinner?',
  };
}

function demoPracticeEn(req: PracticeRequest): PracticeReply {
  const last = req.turns[req.turns.length - 1]?.text ?? '';
  const asked = /[?？]/.test(last);
  return {
    replies: asked ? ['omg wait I love that too haha', 'are you free this weekend?'] : ['haha nice'],
    heatDelta: asked ? 7 : 1,
    mood: asked ? '😊' : '🙂',
    feedback: asked ? 'Nice — asking a question kept the convo going!' : 'Add a question and the convo flows way more easily.',
    better: asked ? '' : 'Same haha. What are you into lately?',
    ended: false,
  };
}

/** 받침이 있으면 앞의 조사, 없으면 뒤의 조사 (한글이 아니면 뒤의 조사) */
function josa(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return withoutFinal;
  return code % 28 ? withFinal : withoutFinal;
}
