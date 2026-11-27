/**
 * 영어판(lang: 'en') 코칭 결과 확인 — 운영 서버와 같은 작업(buildTask)을 Gemini 로 직접 보낸다.
 *   GEMINI_API_KEY=AIza... npx tsx scripts/try-en.ts
 * 영어 대화 · 스페인어 대화(답장은 스페인어여야 함) · 상황 설명만 세 가지를 보낸다.
 */
import { buildTask, parseAiRequest } from '../src/lib/ai-tasks';
import { callGeminiTask } from '../src/lib/gemini';

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('GEMINI_API_KEY 환경변수가 필요해요.');
  process.exit(1);
}

const base = {
  crush: { name: 'Emma', gender: 'female', relationship: 'talking', style: [], notes: '', heat: 20 },
  user: { name: '', gender: 'male', style: [] },
  tone: 'natural',
  emoji: 'auto',
  history: [],
  today: '11/27(Fri)',
  lang: 'en',
};
const cases: [string, Record<string, unknown>][] = [
  ['영어 대화', { ...base, text: "Me: hey are you free this friday? there's this new rooftop bar i've been wanting to try\nEmma: haha maybe 👀\nEmma: depends who's asking" }],
  ['스페인어 대화', { ...base, crush: { ...base.crush, name: 'Lucía' }, text: 'Yo: oye, ¿te apetece ir al cine el sábado?\nLucía: jajaja puede ser 😏\nLucía: ¿qué peli?' }],
  ['상황 설명만', { ...base, text: 'She left me on read for 5 hours after I said I had a great time on our date. Should I text her again?' }],
];

async function main() {
  for (const [label, body] of cases) {
    const parsed = parseAiRequest(body);
    if (!parsed.ok) throw new Error(`${label}: 요청 형식 오류 ${JSON.stringify(parsed.issues)}`);
    const t = Date.now();
    const r = await callGeminiTask(buildTask(parsed), key!, {});
    console.log(`\n=== ${label} · ${((Date.now() - t) / 1000).toFixed(1)}초 · ${r.ok ? r.model : '실패'}`);
    if (!r.ok) {
      console.log(r.code, r.message);
      continue;
    }
    const a = JSON.parse(r.text);
    console.log('summary:', a.summary);
    console.log('insights:', (a.insights ?? []).join(' | '));
    for (const x of a.replies ?? []) console.log(`- [${x.tone} ${x.successRate}%] ${x.text}  (why: ${x.why} / they: ${x.expectedReaction})`);
    console.log('next:', a.nextStep, '| temp:', a.temperature, a.interestScore, '| callName:', a.callName, '| speech:', a.speechLevel);
    console.log('memory:', (a.memory ?? []).join(' | '));
    console.log('한글 섞임:', /[가-힣]/.test(r.text));
  }
}
main();
