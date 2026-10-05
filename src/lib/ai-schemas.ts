/**
 * 코칭 외 AI 기능(상대 분석 보고서 · 속마음 풀이 · 연애 연습)의 출력 스키마.
 * 앱과 서버가 같이 쓰므로 zod 만 사용하는 순수 TS 로 둔다.
 */
import { z } from 'zod';

const clampInt = (n: number, min: number, max: number) => (Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : 0);
const clean = (list: string[], max: number) => list.map((s) => s.trim()).filter(Boolean).slice(0, max);

/** 상대 분석 보고서 */
export const CrushReportSchema = z.object({
  headline: z.string().describe('상대를 한 문장으로 요약한 제목 (예: 천천히 데워지는 신중한 다정파)'),
  keywords: z.array(z.string()).describe('상대 성향 키워드 3~5개, 각 2~6글자'),
  personality: z.string().describe('성향 분석 2~3문장'),
  textingStyle: z.string().describe('연락 스타일 분석 1~2문장 (답장 속도, 말투, 이모지, 대화를 이어 가는 방식)'),
  greenFlags: z.array(z.string()).describe('지금까지 보인 호감 신호 2~4개, 각 한 문장'),
  redFlags: z.array(z.string()).describe('주의할 신호 0~3개, 각 한 문장. 없으면 빈 배열'),
  interests: z.array(z.string()).describe('대화 소재로 쓸 만한 관심사 2~5개, 각 2~8글자'),
  strategy: z.array(z.string()).describe('이 사람에게 잘 먹히는 공략법 3개, 각 한 문장'),
  roadmap: z
    .array(z.object({ title: z.string().describe('짧은 단계 이름'), action: z.string().describe('구체적인 행동 한 문장') }))
    .describe('목표까지 가는 3단계 로드맵'),
  innerThought: z.string().describe('지금 상대의 속마음을 추측한 한마디. 상대의 1인칭, 상대가 쓰는 말투, 따옴표 없이'),
  compatibility: z.number().describe('두 사람의 대화 궁합 점수 0~100 정수'),
  compatibilityNote: z.string().describe('궁합 점수의 근거 한 문장'),
});
export type CrushReport = z.infer<typeof CrushReportSchema>;

export function normalizeReport(r: CrushReport): CrushReport {
  return {
    ...r,
    headline: r.headline.trim(),
    keywords: clean(r.keywords, 5),
    greenFlags: clean(r.greenFlags, 4),
    redFlags: clean(r.redFlags, 3),
    interests: clean(r.interests, 5),
    strategy: clean(r.strategy, 3),
    roadmap: r.roadmap.filter((s) => s.title.trim() || s.action.trim()).slice(0, 4),
    compatibility: clampInt(r.compatibility, 0, 100),
  };
}

/** 「이 상황에서 그 사람은 어떻게 생각할까?」 속마음 풀이 */
export const MindReadingSchema = z.object({
  headline: z.string().describe('한 줄 결론 (예: 관심은 있는데 타이밍을 놓친 쪽일 가능성이 커요)'),
  innerVoice: z.string().describe('그 사람의 속마음 혼잣말 한 문장. 1인칭 반말, 따옴표 없이'),
  possibilities: z
    .array(
      z.object({
        label: z.string().describe('가능성 이름 (예: 진짜 바빴음)'),
        percent: z.number().describe('가능성 0~100 정수'),
        reason: z.string().describe('근거 한 문장'),
      }),
    )
    .describe('가능한 해석 2~4개. percent 합이 100'),
  advice: z.string().describe('지금 해볼 구체적인 행동 1~2문장'),
  sampleReply: z.string().describe('바로 보낼 수 있는 메시지 예시 한 개. 필요 없으면 빈 문자열'),
});
export type MindReading = z.infer<typeof MindReadingSchema>;

export function normalizeMind(m: MindReading): MindReading {
  const list = m.possibilities.filter((p) => p.label.trim()).slice(0, 4);
  // 합이 100 이 되도록 비율을 맞춘다 (모델이 대충 맞춘 값을 보정)
  const total = list.reduce((sum, p) => sum + Math.max(0, p.percent || 0), 0);
  let scaled = list.map((p) => ({ ...p, percent: total > 0 ? Math.round((Math.max(0, p.percent) / total) * 100) : Math.round(100 / list.length) }));
  const drift = 100 - scaled.reduce((sum, p) => sum + p.percent, 0);
  if (scaled.length && drift !== 0) scaled = scaled.map((p, i) => (i === 0 ? { ...p, percent: Math.max(0, p.percent + drift) } : p));
  return { ...m, possibilities: scaled.sort((a, b) => b.percent - a.percent), sampleReply: m.sampleReply.trim() };
}

/** 연애 연습 — 상대역의 다음 말과 코치 평가 */
export const PracticeReplySchema = z.object({
  replies: z.array(z.string()).describe('상대역이 보내는 카톡 말풍선 1~3개. 짧게, 상대역 말투 그대로'),
  heatDelta: z.number().describe('사용자의 마지막 메시지로 상대역의 호감이 움직인 폭. -15~+15 정수'),
  mood: z.string().describe('상대역의 지금 기분을 나타내는 이모지 1개'),
  feedback: z.string().describe('사용자의 마지막 메시지에 대한 코치 피드백 한 문장 (친근한 존댓말)'),
  better: z.string().describe('더 좋았을 메시지 예시 한 개. 이미 충분히 좋으면 빈 문자열'),
  ended: z.boolean().describe('상대역이 대화를 마무리했으면 true'),
});
export type PracticeReply = z.infer<typeof PracticeReplySchema>;

export function normalizePractice(p: PracticeReply): PracticeReply {
  return {
    ...p,
    replies: clean(p.replies, 3),
    heatDelta: clampInt(p.heatDelta, -15, 15),
    mood: p.mood.trim().slice(0, 4) || '🙂',
    better: p.better.trim(),
  };
}
