import type { CoachRequest } from '@/lib/coach-schema';
import type { CoachAnalysis } from '@/lib/types';

/**
 * 데모 빌드(EXPO_PUBLIC_DEMO_MODE=1) 전용 샘플 결과.
 * 실제 AI 호출 없이 UI 흐름을 보여주기 위한 것으로, 결과 문구에 "데모 샘플"임을 표시합니다.
 */
export const isDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE === '1';

export async function demoAnalysis(req: CoachRequest): Promise<CoachAnalysis> {
  await new Promise((r) => setTimeout(r, 2200));
  const name = req.crush.name;
  const hasImage = Boolean(req.image);
  const replies: CoachAnalysis['replies'] = [
    {
      tone: req.tone,
      text: `이번 주말에 나 성수 카페 투어 가려는데, 같이 갈 사람 구해요 ㅋㅋ ${name}님 관심 있으면 손`,
      why: '가볍게 웃음을 주면서도 약속으로 자연스럽게 연결돼요.',
    },
    {
      tone: 'natural',
      text: '토요일에 시간 되면 그 파스타집 같이 가볼래? 저번에 얘기했던 데',
      why: '이전 대화를 기억하고 있다는 걸 보여줘서 진심이 느껴져요.',
    },
    {
      tone: 'cool',
      text: '주말에 별일 없으면 밥이나 먹자. 내가 맛집 하나 알아둠',
      why: '담백해서 부담이 없고 여유가 느껴져요.',
    },
  ];
  return {
    summary: `(데모 샘플) ${name}님이 먼저 주말 계획을 물어본 건 꽤 좋은 신호예요. 지금은 부담 없이 구체적인 제안을 던져도 괜찮은 타이밍이에요.${hasImage ? ' 올려주신 캡처 기준으로 분위기는 편안한 편이에요.' : ''}`,
    temperature: 'warm',
    interestScore: 68,
    insights: [
      `${name}님이 먼저 질문을 던지며 대화를 이어가고 있어요.`,
      `이모티콘과 "ㅋㅋ" 사용량이 ${req.user.name}님과 비슷해서 편안한 분위기예요.`,
      req.crush.mbti ? `${req.crush.mbti} 성향이라면 즉흥적인 제안에도 잘 반응할 가능성이 높아요.` : '아직 약속 얘기가 나온 적은 없어서, 가벼운 제안이 좋아요.',
    ],
    replies,
    nextStep: '답이 긍정적이면 바로 시간과 장소를 정해서 확정해요. 애매하면 다음 주로 살짝 미뤄 여지를 남기세요.',
    warnings: ['같은 날 두 번 이상 약속을 재촉하지 마세요.', '이 결과는 데모용 샘플이에요. 실제 앱에서는 AI가 캡처를 분석해 답장을 만들어요.'],
  };
}
