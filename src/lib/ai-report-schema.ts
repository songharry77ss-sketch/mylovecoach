/**
 * AI 답변 신고의 형식 — 앱(src/lib/ai-report.ts·신고 시트)과 서버(api/report.ts)가 같이 쓴다.
 * 서버도 불러 쓰므로 zod 만 쓰는 순수 TS 로 둔다 (react-native 를 불러오면 서버 함수가 깨진다).
 */
import { z } from 'zod';

/** 신고한 답변이 나온 기능 — api/coach.ts 의 mode 와 같다 */
export const AI_REPORT_MODES = ['coach', 'report', 'practice', 'mind'] as const;
export type AiReportMode = (typeof AI_REPORT_MODES)[number];

export const AI_REPORT_REASONS = ['offensive', 'sexual', 'hate', 'dangerous', 'false', 'other'] as const;
export type AiReportReason = (typeof AI_REPORT_REASONS)[number];

export const AI_REPORT_MODE_LABEL: Record<AiReportMode, string> = {
  coach: '답장 추천',
  report: '상대 분석 보고서',
  practice: '연애 연습',
  mind: '속마음 풀이',
};

export const AI_REPORT_REASON_LABEL: Record<AiReportReason, string> = {
  offensive: '불쾌·모욕',
  sexual: '성적·부적절',
  hate: '혐오·차별',
  dangerous: '위험·불법 조장',
  false: '사실과 다름',
  other: '기타',
};

export const AI_REPORT_NOTE_MAX = 300;
export const AI_REPORT_CONTENT_MAX = 4000;

/**
 * 서버가 받는 신고. 기기 ID·IP 칸은 없다 — 보내 와도 버린다(zod 가 모르는 칸을 지움).
 * content 는 신고한 AI 답변. 마이 탭처럼 답변 없이 메모만으로 신고할 수도 있어서, 둘 중 하나는 있어야 한다
 */
export const AiReportSchema = z
  .object({
    mode: z.enum(AI_REPORT_MODES),
    reason: z.enum(AI_REPORT_REASONS),
    note: z.string().max(AI_REPORT_NOTE_MAX).optional(),
    content: z.string().max(AI_REPORT_CONTENT_MAX).optional(),
    model: z.string().max(60).optional(),
    platform: z.string().max(16).optional(),
    appVersion: z.string().max(32).optional(),
  })
  .refine((r) => Boolean(r.content?.trim() || r.note?.trim()), { message: '신고할 답변이나 메모가 없어요.' });

export type AiReportInput = z.infer<typeof AiReportSchema>;
