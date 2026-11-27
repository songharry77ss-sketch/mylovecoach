/**
 * 영어판(My Love Coach) 콘텐츠 — 연애팁 백서·속마음 카드·채팅 질문·연습 상대·연습 판정·데모 결과.
 * 언어는 모듈을 불러올 때 한 번 정해지므로 APP_LANG=en 을 둔 채 isolateModules 안에서 따로 불러온다
 * (기본 jest 실행은 한국어라, 한국어판 기대값을 쓰는 다른 테스트는 그대로다).
 */
import { CoachAnalysisReadSchema, CoachRequestSchema } from '@/lib/coach-schema';
import { CrushReportSchema, MindReadingSchema, PracticeReplySchema } from '@/lib/ai-schemas';
import type { Gender, Relationship } from '@/lib/types';

type Mods = {
  tips: typeof import('@/lib/tips');
  mind: typeof import('@/lib/mind-cards');
  personas: typeof import('@/lib/personas');
  practice: typeof import('@/lib/practice');
  demo: typeof import('@/lib/demo');
};

function load(lang: 'ko' | 'en'): Mods {
  const before = process.env.APP_LANG;
  process.env.APP_LANG = lang;
  let mods: Mods | undefined;
  try {
    jest.isolateModules(() => {
      mods = {
        tips: jest.requireActual('@/lib/tips'),
        mind: jest.requireActual('@/lib/mind-cards'),
        personas: jest.requireActual('@/lib/personas'),
        practice: jest.requireActual('@/lib/practice'),
        demo: jest.requireActual('@/lib/demo'),
      };
    });
  } finally {
    if (before === undefined) delete process.env.APP_LANG;
    else process.env.APP_LANG = before;
  }
  return mods!;
}

const en = load('en');
const ko = load('ko');

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const GENDERS: Gender[] = ['female', 'male', 'other'];
const RELATIONSHIPS: Relationship[] = ['crush', 'talking', 'blind_date', 'friend', 'dating', 'ex'];
const noKo = (text: string) => expect(text).not.toMatch(HANGUL);

describe('연애팁 백서 (dating playbook) 영어판', () => {
  it('팁은 한국어판과 id·분류·이모지·순서가 같고, 글에 한글이 없다', () => {
    expect(en.tips.TIPS.map((t) => [t.id, t.category, t.emoji])).toEqual(ko.tips.TIPS.map((t) => [t.id, t.category, t.emoji]));
    for (const t of en.tips.TIPS) {
      noKo(t.title);
      noKo(t.body);
    }
  });

  it('고민은 한국어판과 id·묶은 팁·속마음 카드·단계 수가 같고, 글에 한글이 없다', () => {
    expect(en.tips.WORRIES.map((w) => [w.id, w.tips, w.minds, w.steps.length])).toEqual(ko.tips.WORRIES.map((w) => [w.id, w.tips, w.minds, w.steps.length]));
    for (const w of en.tips.WORRIES) {
      // 탐색 탭 고민 버튼(두 칸, 한 줄)에 들어가는 길이
      expect(w.title.length).toBeLessThanOrEqual(18);
      for (const text of [w.title, w.keywords, w.answer, w.ask, ...w.steps.flatMap((s) => [s.title, s.body])]) noKo(text);
      expect(new Set(w.steps.map((s) => s.title)).size).toBe(w.steps.length);
    }
    expect(en.tips.tipsOf(en.tips.WORRIES[0]).map((t) => t.id)).toEqual(en.tips.WORRIES[0].tips);
  });
});

describe('속마음 카드 (read their mind) 영어판', () => {
  it('카드는 한국어판과 id·분류·이모지·순서가 같다', () => {
    expect(en.mind.MIND_CARDS.map((c) => [c.id, c.category, c.emoji])).toEqual(ko.mind.MIND_CARDS.map((c) => [c.id, c.category, c.emoji]));
  });

  it('성별마다 자리표가 모두 채워지고, 한글 없이 대문자로 시작한다', () => {
    for (const c of en.mind.MIND_CARDS) {
      for (const g of GENDERS) {
        const text = en.mind.renderSituation(c, g);
        expect(text).not.toMatch(/[{}]/);
        noKo(text);
        expect(text[0]).toMatch(/[A-Z"]/);
        expect(text.length).toBeLessThanOrEqual(110);
      }
    }
  });

  it('대명사와 동사 꼴이 성별에 맞는다', () => {
    const card = (id: string) => en.mind.MIND_CARDS.find((c) => c.id === id)!;
    expect(en.mind.renderSituation(card('text-1'), 'female')).toBe('She just sent "wyd?" and then went quiet for 2 hours.');
    expect(en.mind.renderSituation(card('text-5'), 'male')).toBe('He only texts me first on nights he goes out drinking.');
    expect(en.mind.renderSituation(card('text-5'), 'other')).toBe('They only text me first on nights they go out drinking.');
    expect(en.mind.renderSituation(card('ex-8'), 'other')).toBe("We got back together. They text less than before, but they're sweeter in person.");
    expect(en.mind.renderSituation(card('some-3'), 'female')).toBe("We've been on three dates, and she hasn't made a move or drawn a line.");
    expect(en.mind.renderSituation(card('some-3'), 'other')).toBe("We've been on three dates, and they haven't made a move or drawn a line.");
    expect(en.mind.themLabel('male')).toBe('he');
    expect(en.mind.themLabel('female')).toBe('she');
    expect(en.mind.themLabel('other')).toBe('they');
    expect(en.mind.fillThem('Read {their} mind', 'female')).toBe('Read her mind');
    expect(en.mind.fillThem("What {they're} thinking", 'male')).toBe("What he's thinking");
    expect(en.mind.fillThem('{They} {does}n’t {is} {was} {has}', 'other')).toBe('They don’t are were have');
  });

  it('분류 이름은 영어로 보이고 한국어판은 값 그대로', () => {
    for (const cat of en.mind.MIND_CATEGORIES) noKo(en.mind.mindCategoryLabel(cat));
    for (const cat of ko.mind.MIND_CATEGORIES) expect(ko.mind.mindCategoryLabel(cat)).toBe(cat);
  });

  it('채팅 질문 20개는 겹치지 않고, 이름을 모르면 「my crush」', () => {
    expect(en.mind.CHAT_QUESTIONS).toHaveLength(20);
    expect(new Set(en.mind.CHAT_QUESTIONS).size).toBe(20);
    for (const q of en.mind.CHAT_QUESTIONS) {
      expect(q).toContain('{name}');
      noKo(q);
    }
    for (const q of en.mind.drawChatQuestions(5, '  ', () => 0.3)) expect(q).toContain('my crush');
    for (const q of en.mind.drawChatQuestions(20, 'Emma', () => 0.5)) expect(q).toContain('Emma');
  });
});

describe('연습 상대 (practice chat) 영어판', () => {
  const list = en.personas.PERSONAS;

  it('12명 — 남녀 6명씩, 난이도 4명씩, 관계 6종, 모두 casual, 한국어판과 id 가 겹치지 않는다', () => {
    expect(list).toHaveLength(12);
    const ids = list.map((p) => p.id);
    expect(new Set(ids).size).toBe(12);
    for (const id of ids) expect(id).toMatch(/^p_[a-z]+$/);
    const koIds = new Set(ko.personas.PERSONAS.map((p) => p.id));
    expect(ids.filter((id) => koIds.has(id))).toEqual([]);
    expect(list.filter((p) => p.gender === 'female')).toHaveLength(6);
    expect(list.filter((p) => p.gender === 'male')).toHaveLength(6);
    for (const d of [1, 2, 3]) expect(list.filter((p) => p.difficulty === d)).toHaveLength(4);
    for (const r of RELATIONSHIPS) expect(list.some((p) => p.relationship === r)).toBe(true);
    for (const p of list) expect(p.speech).toBe('casual');
    // 여·남 번갈아, 난이도 오름차순 (한국어판과 같은 짜임)
    expect(list.map((p) => [p.gender, p.difficulty, p.relationship])).toEqual(ko.personas.PERSONAS.map((p) => [p.gender, p.difficulty, p.relationship]));
  });

  it('글에 한글이 없고 서버 요청 길이 안에 든다', () => {
    for (const p of list) {
      for (const text of [p.name, p.job, p.scenario, p.opener, p.hint, ...p.style]) noKo(text);
      expect(p.name.length).toBeLessThanOrEqual(20);
      expect(p.job.length).toBeLessThanOrEqual(30);
      expect(p.scenario.length).toBeLessThanOrEqual(300);
      expect(p.mbti).toMatch(/^[EI][SN][TF][JP]$/);
      expect(p.age).toBeGreaterThanOrEqual(22);
      expect(p.age).toBeLessThanOrEqual(36);
      expect(p.style.length).toBeGreaterThanOrEqual(2);
      expect(p.style.length).toBeLessThanOrEqual(4);
    }
    expect(en.personas.personaById('p_emma')?.name).toBe('Emma');
    expect(en.personas.personasFor('male').slice(0, 6).every((p) => p.gender === 'female')).toBe(true);
  });

  it('첫마디·판정·직접 만든 상대 힌트도 영어', () => {
    for (const speech of ['polite', 'casual'] as const) for (const r of RELATIONSHIPS) noKo(en.practice.defaultOpener(speech, r));
    for (const heat of [-10, 0, 10, 30, 60, 90]) {
      const v = en.practice.practiceVerdict(heat);
      noKo(v.title);
      noKo(v.body);
    }
    const custom = en.practice.customPersona({ name: 'Jordan', gender: 'male', age: 27, mbti: 'ENFP', style: [], relationship: 'talking', scenario: 'We met at a party.', speech: 'casual', difficulty: 2 });
    noKo(custom.hint);
    noKo(custom.opener);
  });
});

describe('데모 결과 (스토어 스크린샷) 영어판', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const settle = async <T,>(p: Promise<T>) => {
    await jest.advanceTimersByTimeAsync(10_000);
    return p;
  };

  it('코칭 결과 — 서버 응답 형식을 지키고, 한글·「demo」 표시가 없다', async () => {
    const req = CoachRequestSchema.parse({
      crush: { name: 'Emma', gender: 'female', relationship: 'talking', style: [], notes: '', heat: 0, memory: ['Loves taco spots and live music'] },
      user: { name: '', gender: 'male', style: [] },
      tone: 'flirty',
      emoji: 'on',
      text: 'Emma: haha maybe 👀',
      today: 'Nov 27 (Fri)',
    });
    const a = await settle(en.demo.demoAnalysis(req));
    expect(CoachAnalysisReadSchema.safeParse(a).success).toBe(true);
    expect(JSON.stringify(a)).not.toMatch(HANGUL);
    expect(JSON.stringify(a).toLowerCase()).not.toContain('demo');
    expect(a.replies).toHaveLength(3);
    expect(a.replies[0].text.startsWith('Emma, ')).toBe(true);
    expect(a.summary).toContain('Emma');
    expect(a.memory).toHaveLength(2);

    // 이름 없는 방(영어판 저장값 Them)은 대명사로
    const unnamed = await settle(en.demo.demoAnalysis({ ...req, crush: { ...req.crush, name: 'Them', memory: [] }, emoji: 'off' }));
    expect(unnamed.summary.startsWith('Their ')).toBe(true);
    expect(unnamed.insights[0].startsWith('She ')).toBe(true);
    expect(unnamed.replies.every((r) => !/\p{Extended_Pictographic}/u.test(r.text))).toBe(true);
  });

  it('보고서·속마음·연습 — 서버 응답 형식을 지키고 한글이 없다', async () => {
    const crush = { name: 'Jake', gender: 'male' as const, relationship: 'talking' as const, style: [], notes: '', heat: 20 };
    const report = await settle(en.demo.demoReport({ mode: 'report', crush, user: { name: '', gender: 'female', style: [] }, sessions: [], heatLog: [] } as never));
    expect(CrushReportSchema.safeParse(report).success).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(HANGUL);

    const mind = await settle(en.demo.demoMind({ mode: 'mind', situation: 'He left me on read.', perspective: 'male' }));
    expect(MindReadingSchema.safeParse(mind).success).toBe(true);
    expect(JSON.stringify(mind)).not.toMatch(HANGUL);
    expect(mind.headline.startsWith("He's ")).toBe(true);

    const persona = en.personas.PERSONAS[0];
    const reply = await settle(
      en.demo.demoPractice({
        mode: 'practice',
        persona: { ...persona, job: persona.job },
        user: { name: '', gender: 'male', style: [] },
        heat: 0,
        turns: [{ role: 'me', text: 'What are you up to this weekend?' }],
      } as never),
    );
    expect(PracticeReplySchema.safeParse(reply).success).toBe(true);
    expect(JSON.stringify(reply)).not.toMatch(HANGUL);
  });
});
