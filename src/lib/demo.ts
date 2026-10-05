import type { CrushReport, MindReading, PracticeReply } from '@/lib/ai-schemas';
import type { MindRequest, PracticeRequest, ReportRequest } from '@/lib/ai-tasks';
import type { CoachRequest } from '@/lib/coach-schema';
import type { CoachAnalysis } from '@/lib/types';

/**
 * 데모 빌드(EXPO_PUBLIC_DEMO_MODE=1) 전용 샘플 결과.
 * 실제 AI 호출 없이 UI 흐름을 보여주기 위한 것으로, 결과 문구에 "데모 샘플"임을 표시합니다.
 */
export const isDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE === '1';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function demoAnalysis(req: CoachRequest): Promise<CoachAnalysis> {
  await wait(2200);
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
  return {
    callName: req.crush.callName ?? null,
    speechLevel: polite ? 'polite' : 'casual',
    summary: `(데모 샘플) ${name}님이 먼저 주말 계획을 물어본 건 꽤 좋은 신호예요. 지금은 부담 없이 구체적인 제안을 던져도 괜찮은 타이밍이에요.${hasImage ? ' 올려주신 캡처 기준으로 분위기는 편안한 편이에요.' : ''}`,
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
  };
}

export async function demoReport(req: ReportRequest): Promise<CrushReport> {
  await wait(1800);
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
