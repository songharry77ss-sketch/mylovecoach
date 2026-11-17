import { MIND_CARDS } from '@/lib/mind-cards';
import { TIPS, WORRIES, mindsOf, tipsOf, worryById } from '@/lib/tips';

/** 연애팁 백서(11/12 회의 8번) 묶음표 — 고민마다 해답·팁·속마음이 빠짐없이 이어지는지 */
describe('연애팁 백서 묶음표', () => {
  it('고민은 6~8개이고 id 가 겹치지 않는다', () => {
    expect(WORRIES.length).toBeGreaterThanOrEqual(6);
    expect(WORRIES.length).toBeLessThanOrEqual(8);
    const ids = WORRIES.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('고민마다 제목·찾는 말·한 줄 결론·물어볼 글이 있고, 해결 단계는 2~4개', () => {
    for (const w of WORRIES) {
      // 탐색 탭 고민 카드(두 칸)에 한 줄로 들어가는 길이 — 11자 「다시 연락하고 싶어요」가 갤럭시(384 폭)에서 한 줄인 것을 캡처로 확인
      expect(w.title.length).toBeLessThanOrEqual(11);
      expect(w.title).toMatch(/요$/);
      expect(w.keywords.trim().length).toBeGreaterThan(0);
      expect(w.answer.trim().length).toBeGreaterThan(0);
      expect(w.ask.trim().length).toBeGreaterThan(0);
      expect(w.steps.length).toBeGreaterThanOrEqual(2);
      expect(w.steps.length).toBeLessThanOrEqual(4);
      for (const s of w.steps) {
        expect(s.title.trim().length).toBeGreaterThan(0);
        expect(s.body.trim().length).toBeGreaterThan(0);
      }
      expect(new Set(w.steps.map((s) => s.title)).size).toBe(w.steps.length);
    }
  });

  it('묶은 팁·속마음 id 는 모두 실제로 있고, 고민마다 팁이 2개 이상', () => {
    const tipIds = new Set(TIPS.map((t) => t.id));
    const mindIds = new Set(MIND_CARDS.map((c) => c.id));
    for (const w of WORRIES) {
      for (const id of w.tips) expect(tipIds).toContain(id);
      for (const id of w.minds) expect(mindIds).toContain(id);
      expect(new Set(w.tips).size).toBe(w.tips.length);
      expect(new Set(w.minds).size).toBe(w.minds.length);
      expect(tipsOf(w)).toHaveLength(w.tips.length);
      expect(mindsOf(w)).toHaveLength(w.minds.length);
      expect(w.tips.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('기존 팁·속마음 카드는 하나도 빠지지 않고 어느 고민엔가 들어간다', () => {
    const usedTips = new Set(WORRIES.flatMap((w) => w.tips));
    const usedMinds = new Set(WORRIES.flatMap((w) => w.minds));
    expect(TIPS.filter((t) => !usedTips.has(t.id)).map((t) => t.id)).toEqual([]);
    expect(MIND_CARDS.filter((c) => !usedMinds.has(c.id)).map((c) => c.id)).toEqual([]);
  });

  it('팁 id 는 겹치지 않고 예전 팁 12개가 그대로 있다', () => {
    const ids = TIPS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['start-1', 'start-2', 'talk-1', 'talk-2', 'talk-3', 'talk-4', 'date-1', 'date-2', 'temp-1', 'temp-2', 'crisis-1', 'crisis-2']) expect(ids).toContain(id);
  });

  it('worryById 는 주소의 id 로 찾고, 없으면 undefined', () => {
    for (const w of WORRIES) expect(worryById(w.id)).toBe(w);
    expect(worryById('nothing')).toBeUndefined();
    expect(worryById(undefined)).toBeUndefined();
  });

  it('tipsOf · mindsOf 는 묶음표 순서를 지킨다', () => {
    const w = WORRIES[0];
    expect(tipsOf(w).map((t) => t.id)).toEqual(w.tips);
    expect(mindsOf(w).map((c) => c.id)).toEqual(w.minds);
  });
});
