/**
 * 서버 전용 AI 비용 스위치 (Vercel 환경변수). 모두 비워 두면 지금 동작 그대로다.
 *   GEMINI_MODEL                코칭·보고서 모델 (기본 gemini-3.5-flash)
 *   GEMINI_MODEL_LIGHT          속마음·연습 모델 (기본: GEMINI_MODEL 과 같음)
 *   GEMINI_THINKING_COACH · GEMINI_THINKING_REPORT · GEMINI_THINKING_MIND · GEMINI_THINKING_PRACTICE
 *                               모드별 생각 수준 minimal | low | medium | high (기본 low). 3.7·3.8 Flash 는 minimal 이 없다
 *   GEMINI_OMIT_TEMPERATURE=1   temperature 를 보내지 않고 모델 기본값을 쓴다 (기본: 모드마다 정한 값을 보냄)
 *   GEMINI_FLEX_MODES           Flex(같은 모델 반값)를 먼저 부를 모드 — coach,report,mind,practice 중 쉼표로, 또는 all · none
 *                               (기본: DEFAULT_FLEX_MODES). 문제가 생기면 none 으로 바로 끈다
 *   GEMINI_FLEX_WAIT_MS         Flex 를 기다리는 최대 시간(ms, 2000~30000, 기본 DEFAULT_FLEX_WAIT_MS). 넘으면 일반 등급으로 다시 부른다
 * 잘못된 값은 무시하고 기본값을 쓰며, 인스턴스마다 한 번 경고를 남긴다 (값은 남기지 않는다 — 키를 잘못 넣었을 수 있어서).
 * 답이 달라질 수 있는 스위치라 scripts/ab-models.ts 로 품질·비용을 비교한 뒤에 켤 것 (docs/RELEASE_GUIDE.md)
 */
import type { AiMode } from '../src/lib/ai-tasks';
import { GEMINI_DEFAULT_MODEL, GEMINI_DEFAULT_THINKING, GEMINI_FALLBACK_MODELS, GEMINI_THINKING_LEVELS, type GeminiThinkingLevel } from '../src/lib/gemini';

export interface AiModeFlags {
  model: string;
  thinkingLevel: GeminiThinkingLevel;
  omitTemperature: boolean;
  /**
   * 과부하·한도일 때 넘어갈 모델 후보 (앞에서부터 model 과 다른 첫 번째 하나). 가벼운 모델 → GEMINI_MODEL → 기본 모델 순이라,
   * 속마음·연습이 이미 가벼운 모델이면 운영자가 고른 GEMINI_MODEL 로 넘어간다. 스위치가 없으면 지금과 같다
   */
  fallbackModels: string[];
  /** Flex 먼저 부르고 기다릴 시간(ms). 이 모드가 Flex 대상이 아니면 비움 — src/lib/gemini.ts 의 CallGeminiOptions.flexFirstMs */
  flexFirstMs?: number;
}

const ALL_MODES: readonly AiMode[] = ['coach', 'report', 'mind', 'practice'];
/** GEMINI_FLEX_MODES 가 없을 때 Flex 를 먼저 부르는 모드 (근거: docs/LAUNCH_CHECKLIST.md 「AI 비용」의 Flex 실측) */
export const DEFAULT_FLEX_MODES: readonly AiMode[] = [];
/** Flex 를 기다리는 기본 시간 — 이보다 늦으면 일반 등급으로 다시 부른다 */
export const DEFAULT_FLEX_WAIT_MS = 12_000;

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

/** 무시한 값은 길이만 적는다 — 이름을 헷갈려 API 키를 넣었으면 키가 그대로 로그에 남으니까 */
const ignored = (name: string, value: string) => `${name} 무시 (${value.length}자)`;

/** 모드에 맞는 스위치 값과, 무시한 값에 대한 경고 */
export function resolveAiFlags(mode: AiMode, env: Env = process.env): { flags: AiModeFlags; warnings: string[] } {
  const warnings: string[] = [];
  const pickModel = (name: string, fallback: string) => {
    const value = env[name]?.trim();
    if (!value) return fallback;
    if (MODEL_NAME.test(value)) return value;
    warnings.push(`${ignored(name, value)} — 모델 이름 형식이 아님. 기본값(${fallback})으로 씁니다`);
    return fallback;
  };
  const main = pickModel('GEMINI_MODEL', GEMINI_DEFAULT_MODEL);
  const model = LIGHT_MODES.includes(mode) ? pickModel('GEMINI_MODEL_LIGHT', main) : main;

  const thinkingName = THINKING_ENV[mode];
  const thinkingValue = env[thinkingName]?.trim().toLowerCase();
  let thinkingLevel: GeminiThinkingLevel = GEMINI_DEFAULT_THINKING;
  if (thinkingValue) {
    if ((GEMINI_THINKING_LEVELS as readonly string[]).includes(thinkingValue)) thinkingLevel = thinkingValue as GeminiThinkingLevel;
    else warnings.push(`${ignored(thinkingName, thinkingValue)} — ${GEMINI_THINKING_LEVELS.join('|')} 중 하나여야 함. 기본값(${GEMINI_DEFAULT_THINKING})으로 씁니다`);
  }

  const omitValue = env.GEMINI_OMIT_TEMPERATURE?.trim().toLowerCase();
  let omitTemperature = false;
  if (omitValue) {
    if (omitValue === '1' || omitValue === 'true') omitTemperature = true;
    else if (omitValue !== '0' && omitValue !== 'false') warnings.push(`${ignored('GEMINI_OMIT_TEMPERATURE', omitValue)} — 1 또는 0 이어야 함. temperature 를 그대로 보냅니다`);
  }

  const fallbackModels = [...new Set([GEMINI_FALLBACK_MODELS[0], main, GEMINI_DEFAULT_MODEL])];

  const flexValue = env.GEMINI_FLEX_MODES?.trim().toLowerCase();
  let flexModes: readonly AiMode[] = DEFAULT_FLEX_MODES;
  if (flexValue) {
    if (flexValue === 'none' || flexValue === 'off' || flexValue === '0') flexModes = [];
    else if (flexValue === 'all') flexModes = ALL_MODES;
    else {
      const list = flexValue.split(',').map((m) => m.trim()).filter(Boolean);
      if (list.every((m) => (ALL_MODES as readonly string[]).includes(m))) flexModes = list as AiMode[];
      else warnings.push(`${ignored('GEMINI_FLEX_MODES', flexValue)} — coach,report,mind,practice 중 쉼표로, 또는 all·none. 기본값으로 씁니다`);
    }
  }
  const waitValue = env.GEMINI_FLEX_WAIT_MS?.trim();
  let flexWaitMs = DEFAULT_FLEX_WAIT_MS;
  if (waitValue) {
    const n = Number(waitValue);
    if (Number.isInteger(n) && n >= 2000 && n <= 30_000) flexWaitMs = n;
    else warnings.push(`${ignored('GEMINI_FLEX_WAIT_MS', waitValue)} — 2000~30000 사이 정수(ms)여야 함. 기본값(${DEFAULT_FLEX_WAIT_MS})으로 씁니다`);
  }
  const flexFirstMs = flexModes.includes(mode) ? flexWaitMs : undefined;
  return { flags: { model, thinkingLevel, omitTemperature, fallbackModels, ...(flexFirstMs ? { flexFirstMs } : {}) }, warnings };
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
