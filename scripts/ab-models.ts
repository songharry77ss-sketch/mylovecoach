/**
 * 모델 A/B 비교 — 모델 × 생각 수준 × temperature 조합마다 네 가지 AI 모드(코칭·보고서·속마음·연습)를 돌려
 * 토큰(입력·생각·출력·캐시)·걸린 시간·예상 비용을 찍고, 조합별 결과를 나란히 놓은 마크다운 보고서를 쓴다.
 *
 * ⚠️ 실제 Gemini 를 불러서 돈이 든다. 테스트(jest)·배포(vercel.yml)에서는 돌지 않고, 사람이 PC 에서 직접 실행할 때만 돈다.
 *    기본 조합(모델 3 × 생각 2 × temperature 2 × 예시 5 = 60번)이 약 $0.4~0.7. 시작하기 전에 몇 번 부를지 먼저 찍는다.
 * 예시 입력은 모두 지어낸 것이다 (실제 이용자 데이터 없음). API 키는 환경변수로만 받고 보고서에 남기지 않는다.
 *
 * 사용법
 *   GEMINI_API_KEY=AIza... npx tsx scripts/ab-models.ts
 *   GEMINI_API_KEY=AIza... npx tsx scripts/ab-models.ts --models gemini-3.5-flash,gemini-3.6-flash --thinking low,minimal --temperature on,off
 *   GEMINI_API_KEY=AIza... npx tsx scripts/ab-models.ts --modes coach,mind --repeat 2 --image ./가짜캡처.png --out ./ab.md
 *
 * 옵션
 *   --models       쉼표로 구분한 모델 (기본 gemini-3.5-flash,gemini-3.6-flash,gemini-3.5-flash-lite)
 *   --thinking     생각 수준 minimal | low | medium | high (기본 low,minimal — low 가 지금 운영값). 3.7·3.8 Flash 는 minimal 이 없다
 *   --temperature  on(지금처럼 모드별 값을 보냄) · off(서버의 GEMINI_OMIT_TEMPERATURE=1 과 같음) (기본 on,off)
 *   --modes        coach,report,mind,practice 중 고르기 (기본 전부)
 *   --repeat       같은 조합을 몇 번씩 부를지 (기본 1. 결과가 들쭉날쭉한지 보려면 2~3)
 *   --image        코칭 예시에 붙일 캡처 (jpg·png·webp). 남의 대화가 담긴 실제 캡처 말고 지어낸 캡처를 쓸 것
 *   --out          보고서 파일 경로 (기본: 임시 폴더의 mylovecoach-ab-<시각>.md)
 *
 * 비교하는 동안에는 대체 모델로 넘어가지 않는다 (과부하면 같은 모델을 한 번 더 부르고, 그래도 안 되면 실패로 적는다).
 * 비용은 아래 PRICES(2026-10 Google 가격표, 100만 토큰당 달러)로 캐시 할인 없이 계산한다. 가격이 바뀌면 고칠 것.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { CrushReport, MindReading, PracticeReply } from '../src/lib/ai-schemas';
import { buildTask, parseAiRequest, type AiMode } from '../src/lib/ai-tasks';
import type { CoachAnalysisOutput } from '../src/lib/coach-schema';
import { callGeminiTask, GEMINI_DEFAULT_MODEL, GEMINI_DEFAULT_THINKING, GEMINI_THINKING_LEVELS, type GeminiThinkingLevel, type GeminiUsage } from '../src/lib/gemini';

// ── 가격표 ──────────────────────────────────────────────────

interface Price {
  /** 입력 100만 토큰당 달러 */
  input: number;
  /** 출력 100만 토큰당 달러 (생각 토큰 포함) */
  output: number;
}

/** until 이 지나면 after 가격을 쓴다 */
const PRICES: Record<string, Price & { until?: string; after?: Price }> = {
  'gemini-3.5-flash': { input: 1.5, output: 9.0 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75, until: '2026-12-31', after: { input: 1.5, output: 7.5 } },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
};

function priceOf(model: string, today = new Date()): Price | null {
  const p = PRICES[model];
  if (!p) return null;
  return p.until && p.after && today.toISOString().slice(0, 10) > p.until ? p.after : p;
}

/** 1회 비용 (달러). 암시적 캐시 할인은 적용되지 않는 경우가 보고돼 있어 빼고 보수적으로 계산한다 */
function costOf(model: string, usage?: GeminiUsage): number | null {
  const p = priceOf(model);
  if (!p || !usage) return null;
  return ((usage.input ?? 0) * p.input + ((usage.output ?? 0) + (usage.thoughts ?? 0)) * p.output) / 1e6;
}

// ── 지어낸 예시 입력 ────────────────────────────────────────

type ImageInput = { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };

interface Case {
  id: string;
  mode: AiMode;
  label: string;
  /** 보고서에 적을 질문 요지 */
  ask: string;
  body: Record<string, unknown>;
}

const DAY = 864e5;
const ME = { name: '하늘', gender: 'female' as const, age: 26, mbti: 'ENFP', style: ['리액션 좋음', '이모티콘 애용'], vibes: ['다정한', '센스 있는'], goal: '썸 끝내고 확실하게' };

function buildCases(image?: ImageInput): Case[] {
  const now = Date.now();
  const list: Case[] = [
    {
      id: 'coach-text',
      mode: 'coach',
      label: '코칭 — 글만 (호칭 「오빠」 직접 정함 · 반말 · 이모지 빼기)',
      ask: '오빠가 "이번 주 너무 바빠ㅠ" 라고 보냈어. 서운한데 티 안 내고 답하고 싶어',
      body: {
        crush: { name: '준호', gender: 'male', age: 29, mbti: 'ENTP', relationship: 'talking', style: ['장난기 많음', '답장 빠름'], notes: '동호회에서 만남. 2주째 매일 연락', callName: '오빠', callNameFixed: true, speech: 'casual', speechFixed: true, heat: 35 },
        user: ME,
        tone: 'natural',
        emoji: 'off',
        text: '오빠가 "이번 주 너무 바빠ㅠ" 라고 보냈어. 서운한데 티 안 내고 답하고 싶어',
        history: [],
      },
    },
    {
      id: 'coach-history',
      mode: 'coach',
      label: '코칭 — 이어서 (최근 맥락 3턴 · 소개팅 · 이모지 넣기)',
      ask: '애프터로 영화 본 다음 날 "어제 즐거웠어요"만 왔어요. 다음 약속은 어떻게 잡죠?',
      body: {
        crush: { name: '도윤', gender: 'male', age: 31, mbti: 'ISTJ', relationship: 'blind_date', style: ['진지함', '답장 느림'], notes: '지인 소개. 두 번 만남', heat: 22, goal: '첫 약속 잡기' },
        user: ME,
        tone: 'flirty',
        emoji: 'on',
        text: '애프터로 영화 본 다음 날 아침에 "어제 즐거웠어요" 하고 끝이에요. 다음 약속은 어떻게 잡죠?',
        history: [
          { userNote: '소개팅 끝나고 뭐라고 보내지?', coachSummary: '오늘 즐거웠다는 말과 함께 대화에서 나온 소재를 하나 꺼내 보세요.', chosenReply: '오늘 덕분에 즐거웠어요! 말씀하신 그 파스타집 저도 가 보고 싶어요 ㅎㅎ' },
          { userNote: '(대화 캡처 업로드)', coachSummary: '답장이 느리지만 질문으로 대화를 이어 가는 걸 보면 관심이 있어요.', chosenReply: '주말에 영화 보러 가실래요? 요즘 그 스릴러 궁금했거든요' },
          { userNote: '영화 보기로 했어!', coachSummary: '약속이 잡혔으니 당일엔 편하게 즐기고, 다음 날 짧게 인사만 해도 충분해요.' },
        ],
      },
    },
  ];
  if (image) {
    list.push({
      id: 'coach-image',
      mode: 'coach',
      label: '코칭 — 캡처 (--image 로 준 파일)',
      ask: '캡처를 보고 답장 3개',
      body: { crush: { name: '서연', gender: 'female', relationship: 'crush', style: [], notes: '', heat: 12 }, user: { ...ME, gender: 'male', name: '민재' }, tone: 'natural', emoji: 'auto', image, history: [] },
    });
  }
  list.push(
    {
      id: 'report',
      mode: 'report',
      label: '상대 분석 보고서 (코칭 기록 6개)',
      ask: '기록 6개로 보고서',
      body: {
        mode: 'report',
        crush: { name: '준호', gender: 'male', age: 29, mbti: 'ENTP', relationship: 'talking', style: ['장난기 많음', '답장 빠름'], notes: '동호회에서 만남', callName: '오빠', heat: 41, goal: '썸 → 연애' },
        user: ME,
        sessions: [
          { at: now - 12 * DAY, note: '처음 연락했어', summary: '먼저 연락이 와서 대화가 길게 이어졌어요.', insights: ['질문으로 대화를 이어 감', '이모지를 많이 씀'], temperature: 'warm' },
          { at: now - 10 * DAY, note: '(대화 캡처)', summary: '밤늦게까지 통화하자고 먼저 제안했어요.', insights: ['먼저 통화를 제안함'], temperature: 'hot', chosenReply: '좋아 ㅋㅋ 11시쯤 전화할게' },
          { at: now - 8 * DAY, summary: '답장이 몇 시간씩 늦어졌지만 내용은 성실했어요.', insights: ['바쁜 시기라고 설명함'], temperature: 'neutral' },
          { at: now - 5 * DAY, note: '동호회 끝나고 둘이 밥 먹었어', summary: '둘만 따로 밥을 먹은 건 좋은 신호예요.', insights: ['계산을 먼저 함', '다음에 또 보자고 함'], temperature: 'hot' },
          { at: now - 3 * DAY, summary: '주말 약속 제안에 바로 좋다고 했어요.', insights: ['약속 수락이 빠름'], temperature: 'hot', chosenReply: '토요일에 그 파스타집 갈래?' },
          { at: now - 1 * DAY, note: '이번 주 바쁘대', summary: '바쁜 와중에도 먼저 안부를 물었어요.', insights: ['짧아도 먼저 연락함'], temperature: 'warm' },
        ],
        heatLog: [
          { at: now - 12 * DAY, value: 8, delta: 8 },
          { at: now - 10 * DAY, value: 20, delta: 12 },
          { at: now - 8 * DAY, value: 18, delta: -2 },
          { at: now - 5 * DAY, value: 31, delta: 13 },
          { at: now - 3 * DAY, value: 38, delta: 7 },
          { at: now - 1 * DAY, value: 41, delta: 3 },
        ],
      },
    },
    {
      id: 'mind',
      mode: 'mind',
      label: '속마음 풀이 (카드)',
      ask: '남자가 "뭐해?"라고만 보내고 2시간째 답이 없어요.',
      body: { mode: 'mind', situation: '남자가 "뭐해?"라고만 보내고 2시간째 답이 없어요.', perspective: 'male', user: { gender: 'female', age: 26, mbti: 'ENFP' } },
    },
    {
      id: 'practice',
      mode: 'practice',
      label: '연애 연습 (소개팅 다음 날 · 4마디째)',
      ask: '마지막 "나": 이번 주 토요일에 같이 가실래요?',
      body: {
        mode: 'practice',
        persona: { name: '서연', gender: 'female', age: 28, mbti: 'ENFP', job: '마케터', style: ['리액션 부자', '맛집 탐방'], relationship: 'blind_date', scenario: '어제 소개팅에서 만났어요. 분위기는 좋았는데 애프터는 아직이에요.', speech: 'polite', difficulty: 2 },
        user: { name: '민재', gender: 'male', age: 29, style: ['진지함'] },
        heat: 6,
        turns: [
          { role: 'them', text: '어제 잘 들어가셨어요? ㅎㅎ' },
          { role: 'me', text: '네 덕분에 잘 들어갔어요! 서연님도 잘 들어가셨죠?' },
          { role: 'them', text: '네네 ㅎㅎ 어제 말한 파스타집 생각나서 웃었어요' },
          { role: 'me', text: '저 그 집 저장해 뒀어요 ㅋㅋ 이번 주 토요일에 같이 가실래요?' },
        ],
      },
    },
  );
  return list;
}

// ── 결과 요약 (사람이 읽고 비교할 줄들) ──────────────────────

function summarize(mode: AiMode, output: unknown): string[] {
  switch (mode) {
    case 'coach': {
      const a = output as CoachAnalysisOutput;
      return [
        `요약: ${a.summary}`,
        ...a.replies.map((r, i) => `답장 ${i + 1} (${r.tone}, ${r.successRate}%): ${r.text}`),
        `다음: ${a.nextStep}`,
        `온도 ${a.temperature} ${a.heatDelta >= 0 ? '+' : ''}${a.heatDelta}° · 호칭 ${a.callName ?? '없음'} · 말투 ${a.speechLevel}`,
      ];
    }
    case 'report': {
      const r = output as CrushReport;
      return [`제목: ${r.headline}`, `키워드: ${r.keywords.join(', ')}`, ...r.strategy.map((s, i) => `공략 ${i + 1}: ${s}`), `속마음: ${r.innerThought}`, `궁합 ${r.compatibility}점 — ${r.compatibilityNote}`];
    }
    case 'mind': {
      const m = output as MindReading;
      return [`결론: ${m.headline}`, `속마음: ${m.innerVoice}`, ...m.possibilities.map((p) => `${p.percent}% ${p.label} — ${p.reason}`), `조언: ${m.advice}`, ...(m.sampleReply ? [`예시: ${m.sampleReply}`] : [])];
    }
    default: {
      const p = output as PracticeReply;
      return [...p.replies.map((t) => `상대: ${t}`), `${p.mood} 온도 ${p.heatDelta >= 0 ? '+' : ''}${p.heatDelta}°${p.ended ? ' · 대화 끝냄' : ''}`, `피드백: ${p.feedback}`, ...(p.better ? [`더 좋은 말: ${p.better}`] : [])];
    }
  }
}

// ── 실행 ────────────────────────────────────────────────────

interface Combo {
  model: string;
  thinking: GeminiThinkingLevel;
  temperature: boolean;
}

interface Run extends Combo {
  caseId: string;
  ms: number;
  ok: boolean;
  error?: string;
  usage?: GeminiUsage;
  finishReason?: string;
  attempts?: number;
  cost: number | null;
  lines: string[];
}

const comboKey = (c: Combo) => `${c.model} · 생각 ${c.thinking} · temp ${c.temperature ? 'on' : 'off'}`;
/** 지금 운영 중인 설정 (서버 스위치를 하나도 넣지 않았을 때) */
const isCurrent = (c: Combo) => c.model === GEMINI_DEFAULT_MODEL && c.thinking === GEMINI_DEFAULT_THINKING && c.temperature;
const label = (c: Combo) => `${comboKey(c)}${isCurrent(c) ? ' (지금 운영)' : ''}`;

function readArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args.set(argv[i].slice(2), next);
      i++;
    } else {
      args.set(argv[i].slice(2), '');
    }
  }
  return args;
}

const listOf = (value: string | undefined, fallback: string[]) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readImage(file: string): ImageInput {
  const ext = path.extname(file).toLowerCase();
  const mediaType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
  if (!mediaType) fail(`--image 는 jpg·png·webp 만 돼요: ${file}`);
  return { base64: fs.readFileSync(file).toString('base64'), mediaType };
}

const fmt = (n?: number) => (n == null ? '-' : n.toLocaleString('en-US'));
const usd = (n: number | null, digits = 4) => (n == null ? '?' : `$${n.toFixed(digits)}`);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
/** 마크다운 표 칸 */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

function writeReport(runs: Run[], cases: Case[], combos: Combo[], repeat: number): string {
  const out: string[] = [];
  const stamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  out.push(`# AI 모델 A/B 비교 (${stamp})`, '');
  out.push(`- 조합 ${combos.length}개 × 예시 ${cases.length}개 × 반복 ${repeat}번 = ${runs.length}번 호출`);
  out.push(`- 가격(100만 토큰당 입력/출력): ${Object.keys(PRICES).map((m) => { const p = priceOf(m); return `${m} $${p?.input}/$${p?.output}`; }).join(' · ')}`);
  out.push('- 비용은 캐시 할인 없이 계산했고, 생각 토큰은 출력 단가로 셌다. 「지금 운영」이 서버 스위치를 하나도 넣지 않은 지금 설정이다.', '');

  out.push('## 조합별 요약 (모든 예시 평균)', '');
  out.push('| 조합 | 성공 | 평균 시간 | 평균 입력 | 평균 생각 | 평균 출력 | 평균 캐시 | 1회 평균 비용 | 1,000회 비용 |');
  out.push('|---|---|---|---|---|---|---|---|---|');
  for (const c of combos) {
    const mine = runs.filter((r) => comboKey(r) === comboKey(c));
    const okRuns = mine.filter((r) => r.ok);
    const costs = okRuns.map((r) => r.cost).filter((x): x is number => x != null);
    const mean = (pick: (u: GeminiUsage) => number | undefined) => Math.round(avg(okRuns.map((r) => (r.usage ? (pick(r.usage) ?? 0) : 0))));
    out.push(
      `| ${cell(label(c))} | ${okRuns.length}/${mine.length} | ${(avg(okRuns.map((r) => r.ms)) / 1000).toFixed(1)}초 | ${fmt(mean((u) => u.input))} | ${fmt(mean((u) => u.thoughts))} | ${fmt(mean((u) => u.output))} | ${fmt(mean((u) => u.cached))} | ${usd(costs.length ? avg(costs) : null)} | ${usd(costs.length ? avg(costs) * 1000 : null, 2)} |`,
    );
  }
  out.push('');

  out.push('## 예시별 결과 (조합별로 나란히)', '');
  for (const k of cases) {
    out.push(`### ${k.label}`, '', `> ${cell(k.ask)}`, '');
    out.push('| 조합 | 시간 | 입력 / 생각 / 출력 / 캐시 | 비용 | 종료 | 결과 |');
    out.push('|---|---|---|---|---|---|');
    for (const r of runs.filter((x) => x.caseId === k.id)) {
      const u = r.usage;
      const tokens = u ? `${fmt(u.input)} / ${fmt(u.thoughts)} / ${fmt(u.output)} / ${fmt(u.cached)}` : '-';
      const body = r.ok ? r.lines.join('\n') : `⚠️ ${r.error ?? '실패'}`;
      out.push(`| ${cell(label(r))} | ${(r.ms / 1000).toFixed(1)}초 | ${tokens} | ${usd(r.cost)} | ${r.finishReason ?? '-'}${(r.attempts ?? 1) > 1 ? ` (${r.attempts}번)` : ''} | ${cell(body)} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) fail('GEMINI_API_KEY 환경변수가 필요해요.');
  const args = readArgs(process.argv.slice(2));

  const models = listOf(args.get('models'), ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']);
  const thinking = listOf(args.get('thinking'), [GEMINI_DEFAULT_THINKING, 'minimal']);
  for (const t of thinking) if (!(GEMINI_THINKING_LEVELS as readonly string[]).includes(t)) fail(`--thinking 은 ${GEMINI_THINKING_LEVELS.join('|')} 중에서: ${t}`);
  const temps = listOf(args.get('temperature'), ['on', 'off']);
  for (const t of temps) if (t !== 'on' && t !== 'off') fail(`--temperature 는 on 또는 off: ${t}`);
  const modes = listOf(args.get('modes'), ['coach', 'report', 'mind', 'practice']);
  for (const m of modes) if (!['coach', 'report', 'mind', 'practice'].includes(m)) fail(`--modes 는 coach,report,mind,practice 중에서: ${m}`);
  const repeat = Number(args.get('repeat') ?? 1);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) fail('--repeat 는 1~10');
  const imagePath = args.get('image');
  const cases = buildCases(imagePath ? readImage(imagePath) : undefined).filter((c) => modes.includes(c.mode));
  const out = args.get('out') || path.join(os.tmpdir(), `mylovecoach-ab-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);

  const combos: Combo[] = models.flatMap((model) => thinking.flatMap((t) => temps.map((temp) => ({ model, thinking: t as GeminiThinkingLevel, temperature: temp === 'on' }))));
  for (const m of models) if (!PRICES[m]) console.warn(`가격표에 없는 모델이라 비용은 ? 로 적어요: ${m}`);
  const total = combos.length * cases.length * repeat;
  console.log(`조합 ${combos.length}개(모델 ${models.length} × 생각 ${thinking.length} × temperature ${temps.length}) × 예시 ${cases.length}개 × 반복 ${repeat}번 = ${total}번 부릅니다\n`);

  const runs: Run[] = [];
  for (const k of cases) {
    const parsed = parseAiRequest(k.body);
    if (!parsed.ok) fail(`예시 ${k.id} 의 요청 형식이 올바르지 않아요: ${JSON.stringify(parsed.issues.slice(0, 3))}`);
    const task = buildTask(parsed);
    for (const c of combos) {
      for (let i = 0; i < repeat; i++) {
        const started = Date.now();
        const run: Run = { ...c, caseId: k.id, ms: 0, ok: false, cost: null, lines: [] };
        try {
          const result = await callGeminiTask(task, key!, { model: c.model, thinkingLevel: c.thinking, omitTemperature: !c.temperature, fallbackModels: [] });
          run.ms = Date.now() - started;
          run.usage = result.usage;
          run.finishReason = result.finishReason;
          run.attempts = result.attempts;
          run.cost = costOf(c.model, result.usage);
          if (!result.ok) {
            run.error = `${result.status} ${result.code} ${result.message}`;
          } else {
            let raw: unknown;
            try {
              raw = JSON.parse(result.text);
            } catch {
              raw = undefined;
            }
            const checked = raw === undefined ? null : task.schema.safeParse(raw);
            if (checked?.success) {
              run.ok = true;
              run.lines = summarize(k.mode, task.normalize(checked.data));
            } else {
              run.error = `응답 형식 불일치 (종료 ${result.finishReason ?? '?'}): ${result.text.slice(0, 160)}`;
            }
          }
        } catch (e) {
          run.ms = Date.now() - started;
          run.error = e instanceof Error ? e.message : String(e);
        }
        runs.push(run);
        const u = run.usage;
        console.log(
          `${run.ok ? '✓' : '✗'} ${k.id} · ${label(c)} · ${(run.ms / 1000).toFixed(1)}초 · 입력 ${fmt(u?.input)} / 생각 ${fmt(u?.thoughts)} / 출력 ${fmt(u?.output)} / 캐시 ${fmt(u?.cached)} · ${usd(run.cost)}${run.error ? ` · ${run.error}` : ''}`,
        );
      }
    }
  }

  fs.writeFileSync(out, writeReport(runs, cases, combos, repeat), 'utf8');
  const spent = runs.reduce((s, r) => s + (r.cost ?? 0), 0);
  console.log(`\n예상 비용 합계 ${usd(spent)} (가격표에 있는 모델만) · 보고서: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
