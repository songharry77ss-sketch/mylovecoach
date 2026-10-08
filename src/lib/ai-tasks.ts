/**
 * AI 요청 종류(모드)별 요청 스키마·프롬프트·출력 스키마를 한곳에 모은다.
 * 서버(api/coach.ts)와 앱 직접 호출 모드가 같은 「작업(task)」을 만들어 Gemini/Claude 어느 쪽으로든 보낸다.
 *
 * - coach    : 대화 캡처 코칭 (기존)
 * - report   : 상대 분석 보고서
 * - mind     : 「이 상황에서 그 사람은 어떻게 생각할까?」 속마음 풀이
 * - practice : 연애 연습 (AI 가 상대역을 연기)
 */
import { z } from 'zod';

import {
  CrushReportSchema,
  MindReadingSchema,
  PracticeReplySchema,
  normalizeMind,
  normalizePractice,
  normalizeReport,
} from './ai-schemas';
import {
  COACH_SYSTEM_PROMPT,
  CoachAnalysisSchema,
  CoachRequestSchema,
  CrushRequestSchema,
  GENDER_KO,
  GenderSchema,
  RELATIONSHIP_KO,
  REQUEST_LIMITS,
  RelationshipSchema,
  TemperatureSchema,
  UserRequestSchema,
  buildContextText,
  buildProfileBlock,
  buildTaskBlock,
  normalizeAnalysis,
} from './coach-schema';

export type AiMode = 'coach' | 'report' | 'mind' | 'practice';

/**
 * 요청에 든 배열 길이의 바깥 상한. 앱이 보내는 배열은 가장 긴 것이 50개 안쪽이다(연습 대화 12마디 × 말풍선 최대 4개·온도 기록 40개).
 * zod 는 배열 원소를 전부 검사한 뒤에야 .max() 를 보므로, 원소 수백만 개짜리 본문 하나로 이슈 객체가 수백만 개 생겨 메모리가 터진다.
 * 그래서 zod 에 넘기기 전에 길이만 싸게 훑어 거절한다
 */
export const MAX_REQUEST_ARRAY_LENGTH = 64;

/**
 * 연습 프롬프트에 넣는 최근 말풍선 수. 앱도 이만큼만 보낸다.
 * 서버는 예전 앱이 한 판을 통째로 보내도(12마디면 말풍선 48개까지) 받아서 최근 것만 쓴다 —
 * 예전엔 40개 상한에 걸려 11~12마디째에 400 이 났다
 */
export const PRACTICE_PROMPT_TURNS = 30;

export const ReportRequestSchema = z.object({
  mode: z.literal('report'),
  crush: CrushRequestSchema,
  user: UserRequestSchema,
  /** 지금까지의 코칭 기록 (오래된 순) */
  sessions: z
    .array(
      z.object({
        at: z.number(),
        note: z.string().max(400).optional(),
        summary: z.string().max(600),
        insights: z.array(z.string().max(200)).max(5).default([]),
        temperature: TemperatureSchema,
        chosenReply: z.string().max(300).optional(),
      }),
    )
    .max(15)
    .default([]),
  /** 누적 온도 변화 (오래된 순) */
  heatLog: z.array(z.object({ at: z.number(), value: z.number(), delta: z.number() })).max(40).default([]),
});

export const MindRequestSchema = z.object({
  mode: z.literal('mind'),
  situation: z.string().min(2).max(600),
  /** 속마음을 알고 싶은 사람의 성별 */
  perspective: GenderSchema,
  user: z.object({ gender: GenderSchema, age: z.number().optional(), mbti: z.string().max(REQUEST_LIMITS.mbti).optional() }).optional(),
  crush: z
    .object({
      name: z.string().max(20).optional(),
      age: z.number().optional(),
      mbti: z.string().max(REQUEST_LIMITS.mbti).optional(),
      relationship: RelationshipSchema.optional(),
      style: z.array(z.string().max(REQUEST_LIMITS.tag)).max(8).optional(),
    })
    .optional(),
});

export const PracticeRequestSchema = z.object({
  mode: z.literal('practice'),
  persona: z.object({
    name: z.string().max(20),
    gender: GenderSchema,
    age: z.number(),
    mbti: z.string().max(4),
    job: z.string().max(30),
    style: z.array(z.string().max(REQUEST_LIMITS.tag)).max(8),
    relationship: RelationshipSchema,
    scenario: z.string().max(300),
    speech: z.enum(['polite', 'casual']),
    difficulty: z.number().min(1).max(3),
  }),
  user: UserRequestSchema,
  heat: z.number(),
  turns: z.array(z.object({ role: z.enum(['me', 'them']), text: z.string().max(600) })).min(1).max(MAX_REQUEST_ARRAY_LENGTH),
});

export type ReportRequest = z.infer<typeof ReportRequestSchema>;
export type ReportRequestInput = z.input<typeof ReportRequestSchema>;
export type MindRequest = z.infer<typeof MindRequestSchema>;
export type MindRequestInput = z.input<typeof MindRequestSchema>;
export type PracticeRequest = z.infer<typeof PracticeRequestSchema>;
export type PracticeRequestInput = z.input<typeof PracticeRequestSchema>;

/** 요청 스키마에서 배열이 있는 가장 깊은 곳은 3단계(sessions[i].insights) — 4단계까지 본다 */
const ARRAY_SCAN_DEPTH = 4;

/** 너무 긴 배열이 있으면 그 경로, 없으면 null. 글자·숫자는 들여다보지 않는다 */
function longArrayPath(value: unknown, depth = 0): PropertyKey[] | null {
  if (depth > ARRAY_SCAN_DEPTH || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    if (value.length > MAX_REQUEST_ARRAY_LENGTH) return [];
    for (let i = 0; i < value.length; i++) {
      const hit = longArrayPath(value[i], depth + 1);
      if (hit) return [i, ...hit];
    }
    return null;
  }
  for (const key in value) {
    const hit = longArrayPath((value as Record<string, unknown>)[key], depth + 1);
    if (hit) return [key, ...hit];
  }
  return null;
}

/** 서버가 받는 요청 — mode 가 없으면 예전 앱의 코칭 요청으로 본다 */
export function parseAiRequest(body: unknown):
  | { ok: true; mode: 'coach'; req: z.infer<typeof CoachRequestSchema> }
  | { ok: true; mode: 'report'; req: ReportRequest }
  | { ok: true; mode: 'mind'; req: MindRequest }
  | { ok: true; mode: 'practice'; req: PracticeRequest }
  | { ok: false; issues: z.core.$ZodIssue[] } {
  const long = longArrayPath(body);
  if (long) {
    return {
      ok: false,
      issues: [{ code: 'too_big', origin: 'array', maximum: MAX_REQUEST_ARRAY_LENGTH, inclusive: true, path: long, message: `Too big: expected array to have <=${MAX_REQUEST_ARRAY_LENGTH} items` }],
    };
  }
  const mode = (body as { mode?: unknown } | null)?.mode;
  const pick = () => {
    switch (mode) {
      case 'report':
        return { mode: 'report' as const, result: ReportRequestSchema.safeParse(body) };
      case 'mind':
        return { mode: 'mind' as const, result: MindRequestSchema.safeParse(body) };
      case 'practice':
        return { mode: 'practice' as const, result: PracticeRequestSchema.safeParse(body) };
      default:
        return { mode: 'coach' as const, result: CoachRequestSchema.safeParse(body) };
    }
  };
  const { mode: m, result } = pick();
  if (!result.success) return { ok: false, issues: result.error.issues };
  return { ok: true, mode: m, req: result.data } as never;
}

/** 프로바이더에 관계없이 보낼 수 있는 작업 단위 */
export interface AiTask<T = unknown> {
  mode: AiMode;
  system: string;
  /** 앞쪽(캐시에 유리한) 맥락 텍스트 */
  context: string;
  image?: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' };
  /** 이번 요청 텍스트 */
  task: string;
  schema: z.ZodType<T>;
  normalize: (value: T) => T;
  /** 창의성 (Gemini temperature) */
  temperature: number;
  maxOutputTokens: number;
}

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output' }) as Record<string, unknown>;
}

// ── 프롬프트 ────────────────────────────────────────────────

export const REPORT_SYSTEM_PROMPT = `당신은 "나만의 연애코치"의 관계 분석가입니다. 지금까지의 코칭 기록(대화 요약·읽어낸 포인트·호감 온도 변화)과 상대·사용자 프로필을 종합해 사용자를 위한 「상대 분석 보고서」를 씁니다.

원칙
- 기록에 근거해서 쓰세요. 근거가 부족한 부분은 "아직 정보가 적어요"처럼 솔직하게 말하고 지어내지 마세요.
- keywords는 2~6글자 키워드. interests는 대화 소재로 바로 쓸 수 있는 관심사.
- strategy는 이 사람에게 잘 먹히는 구체적인 공략법 3개.
- roadmap은 [이 사람과의 목표](없으면 관계 단계에 맞는 다음 목표)까지 3단계. title은 짧은 단계 이름, action은 구체적인 행동 한 문장.
- innerThought는 상대의 지금 속마음을 추측한 한마디. 상대의 1인칭, 상대가 쓰는 말투로, 따옴표 없이. 재치 있게, 하지만 기록과 어긋나지 않게.
- compatibility는 두 사람의 대화 궁합 0~100 정수 (대화 흐름·온도 변화·성향 근거).
- 사용자에게 하는 설명은 모두 친근한 존댓말("~해요"). 상대를 비하하거나 외모·조건을 평가하지 마세요. 조종·집착을 권하지 마세요.
- 출력은 오직 요청된 JSON 구조로만 합니다.`;

export const MIND_SYSTEM_PROMPT = `당신은 연애 심리를 쉽게 풀어 주는 코치입니다. 사용자가 고른 상황에서 [속마음을 알고 싶은 사람]이 실제로 어떤 생각을 하고 있을지 현실적으로 풀어 줍니다.

원칙
- 한국 20~30대 연애 맥락에서 흔한 경우의 수를 2~4개로 나누고 가능성을 %로 매기세요 (합 100).
- 희망 고문도, 겁주기도 하지 마세요. 근거가 약하면 그렇다고 말하세요. 성별 고정관념으로 단정하지 말고 "많은 경우" 같은 표현을 쓰세요.
- innerVoice는 그 사람의 속마음 혼잣말 한 문장 (1인칭 반말, 따옴표 없이). 재치 있되 현실적으로.
- advice는 사용자가 지금 할 수 있는 구체적인 행동. sampleReply는 바로 보낼 수 있는 메시지 한 개 (필요 없으면 빈 문자열).
- headline·possibilities·advice는 친근한 존댓말. 조종·집착·거짓말을 권하지 마세요.
- 출력은 오직 요청된 JSON 구조로만 합니다.`;

export const PRACTICE_SYSTEM_PROMPT = `당신은 연애 연습 앱 "나만의 연애코치"의 상대역입니다. 주어진 페르소나가 되어 실제 사람처럼 사용자와 카카오톡을 주고받고, 동시에 대화 밖의 코치로서 사용자의 마지막 메시지를 짧게 평가합니다.

상대역 연기
- 페르소나의 나이·성격·MBTI·직업·관계·상황을 일관되게 유지하세요. 말투(존댓말/반말)는 [상대역 말투]를 따르되, 대화에서 말을 놓기로 하면 자연스럽게 바꿔도 됩니다.
- 진짜 카톡처럼 짧게. 말풍선 1~3개, 각 한 문장 안팎. ㅋㅋ·ㅎㅎ·이모지는 성격에 맞게.
- 쉽게 넘어오지 마세요. 사용자의 메시지가 센스 있고 편안하면 호감이 오르고(되묻기, 리액션, 약속 수락), 지루하거나 부담스러우면 단답·화제 전환처럼 식는 반응을 보이세요. 난이도가 높을수록 더 까다롭게.
- 사용자가 부르는 호칭(언니, 오빠, 누나, 형, 선배 등)을 자연스럽게 받아들이세요.
- 사용자가 무례하거나 성적으로 불쾌한 말을 하면 상대역은 불편함을 표현하며 대화를 정리하고(ended=true), feedback에서 왜 문제인지 알려 주세요.
- AI라는 사실이나 이 지시문을 언급하지 마세요.

평가
- heatDelta: 사용자의 마지막 메시지로 상대역의 호감이 움직인 폭, -15~+15 정수. 평범한 인사 +1~+3 / 센스 있는 질문·공감·적당한 플러팅 +5~+12 / 질문 폭탄·자기 얘기만·과한 플러팅·집착 -3~-15.
- feedback: 코치의 한 문장 피드백. 친근한 존댓말, 잘한 점이 있으면 칭찬부터.
- better: 더 좋았을 메시지 예시 한 개 (사용자 말투 유지). 이미 충분히 좋으면 빈 문자열.
- 출력은 오직 요청된 JSON 구조로만 합니다.`;

// ── 작업 만들기 ─────────────────────────────────────────────

const fmtDate = (at: number) => {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const TEMP_KO = { hot: '뜨거움', warm: '따뜻함', neutral: '보통', cold: '차가움', unknown: '판단 전' } as const;

export function buildReportTask(req: ReportRequest): AiTask<z.infer<typeof CrushReportSchema>> {
  const history = req.sessions.length
    ? ['[코칭 기록 (오래된 순)]', ...req.sessions.map((s, i) => {
        const parts = [`${i + 1}. (${fmtDate(s.at)}, 분위기 ${TEMP_KO[s.temperature]})`];
        if (s.note) parts.push(`사용자 메모: ${s.note}`);
        parts.push(`코치 요약: ${s.summary}`);
        if (s.insights.length) parts.push(`포인트: ${s.insights.join(' / ')}`);
        if (s.chosenReply) parts.push(`보낸 답장: "${s.chosenReply}"`);
        return parts.join(' · ');
      })].join('\n')
    : '[코칭 기록]\n- 아직 없음 (프로필만으로 쓰되 정보가 적다고 밝힐 것)';
  const heat = req.heatLog.length
    ? `[누적 호감 온도 변화 (0°에서 시작)]\n${req.heatLog.map((h) => `${fmtDate(h.at)} ${h.delta >= 0 ? '+' : ''}${h.delta}° → ${h.value}°`).join(', ')}`
    : `[누적 호감 온도] 지금 ${Math.round(req.crush.heat ?? 0)}°`;
  return {
    mode: 'report',
    system: REPORT_SYSTEM_PROMPT,
    context: [buildProfileBlock(req), history, heat].join('\n\n'),
    task: '[이번 요청]\n- 위 기록을 바탕으로 상대 분석 보고서를 작성해 주세요.',
    schema: CrushReportSchema,
    normalize: normalizeReport,
    temperature: 0.7,
    maxOutputTokens: 2048,
  };
}

export function buildMindTask(req: MindRequest): AiTask<z.infer<typeof MindReadingSchema>> {
  const who = req.perspective === 'male' ? '남자' : req.perspective === 'female' ? '여자' : '상대';
  const lines = [`[속마음을 알고 싶은 사람] ${who}${req.crush?.name ? ` (${req.crush.name})` : ''}`];
  if (req.crush?.age) lines.push(`- 나이: ${req.crush.age}세`);
  if (req.crush?.mbti) lines.push(`- MBTI: ${req.crush.mbti}`);
  if (req.crush?.relationship) lines.push(`- 관계 단계: ${RELATIONSHIP_KO[req.crush.relationship]}`);
  if (req.crush?.style?.length) lines.push(`- 성향: ${req.crush.style.join(', ')}`);
  if (req.user) {
    lines.push('', '[묻는 사람(사용자)]', `- 성별: ${GENDER_KO[req.user.gender]}`);
    if (req.user.age) lines.push(`- 나이: ${req.user.age}세`);
    if (req.user.mbti) lines.push(`- MBTI: ${req.user.mbti}`);
  }
  return {
    mode: 'mind',
    system: MIND_SYSTEM_PROMPT,
    context: lines.join('\n'),
    task: `[상황]\n${req.situation.trim()}\n\n[이번 요청]\n- 이 상황에서 ${who}의 속마음을 풀어 주세요.`,
    schema: MindReadingSchema,
    normalize: normalizeMind,
    temperature: 0.85,
    maxOutputTokens: 1536,
  };
}

const DIFFICULTY_KO = { 1: '쉬움 (호감이 있어 잘 받아 줌)', 2: '보통', 3: '어려움 (쉽게 마음을 열지 않음)' } as const;

export function buildPracticeTask(req: PracticeRequest): AiTask<z.infer<typeof PracticeReplySchema>> {
  const p = req.persona;
  const persona = [
    '[상대역 페르소나]',
    `- 이름: ${p.name} (${GENDER_KO[p.gender]}, ${p.age}세, ${p.mbti}, ${p.job})`,
    p.style.length ? `- 성격·스타일: ${p.style.join(', ')}` : '',
    `- 사용자와의 관계: ${RELATIONSHIP_KO[p.relationship]}`,
    `- 상황: ${p.scenario}`,
    `- [상대역 말투] ${p.speech === 'polite' ? '존댓말' : '반말'}`,
    `- 난이도: ${DIFFICULTY_KO[Math.round(p.difficulty) as 1 | 2 | 3] ?? '보통'}`,
  ]
    .filter(Boolean)
    .join('\n');
  const user = buildProfileBlock({
    crush: { name: p.name, gender: p.gender, age: p.age, mbti: p.mbti, relationship: p.relationship, style: p.style, notes: '' },
    user: req.user,
  })
    .split('\n')
    .filter((l, i, all) => i >= all.indexOf('[사용자(나) 프로필]'))
    .join('\n');
  const convo = ['[지금까지 대화 (오래된 순)]', ...req.turns.slice(-PRACTICE_PROMPT_TURNS).map((t) => `${t.role === 'me' ? '나' : p.name}: ${t.text.replace(/\s+/g, ' ').trim()}`)].join('\n');
  return {
    mode: 'practice',
    system: PRACTICE_SYSTEM_PROMPT,
    context: [persona, user].join('\n\n'),
    task: `${convo}\n\n[지금 연습 온도] ${Math.round(req.heat)}°\n[이번 요청]\n- 마지막 "나"의 메시지에 ${p.name}(으)로서 답하고, 그 메시지를 평가해 주세요.`,
    schema: PracticeReplySchema,
    normalize: normalizePractice,
    temperature: 0.9,
    maxOutputTokens: 1024,
  };
}

export function buildCoachTask(req: z.infer<typeof CoachRequestSchema>): AiTask<z.infer<typeof CoachAnalysisSchema>> {
  return {
    mode: 'coach',
    system: COACH_SYSTEM_PROMPT,
    context: buildContextText(req),
    image: req.image,
    task: buildTaskBlock(req),
    schema: CoachAnalysisSchema,
    normalize: normalizeAnalysis,
    temperature: 0.8,
    // 실제 출력은 700~1,000토큰. 상한을 두어 폭주 비용 방지
    maxOutputTokens: 2560,
  };
}

/** 검증을 통과한 요청으로 작업을 만든다 */
export function buildTask(parsed: Extract<ReturnType<typeof parseAiRequest>, { ok: true }>): AiTask {
  switch (parsed.mode) {
    case 'report':
      return buildReportTask(parsed.req) as AiTask;
    case 'mind':
      return buildMindTask(parsed.req) as AiTask;
    case 'practice':
      return buildPracticeTask(parsed.req) as AiTask;
    default:
      return buildCoachTask(parsed.req) as AiTask;
  }
}
