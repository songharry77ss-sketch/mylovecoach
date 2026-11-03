/**
 * 버전별 「이번 버전의 새로운 기능」 — 스토어에 올리는 문구(docs/STORE_LISTING.md)를 그대로 쓴다.
 * 서버(api/version.ts)가 새 버전 안내에 실어 보내, 앱의 「새 버전이 나왔어요」 시트가 무엇이 좋아졌는지 보여 준다.
 * 스토어 제출 도구(tools/lib/asc-release-guard.mjs readWhatsNew)와 같은 제목 형식을 읽되, 여기서는 없으면 빈 목록이다.
 */

/** 시트에 보여 줄 만큼만 (문구 하나가 너무 길면 자른다) */
export const NOTES_MAX = 3;
export const NOTE_MAX_CHARS = 120;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `## 이번 버전의 새로운 기능 (1.0.7)` 아래 `- ` 줄들. 버전 제목이 없거나 형식이 다르면 [] */
export function whatsNewFor(markdown: string, version: string): string[] {
  const heading = new RegExp(`^## 이번 버전의 새로운 기능 \\(${escape(version)}(?: 초안)?\\)[ \\t]*\\r?$`, 'm').exec(markdown);
  if (!heading) return [];
  const tail = markdown.slice(heading.index + heading[0].length);
  const end = tail.search(/^## /m);
  const lines = (end < 0 ? tail : tail.slice(0, end))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.some((line) => !/^- \S/.test(line))) return [];
  return lines.map((line) => line.slice(2).trim());
}

/** 서버가 보낸 값을 시트에 보여 줄 모양으로 — 글자 목록이 아니면 버리고, 개수와 길이를 줄인다 */
export function cleanNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((note): note is string => typeof note === 'string')
    .map((note) => note.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, NOTES_MAX)
    .map((note) => (note.length > NOTE_MAX_CHARS ? `${note.slice(0, NOTE_MAX_CHARS - 1).trimEnd()}…` : note));
}
