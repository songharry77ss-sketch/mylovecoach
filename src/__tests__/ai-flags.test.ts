import { resolveAiFlags } from '../../api/_ai-flags';
import type { AiMode } from '@/lib/ai-tasks';

const MODES: AiMode[] = ['coach', 'report', 'mind', 'practice'];

describe('서버 비용 스위치 읽기', () => {
  it('하나도 없으면 지금 동작 그대로 (gemini-3.5-flash · 생각 low · temperature 보냄), 경고도 없다', () => {
    for (const mode of MODES) {
      expect(resolveAiFlags(mode, {})).toEqual({ flags: { model: 'gemini-3.5-flash', thinkingLevel: 'low', omitTemperature: false }, warnings: [] });
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
    expect(flags).toEqual({ model: 'gemini-3.5-flash', thinkingLevel: 'low', omitTemperature: false });
    expect(warnings).toHaveLength(4);
    expect(warnings.join('\n')).toEqual(expect.stringContaining('GEMINI_MODEL_LIGHT'));
    expect(warnings.join('\n')).toEqual(expect.stringContaining('GEMINI_THINKING_MIND'));
    // 경로 조작 같은 값은 모델 이름으로 쓰지 않는다
    expect(resolveAiFlags('coach', { GEMINI_MODEL: 'gemini-3.5-flash/../../x' }).flags.model).toBe('gemini-3.5-flash');
  });

  it('GEMINI_MODEL_LIGHT 가 잘못되면 (기본값이 아니라) 쓰고 있는 GEMINI_MODEL 로', () => {
    expect(resolveAiFlags('practice', { GEMINI_MODEL: 'gemini-3.6-flash', GEMINI_MODEL_LIGHT: 'lite!' }).flags.model).toBe('gemini-3.6-flash');
  });
});
