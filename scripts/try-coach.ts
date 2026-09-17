/**
 * 실제 API 키로 코칭 결과를 확인하는 스크립트.
 *   GEMINI_API_KEY=AIza... npx tsx scripts/try-coach.ts [캡처이미지경로] ["상황 설명"]
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/try-coach.ts [캡처이미지경로] ["상황 설명"]
 */
import fs from 'node:fs';
import path from 'node:path';

import { CoachAnalysisSchema, CoachRequestSchema, normalizeAnalysis, type CoachRequestInput } from '../src/lib/coach-schema';
import { callGemini } from '../src/lib/gemini';

async function main() {
  const [, , imagePath, note] = process.argv;
  const gemini = process.env.GEMINI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (!gemini && !anthropic) {
    console.error('GEMINI_API_KEY 또는 ANTHROPIC_API_KEY 환경변수가 필요해요.');
    process.exit(1);
  }

  const input: CoachRequestInput = {
    crush: { name: '민지', gender: 'female', age: 26, mbti: 'ENFP', relationship: 'talking', style: ['리액션 부자', '답장 느림'], notes: '헬스장에서 알게 됨. 2주 전부터 카톡 중' },
    user: { name: '지훈', gender: 'male', age: 28, mbti: 'ISTJ', style: ['낯가림', '진지함'] },
    tone: 'flirty',
    text: note ?? (imagePath ? undefined : '주말에 만나자고 하고 싶은데 부담스럽지 않게 어떻게 말할까?'),
    history: [],
  };
  if (imagePath) {
    const ext = path.extname(imagePath).toLowerCase();
    const mediaType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    input.image = { base64: fs.readFileSync(imagePath).toString('base64'), mediaType };
  }
  const req = CoachRequestSchema.parse(input);
  const started = Date.now();

  if (gemini) {
    const result = await callGemini(req, gemini, { model: process.env.GEMINI_MODEL });
    if (!result.ok) {
      console.error('실패:', result.status, result.code, result.message);
      process.exit(1);
    }
    const parsed = CoachAnalysisSchema.safeParse(JSON.parse(result.text));
    if (!parsed.success) {
      console.error('스키마 불일치:', parsed.error.issues, '\n원문:', result.text);
      process.exit(1);
    }
    print(`gemini · ${result.model}`, normalizeAnalysis(parsed.data), Date.now() - started, result.usage);
    return;
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
  const { COACH_MODEL, COACH_SYSTEM_PROMPT, buildMessageContent } = await import('../src/lib/coach-schema');
  const client = new Anthropic({ apiKey: anthropic });
  const response = await client.messages.parse({
    model: COACH_MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildMessageContent(req) }],
    output_config: { effort: 'medium', format: zodOutputFormat(CoachAnalysisSchema) },
  });
  if (!response.parsed_output) {
    console.error('파싱 실패. stop_reason =', response.stop_reason);
    process.exit(1);
  }
  print('anthropic', normalizeAnalysis(response.parsed_output), Date.now() - started, { input: response.usage.input_tokens, output: response.usage.output_tokens });
}

function print(provider: string, a: ReturnType<typeof normalizeAnalysis>, ms: number, usage?: { input?: number; output?: number }) {
  console.log(`\n[${provider}] ${ms}ms · 토큰 in=${usage?.input ?? '?'} out=${usage?.output ?? '?'}\n`);
  console.log('요약:', a.summary);
  console.log(`온도: ${a.temperature} (${a.interestScore ?? '-'}°)`);
  console.log('포인트:');
  a.insights.forEach((s) => console.log('  •', s));
  console.log('추천 답장:');
  a.replies.forEach((r, i) => console.log(`  ${i + 1}. [${r.tone}] ${r.text}\n     └ ${r.why}`));
  console.log('다음 스텝:', a.nextStep);
  if (a.warnings.length) console.log('주의:', a.warnings.join(' / '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
