import { DEFAULT_FLEX_WAIT_MS, resolveAiFlags } from '../../api/_ai-flags';
import { buildCoachTask, type AiMode, type AiTask } from '@/lib/ai-tasks';
import { CoachRequestSchema } from '@/lib/coach-schema';
import { callGeminiTask, GEMINI_FALLBACK_MODELS } from '@/lib/gemini';

const MODES: AiMode[] = ['coach', 'report', 'mind', 'practice'];

describe('서버 비용 스위치 읽기', () => {
  it('하나도 없으면 기본값 (gemini-3.5-flash · 생각 low · temperature 보냄 · 대체 모델 그대로 · 코칭 말고는 Flex 먼저), 경고도 없다', () => {
    for (const mode of MODES) {
      expect(resolveAiFlags(mode, {})).toEqual({
        flags: {
          model: 'gemini-3.5-flash',
          thinkingLevel: 'low',
          omitTemperature: false,
          fallbackModels: GEMINI_FALLBACK_MODELS,
          ...(mode === 'coach' ? {} : { flexFirstMs: DEFAULT_FLEX_WAIT_MS }),
        },
        warnings: [],
      });
    }
    // 빈 값·공백도 「없음」과 같다
    expect(resolveAiFlags('mind', { GEMINI_MODEL: ' ', GEMINI_MODEL_LIGHT: '', GEMINI_THINKING_MIND: '', GEMINI_OMIT_TEMPERATURE: '' }).warnings).toEqual([]);
  });

  it('GEMINI_MODEL 은 코칭·보고서, 속마음·연습은 GEMINI_MODEL_LIGHT (없으면 GEMINI_MODEL)', () => {
    const env = { GEMINI_MODEL: 'gemini-3.6-flash' };
    expect(MODES.map((m) => resolveAiFlags(m, env).flags.model)).toEqual(['gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.6-flash']);
    const light = { ...env, GEMINI_MODEL_LIGHT: 'gemini-3.5-flash-lite' };
    expect(MODES.map((m) => resolveAiFlags(m, light).flags.model)).toEqual(['gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-lite']);
  });

  it('생각 수준은 모드마다 따로 (대소문자·공백 무시)', () => {
    const env = { GEMINI_THINKING_COACH: 'Medium ', GEMINI_THINKING_REPORT: 'high', GEMINI_THINKING_MIND: 'minimal', GEMINI_THINKING_PRACTICE: 'low' };
    expect(MODES.map((m) => resolveAiFlags(m, env).flags.thinkingLevel)).toEqual(['medium', 'high', 'minimal', 'low']);
  });

  it('GEMINI_OMIT_TEMPERATURE 는 1/true 면 켜고 0/false 면 끈다', () => {
    expect(resolveAiFlags('coach', { GEMINI_OMIT_TEMPERATURE: '1' }).flags.omitTemperature).toBe(true);
    expect(resolveAiFlags('coach', { GEMINI_OMIT_TEMPERATURE: 'TRUE' }).flags.omitTemperature).toBe(true);
    expect(resolveAiFlags('coach', { GEMINI_OMIT_TEMPERATURE: '0' })).toEqual(expect.objectContaining({ flags: expect.objectContaining({ omitTemperature: false }), warnings: [] }));
    expect(resolveAiFlags('coach', { GEMINI_OMIT_TEMPERATURE: 'false' }).flags.omitTemperature).toBe(false);
  });

  it('잘못된 값은 무시하고 기본값을 쓰며, 무엇을 무시했는지 경고한다', () => {
    const { flags, warnings } = resolveAiFlags('mind', {
      GEMINI_MODEL: 'models/gemini-3.5-flash',
      GEMINI_MODEL_LIGHT: 'gpt-5',
      GEMINI_THINKING_MIND: 'none',
      GEMINI_OMIT_TEMPERATURE: 'yes please',
    });
    expect(flags).toEqual({ model: 'gemini-3.5-flash', thinkingLevel: 'low', omitTemperature: false, fallbackModels: GEMINI_FALLBACK_MODELS, flexFirstMs: DEFAULT_FLEX_WAIT_MS });
    expect(warnings).toHaveLength(4);
    expect(warnings.join('\n')).toEqual(expect.stringContaining('GEMINI_MODEL_LIGHT'));
    expect(warnings.join('\n')).toEqual(expect.stringContaining('GEMINI_THINKING_MIND'));
    // 경로 조작 같은 값은 모델 이름으로 쓰지 않는다
    expect(resolveAiFlags('coach', { GEMINI_MODEL: 'gemini-3.5-flash/../../x' }).flags.model).toBe('gemini-3.5-flash');
  });

  it('경고에는 이름과 길이만 — 값은 남기지 않는다 (키를 잘못 넣었으면 키가 로그에 남으니까)', () => {
    // 키처럼 생긴 가짜 값 (진짜 키 형식은 아님)
    const keyLike = 'AIza_FAKE_KEY_FOR_TEST_ONLY';
    const { warnings } = resolveAiFlags('mind', { GEMINI_MODEL: keyLike, GEMINI_MODEL_LIGHT: keyLike, GEMINI_THINKING_MIND: keyLike, GEMINI_OMIT_TEMPERATURE: keyLike });
    expect(warnings).toHaveLength(4);
    const text = warnings.join('\n').toLowerCase();
    expect(text).not.toContain('aiza');
    expect(text).not.toContain('fake_key');
    expect(warnings[0]).toContain(`GEMINI_MODEL 무시 (${keyLike.length}자)`);
  });

  it('GEMINI_MODEL_LIGHT 가 잘못되면 (기본값이 아니라) 쓰고 있는 GEMINI_MODEL 로', () => {
    expect(resolveAiFlags('practice', { GEMINI_MODEL: 'gemini-3.6-flash', GEMINI_MODEL_LIGHT: 'lite!' }).flags.model).toBe('gemini-3.6-flash');
  });
});

describe('스위치에 맞춘 대체 모델', () => {
  const task = buildCoachTask(
    CoachRequestSchema.parse({ crush: { name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '' }, user: { name: '지훈', gender: 'male', style: [] }, tone: 'natural', text: '안녕' }),
  ) as AiTask;
  /** 부른 모델을 순서대로 남기고, busy 모델은 늘 혼잡(503) */
  function fakeFetch(busy: string) {
    const models: string[] = [];
    const fetchImpl = jest.fn(async (url: string) => {
      const model = decodeURIComponent(/\/models\/([^:]+):generateContent/.exec(url)?.[1] ?? '');
      models.push(model);
      const body = model === busy ? { error: { message: 'busy' } } : { candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }] };
      return new Response(JSON.stringify(body), { status: model === busy ? 503 : 200 });
    }) as unknown as typeof fetch;
    return { fetchImpl, models };
  }
  // 대체 모델 순서만 보려고 Flex 먼저는 끈다 (Flex 는 아래 「Flex 먼저 스위치」와 gemini.test.ts 에서 따로 본다)
  const ENV = { GEMINI_MODEL: 'gemini-3.6-flash', GEMINI_MODEL_LIGHT: 'gemini-3.5-flash-lite', GEMINI_FLEX_MODES: 'none' };

  it('속마음·연습이 가벼운 모델이면, 혼잡할 때 가장 비싼 기본 모델이 아니라 운영자가 고른 GEMINI_MODEL 로 넘어간다', async () => {
    const { fetchImpl, models } = fakeFetch('gemini-3.5-flash-lite');
    const result = await callGeminiTask(task, 'k', { ...resolveAiFlags('mind', ENV).flags, fetchImpl, retryDelayMs: 0 });
    expect(models).toEqual(['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']);
    expect(result).toEqual(expect.objectContaining({ ok: true, model: 'gemini-3.6-flash' }));
  });

  it('코칭·보고서는 지금처럼 가벼운 모델로 넘어간다', async () => {
    const { fetchImpl, models } = fakeFetch('gemini-3.6-flash');
    await callGeminiTask(task, 'k', { ...resolveAiFlags('coach', ENV).flags, fetchImpl, retryDelayMs: 0 });
    expect(models).toEqual(['gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']);
  });

  it('GEMINI_MODEL 도 가벼운 모델이면 예전처럼 gemini-3.5-flash 로', async () => {
    const { fetchImpl, models } = fakeFetch('gemini-3.5-flash-lite');
    await callGeminiTask(task, 'k', { ...resolveAiFlags('mind', { GEMINI_MODEL: 'gemini-3.5-flash-lite', GEMINI_FLEX_MODES: 'none' }).flags, fetchImpl, retryDelayMs: 0 });
    expect(models).toEqual(['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash']);
  });
});

describe('Flex 먼저 스위치 (GEMINI_FLEX_MODES · GEMINI_FLEX_WAIT_MS)', () => {
  const flexOf = (mode: AiMode, env: Record<string, string>) => resolveAiFlags(mode, env).flags.flexFirstMs;

  it('기본은 보고서·속마음·연습만 Flex 먼저 (긴 코칭은 실측에서 대부분 밀려나 뺐다), 기다릴 시간은 8초', () => {
    expect(DEFAULT_FLEX_WAIT_MS).toBe(8000);
    expect(MODES.map((m) => flexOf(m, {}))).toEqual([undefined, 8000, 8000, 8000]);
  });

  it('고른 모드만 Flex 를 먼저 부른다', () => {
    const env = { GEMINI_FLEX_MODES: 'coach, practice' };
    expect(MODES.map((m) => flexOf(m, env))).toEqual([8000, undefined, undefined, 8000]);
    expect(MODES.map((m) => flexOf(m, { GEMINI_FLEX_MODES: 'ALL' }))).toEqual([8000, 8000, 8000, 8000]);
  });

  it('none·off·0 이면 모두 끈다 (문제가 생겼을 때 바로 끄는 스위치)', () => {
    for (const v of ['none', 'off', '0']) expect(MODES.map((m) => flexOf(m, { GEMINI_FLEX_MODES: v }))).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('기다릴 시간은 2~30초 사이 정수만 받고, 잘못된 값은 경고 후 기본값', () => {
    expect(flexOf('coach', { GEMINI_FLEX_MODES: 'coach', GEMINI_FLEX_WAIT_MS: '8000' })).toBe(8000);
    for (const bad of ['500', '60000', '8.5', 'abc']) {
      const { flags, warnings } = resolveAiFlags('coach', { GEMINI_FLEX_MODES: 'coach', GEMINI_FLEX_WAIT_MS: bad });
      expect(flags.flexFirstMs).toBe(DEFAULT_FLEX_WAIT_MS);
      expect(warnings).toEqual([expect.stringContaining('GEMINI_FLEX_WAIT_MS 무시')]);
    }
  });

  it('모르는 모드 이름이 섞이면 통째로 무시하고 기본값 (오타로 엉뚱한 모드가 켜지지 않게)', () => {
    const { flags, warnings } = resolveAiFlags('mind', { GEMINI_FLEX_MODES: 'coach,chat' });
    expect(flags.flexFirstMs).toBe(DEFAULT_FLEX_WAIT_MS);
    expect(warnings).toEqual([expect.stringContaining('GEMINI_FLEX_MODES 무시')]);
  });
});
