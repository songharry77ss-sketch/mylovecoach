/**
 * 서버 전용 AI 비용 스위치 (Vercel 환경변수). 모두 비워 두면 지금 동작 그대로다.
 *   GEMINI_MODEL                코칭·보고서 모델 (기본 gemini-3.5-flash)
 *   GEMINI_MODEL_LIGHT          속마음·연습 모델 (기본: GEMINI_MODEL 과 같음)
 *   GEMINI_THINKING_COACH · GEMINI_THINKING_REPORT · GEMINI_THINKING_MIND · GEMINI_THINKING_PRACTICE
 *                               모드별 생각 수준 minimal | low | medium | high (기본 low). 3.7·3.8 Flash 는 minimal 이 없다
 *   GEMINI_OMIT_TEMPERATURE=1   temperature 를 보내지 않고 모델 기본값을 쓴다 (기본: 모드마다 정한 값을 보냄)
 * 잘못된 값은 무시하고 기본값을 쓰며, 인스턴스마다 한 번 경고를 남긴다.
 * 답이 달라질 수 있는 스위치라 scripts/ab-models.ts 로 품질·비용을 비교한 뒤에 켤 것 (docs/RELEASE_GUIDE.md)
 */
import type { AiMode } from '../src/lib/ai-tasks';
import { GEMINI_DEFAULT_MODEL, GEMINI_DEFAULT_THINKING, GEMINI_THINKING_LEVELS, type GeminiThinkingLevel } from '../src/lib/gemini';

export interface AiModeFlags {
  model: string;
  thinkingLevel: GeminiThinkingLevel;
  omitTemperature: boolean;
}

type Env = Record<string, string | undefined>;

/** 모델 이름 모양 — URL 경로에 들어가므로 gemini- 로 시작하는 소문자·숫자·점·하이픈만 */
const MODEL_NAME = /^gemini-[a-z0-9.-]{1,60}$/;

const THINKING_ENV: Record<AiMode, string> = {
  coach: 'GEMINI_THINKING_COACH',
  report: 'GEMINI_THINKING_REPORT',
  mind: 'GEMINI_THINKING_MIND',
  practice: 'GEMINI_THINKING_PRACTICE',
};

/** 가벼운 모델을 쓰는 모드 (속마음·연습) */
const LIGHT_MODES: readonly AiMode[] = ['mind', 'practice'];

const shown = (v: string) => JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}…` : v);

/** 모드에 맞는 스위치 값과, 무시한 값에 대한 경고 */
export function resolveAiFlags(mode: AiMode, env: Env = process.env): { flags: AiModeFlags; warnings: string[] } {
  const warnings: string[] = [];
  const pickModel = (name: string, fallback: string) => {
    const value = env[name]?.trim();
    if (!value) return fallback;
    if (MODEL_NAME.test(value)) return value;
    warnings.push(`${name}=${shown(value)} 무시 — 모델 이름 형식이 아님. 기본값(${fallback})으로 씁니다`);
    return fallback;
  };
  const main = pickModel('GEMINI_MODEL', GEMINI_DEFAULT_MODEL);
  const model = LIGHT_MODES.includes(mode) ? pickModel('GEMINI_MODEL_LIGHT', main) : main;

  const thinkingName = THINKING_ENV[mode];
  const thinkingValue = env[thinkingName]?.trim().toLowerCase();
  let thinkingLevel: GeminiThinkingLevel = GEMINI_DEFAULT_THINKING;
  if (thinkingValue) {
    if ((GEMINI_THINKING_LEVELS as readonly string[]).includes(thinkingValue)) thinkingLevel = thinkingValue as GeminiThinkingLevel;
    else warnings.push(`${thinkingName}=${shown(thinkingValue)} 무시 — ${GEMINI_THINKING_LEVELS.join('|')} 중 하나여야 함. 기본값(${GEMINI_DEFAULT_THINKING})으로 씁니다`);
  }

  const omitValue = env.GEMINI_OMIT_TEMPERATURE?.trim().toLowerCase();
  let omitTemperature = false;
  if (omitValue) {
    if (omitValue === '1' || omitValue === 'true') omitTemperature = true;
    else if (omitValue !== '0' && omitValue !== 'false') warnings.push(`GEMINI_OMIT_TEMPERATURE=${shown(omitValue)} 무시 — 1 또는 0 이어야 함. temperature 를 그대로 보냅니다`);
  }

  return { flags: { model, thinkingLevel, omitTemperature }, warnings };
}

const warned = new Set<string>();

/** 서버가 요청마다 부른다. 같은 경고는 인스턴스마다 한 번만 남긴다 */
export function aiFlagsFor(mode: AiMode, env: Env = process.env): AiModeFlags {
  const { flags, warnings } = resolveAiFlags(mode, env);
  for (const w of warnings) {
    if (warned.has(w)) continue;
    warned.add(w);
    console.warn(`[ai-flags] ${w}`);
  }
  return flags;
}
