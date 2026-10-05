/**
 * 실제 Gemini 키로 네 가지 AI 모드(코칭·보고서·속마음·연습)를 한 번씩 불러 결과를 확인하는 스크립트.
 *   GEMINI_API_KEY=AIza... npx tsx scripts/try-modes.ts [캡처이미지경로]
 * 캡처를 주면 호칭·말투 인식(예: 「언니」·존댓말)이 답장에 그대로 이어지는지 본다.
 */
import fs from 'node:fs';
import path from 'node:path';

import { buildTask, parseAiRequest } from '../src/lib/ai-tasks';
import { callGeminiTask } from '../src/lib/gemini';

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('GEMINI_API_KEY 환경변수가 필요해요.');
  process.exit(1);
}

const imagePath = process.argv[2];
const image = imagePath
  ? { base64: fs.readFileSync(imagePath).toString('base64'), mediaType: path.extname(imagePath).toLowerCase() === '.png' ? ('image/png' as const) : ('image/jpeg' as const) }
  : undefined;

const user = { name: '지수', gender: 'female' as const, age: 25, mbti: 'INFP', style: ['리액션 좋음'], vibes: ['다정한', '센스 있는'], goal: '썸 끝내고 확실하게' };

const cases: { label: string; body: Record<string, unknown> }[] = [
  {
    label: '코칭 (캡처 · 호칭/말투 자동 인식 · 이모지 넣기)',
    body: { crush: { name: '수연', gender: 'female', relationship: 'crush', style: [], notes: '', heat: 12 }, user, tone: 'natural', emoji: 'on', image, history: [] },
  },
  {
    label: '코칭 (글만 · 호칭 「오빠」 직접 정함 · 반말 · 이모지 빼기)',
    body: {
      crush: { name: '준호', gender: 'male', age: 29, mbti: 'ENTP', relationship: 'talking', style: ['장난기 많음'], notes: '', callName: '오빠', callNameFixed: true, speech: 'casual', speechFixed: true, heat: 35 },
      user,
      tone: 'flirty',
      emoji: 'off',
      text: '오빠가 "이번 주 너무 바빠ㅠ" 라고 보냈어. 서운한데 티 안 내고 답하고 싶어',
      history: [],
    },
  },
  {
    label: '상대 분석 보고서',
    body: {
      mode: 'report',
      crush: { name: '준호', gender: 'male', age: 29, mbti: 'ENTP', relationship: 'talking', style: ['장난기 많음'], notes: '', callName: '오빠', heat: 41, goal: '썸 → 연애' },
      user,
      sessions: [
        { at: Date.now() - 6 * 864e5, summary: '먼저 연락이 와서 대화가 길게 이어졌어요.', insights: ['질문으로 대화를 이어 감', '이모지 많이 씀'], temperature: 'warm' },
        { at: Date.now() - 2 * 864e5, summary: '주말 약속 제안에 바로 좋다고 했어요.', insights: ['약속 수락이 빠름'], temperature: 'hot', chosenReply: '토요일에 그 파스타집 갈래?' },
      ],
      heatLog: [
        { at: Date.now() - 6 * 864e5, value: 14, delta: 14 },
        { at: Date.now() - 2 * 864e5, value: 41, delta: 27 },
      ],
    },
  },
  {
    label: '속마음 풀이',
    body: { mode: 'mind', situation: '남자가 "뭐해?"라고만 보내고 2시간째 답이 없어요.', perspective: 'male', user: { gender: 'female', age: 25 } },
  },
  {
    label: '연애 연습',
    body: {
      mode: 'practice',
      persona: { name: '민지', gender: 'female', age: 28, mbti: 'ENFP', job: '마케터', style: ['리액션 부자', '맛집 탐방'], relationship: 'blind_date', scenario: '어제 소개팅에서 만났어요. 분위기는 좋았는데 애프터는 아직이에요.', speech: 'polite', difficulty: 2 },
      user: { name: '지훈', gender: 'male', age: 29, style: [] },
      heat: 0,
      turns: [
        { role: 'them', text: '어제 잘 들어가셨어요? ㅎㅎ' },
        { role: 'me', text: '네 덕분에 잘 들어갔어요! 민지님 말씀하신 파스타집 저장해 뒀는데 이번 주 토요일에 같이 가실래요?' },
      ],
    },
  },
];

async function main() {
  for (const c of cases) {
    const parsed = parseAiRequest(c.body);
    if (!parsed.ok) {
      console.log(`\n✗ ${c.label}: 요청 형식 오류`, parsed.issues);
      continue;
    }
    const task = buildTask(parsed);
    const started = Date.now();
    const result = await callGeminiTask(task, key!, { model: process.env.GEMINI_MODEL });
    if (!result.ok) {
      console.log(`\n✗ ${c.label}: ${result.status} ${result.code} ${result.message}`);
      continue;
    }
    const checked = task.schema.safeParse(JSON.parse(result.text));
    if (!checked.success) {
      console.log(`\n✗ ${c.label}: 스키마 불일치`, checked.error.issues.slice(0, 3), result.text.slice(0, 400));
      continue;
    }
    console.log(`\n✓ ${c.label} · ${result.model} · ${Date.now() - started}ms · 토큰 ${result.usage?.input}/${result.usage?.output}`);
    console.log(JSON.stringify(task.normalize(checked.data), null, 1));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
