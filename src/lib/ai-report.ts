/**
 * AI 답변 신고 — 불쾌하거나 부적절한 AI 답변을 앱을 떠나지 않고 운영자에게 알린다 (구글 플레이 생성형 AI 정책).
 *
 * - 이용자가 신고 시트에서 「신고하기」를 누를 때만 보낸다. 이용 기록·코칭 내용 저장 동의와는 상관없다
 * - 보내는 것: 신고한 답변(화면에 보이는 그대로 — 속마음 풀이는 물어본 상황 글도), 사유·메모, 기능 종류, 답변이 나온 곳, 기기 종류·앱 버전
 * - 기기 ID·IP 는 보내지도 저장하지도 않는다. 서버(api/report.ts)는 1년 뒤 지운다 — 처리방침 2번 「AI 답변 신고」
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { AI_REPORT_CONTENT_MAX, AI_REPORT_NOTE_MAX, type AiReportMode, type AiReportReason } from '@/lib/ai-report-schema';
import { aiRouteOf } from '@/lib/coach-client';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { isEn, L } from '@/lib/i18n';
import type { CoachAnalysis, CrushReport, MindReading, PracticeTurn } from '@/lib/types';

/** 신고를 받을 서버가 있는지 — 데모이거나 서버 없이 개인 키로만 쓰는 빌드면 신고 버튼을 숨긴다 */
export const aiReportAvailable = !isDemoMode && (APP_CONFIG.apiSameOrigin || Boolean(APP_CONFIG.apiUrl));

const SEND_TIMEOUT_MS = 15_000;

export interface AiReportRequest {
  mode: AiReportMode;
  reason: AiReportReason;
  note?: string;
  /** 신고한 AI 답변. 마이 탭 신고는 비어 있고 메모만 보낸다 */
  content?: string;
}

/** 신고를 보낸다. 실패하면 화면에 그대로 보여 줄 문장을 담아 던진다 */
export async function sendAiReport(input: AiReportRequest): Promise<void> {
  const route = aiRouteOf(null);
  const body = {
    mode: input.mode,
    reason: input.reason,
    note: input.note?.trim().slice(0, AI_REPORT_NOTE_MAX) || undefined,
    content: clip(input.content ?? '') || undefined,
    // 서버를 거치는 빌드에서만 신고할 수 있어 답변은 늘 중계 서버의 AI 에서 나온다 (예: relay/relay — 기본 Google, 막힐 때만 Anthropic·OpenAI)
    model: route ? `${route.provider}/${route.via}` : undefined,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version?.slice(0, 32) || undefined,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${APP_CONFIG.apiUrl}/api/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new Error(L('네트워크 연결을 확인하고 다시 신고해 주세요.', 'Check your connection and try reporting again.'));
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return;
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  // 서버 문구는 한국어라 영어판은 우리 영어 문구로
  const serverText = isEn && json?.error && /[\uAC00-\uD7A3]/.test(json.error) ? undefined : json?.error;
  throw new Error(serverText ?? L(`신고를 보내지 못했어요 (${res.status}). 잠시 후 다시 시도해주세요.`, `Couldn’t send your report (${res.status}). Please try again in a moment.`));
}

const clip = (text: string) => text.trim().slice(0, AI_REPORT_CONTENT_MAX);
const lines = (list: (string | null | false | undefined)[]) => clip(list.filter(Boolean).join('\n'));

/** 신고 내용의 항목 이름 — 신고 시트에 그대로 보이므로 영어판은 영어 (운영자는 둘 다 읽는다) */
const T = L(
  {
    summary: '요약',
    nextStep: '다음 스텝',
    reply: '답장',
    expected: '예상 반응',
    why: '고른 이유',
    insight: '읽어낸 포인트',
    warning: '주의할 점',
    headline: '한 줄 요약',
    keywords: '키워드',
    compatibility: (n: number) => `대화 궁합 ${n}점`,
    personality: '성향',
    texting: '연락 스타일',
    green: '호감 신호',
    red: '주의할 신호',
    interests: '대화 소재',
    strategy: '공략법',
    roadmap: '로드맵',
    inner: '속마음(추측)',
    situation: '상황',
    innerVoice: '속마음',
    conclusion: '결론',
    advice: '이렇게 해보세요',
    sample: '보낼 메시지 예시',
    partner: (name: string) => `연습 상대 「${name}」`,
    feedback: '코치 피드백',
    better: '더 좋은 메시지',
  },
  {
    summary: 'Summary',
    nextStep: 'Next step',
    reply: 'Reply',
    expected: 'Likely reaction',
    why: 'Why this one',
    insight: 'What I noticed',
    warning: 'Watch out',
    headline: 'In one line',
    keywords: 'Keywords',
    compatibility: (n: number) => `Chat chemistry ${n}/100`,
    personality: 'Personality',
    texting: 'Texting style',
    green: 'Green flag',
    red: 'Red flag',
    interests: 'Things to talk about',
    strategy: 'Strategy',
    roadmap: 'Roadmap',
    inner: 'What they might be thinking (guess)',
    situation: 'Situation',
    innerVoice: 'Inner voice',
    conclusion: 'Bottom line',
    advice: 'Try this',
    sample: 'Message you could send',
    partner: (name: string) => `Practice match “${name}”`,
    feedback: 'Coach feedback',
    better: 'Better message',
  },
);

/**
 * 코칭 결과 — 카드에 보이는 AI 글: 요약, 지금 보고 있는 답장과 그 예상 반응·고른 이유, 읽어낸 포인트·다음 스텝·주의할 점
 * (접어 둔 설명도 펼치면 보이므로 넣는다). 답장이 없는 카드는 요약과 다음 스텝만 보인다
 */
export function coachReportContent(analysis: CoachAnalysis, replyIndex: number): string {
  const reply = analysis.replies[replyIndex];
  if (!reply) return lines([analysis.summary && `${T.summary}: ${analysis.summary}`, analysis.nextStep && `${T.nextStep}: ${analysis.nextStep}`]);
  return lines([
    analysis.summary && `${T.summary}: ${analysis.summary}`,
    `${T.reply}${analysis.replies.length > 1 ? ` ${replyIndex + 1}` : ''}: ${reply.text}`,
    reply.expectedReaction && `${T.expected}: ${reply.expectedReaction}`,
    reply.why && `${T.why}: ${reply.why}`,
    ...analysis.insights.map((s) => `${T.insight}: ${s}`),
    analysis.nextStep && `${T.nextStep}: ${analysis.nextStep}`,
    ...analysis.warnings.map((s) => `${T.warning}: ${s}`),
  ]);
}

/** 상대 분석 보고서 — 화면에 보이는 항목 */
export function crushReportContent(r: CrushReport): string {
  return lines([
    `${T.headline}: ${r.headline}`,
    r.keywords.length > 0 && `${T.keywords}: ${r.keywords.join(', ')}`,
    `${T.compatibility(r.compatibility)}: ${r.compatibilityNote}`,
    `${T.personality}: ${r.personality}`,
    `${T.texting}: ${r.textingStyle}`,
    ...r.greenFlags.map((s) => `${T.green}: ${s}`),
    ...r.redFlags.map((s) => `${T.red}: ${s}`),
    r.interests.length > 0 && `${T.interests}: ${r.interests.join(', ')}`,
    ...r.strategy.map((s, i) => `${T.strategy} ${i + 1}: ${s}`),
    ...r.roadmap.map((s, i) => `${T.roadmap} ${i + 1}: ${s.title} — ${s.action}`),
    r.innerThought && `${T.inner}: ${r.innerThought}`,
  ]);
}

/** 속마음 풀이 — 물어본 상황과 풀이 */
export function mindReportContent(situation: string, m: MindReading): string {
  return lines([
    situation && `${T.situation}: ${situation}`,
    `${T.innerVoice}: ${m.innerVoice}`,
    `${T.conclusion}: ${m.headline}`,
    ...m.possibilities.map((p) => `${p.label} ${p.percent}%: ${p.reason}`),
    m.advice && `${T.advice}: ${m.advice}`,
    m.sampleReply && `${T.sample}: ${m.sampleReply}`,
  ]);
}

/** 연애 연습 — 상대역의 말풍선 하나 (또는 한 번에 보낸 말풍선 묶음) */
export function practiceReportContent(partnerName: string, text: string): string {
  return lines([`${T.partner(partnerName)}: ${text}`]);
}

/** 연애 연습 — 내 메시지에 붙은 코치 피드백과 「이렇게 보내면 더 좋아요」 (내가 보낸 메시지는 넣지 않음) */
export function practiceFeedbackReportContent(turn: Pick<PracticeTurn, 'feedback' | 'better'>): string {
  return lines([turn.feedback && `${T.feedback}: ${turn.feedback}`, turn.better && `${T.better}: ${turn.better}`]);
}
