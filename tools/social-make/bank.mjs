// 콘텐츠 창고(bank.json) 항목 검사 — make.mjs(--check) 와 bank-add.mjs(새 항목 받기)가 같이 쓴다
import { problems as entryProblems } from '../lib/social.mjs';
import { missingEmoji } from './kit.mjs';
import { FORMATS } from './formats/index.mjs';

/** 창고 항목 검사 — 문제 목록 */
export function bankProblems(list) {
  const out = [];
  const seen = new Set();
  for (const it of list) {
    const say = (m) => out.push(`${it?.id ?? '(id 없음)'}: ${m}`);
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(String(it?.id ?? ''))) say('id 는 영어 소문자·숫자·- 로');
    if (seen.has(it.id)) say('id 가 겹쳐요');
    seen.add(it.id);
    const fmt = FORMATS[it.format];
    if (!fmt) {
      say(`format 은 ${Object.keys(FORMATS).join('·')} 중 하나`);
      continue;
    }
    for (const p of fmt.check(it)) say(p);
    // analysis·analysisRequest 는 운영 코치 서버가 준 실제 결과를 그대로 보관한 것 — 서버에서 바로 받을 때처럼 이모지 검사에서 뺀다(고치면 「실제 결과」가 아니게 됨)
    const missing = missingEmoji(JSON.stringify({ ...it, caption: '', analysis: undefined, analysisRequest: undefined }));
    if (missing.length) say(`그림이 없는 이모지: ${missing.join(' ')} (scripts/fetch-fluent-emoji.ts 에 추가)`);
    // 캡션·종류는 게시 검사와 같은 규칙으로
    const fake = { id: it.id, at: '2026-01-01 21:00', channel: 'instagram', kind: fmt.kind, media: fmt.kind === 'reel' ? ['x.mp4'] : Array.from({ length: fmt.slides?.(it) ?? 2 }, (_, i) => `${i}.jpg`), caption: it.caption, approved: false };
    for (const p of entryProblems(fake)) out.push(p);
    if (!String(it.caption ?? '').trim()) say('caption 이 비었어요');
  }
  return out;
}

