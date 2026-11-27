// 영어판 화면 문장을 뽑아 다국어 번역 원본(src/i18n/source-en.json)을 만든다 — 2026-11-27 세계 출시
//   node tools/i18n/extract-en.mjs          → 원본 갱신 (문장 수·새로 생긴 문장 수 출력)
//   node tools/i18n/extract-en.mjs --check  → 원본과 코드가 어긋나면 실패 (CI·커밋 전 확인용)
// 규칙: src 의 문자열·템플릿 중 「사람이 읽는 영어 문장」만 모은다. 템플릿의 ${…} 는 {0} {1} … 로 바꾼다
// (앱은 실행 중에 완성된 문장을 이 틀에 맞춰 번역한다 — src/lib/i18n.ts 의 T()).
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ts = createRequire(import.meta.url)(join(root, 'node_modules', 'typescript'));
const OUT = join(root, 'src', 'i18n', 'source-en.json');
const HANGUL = /[가-힣ㄱ-ㆎ]/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['__tests__', 'node_modules', 'i18n'].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|d)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

// 사람이 읽는 문장인지 — 식별자·경로·주소·색·키 같은 건 뺀다
function isProse(s) {
  const t = s.trim();
  if (t.length < 2 || HANGUL.test(t) || !/[A-Za-z]/.test(t)) return false;
  if (/^(https?:|mailto:|tel:|data:|#|\/|\.\/|\.\.\/|@\/)/.test(t)) return false;
  if (/^[a-z0-9_.\-:/@]+$/.test(t)) return false; // female · p_emma · coach_api · ios
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 3) return false; // ENV_NAME
  if (/^[a-z]+[A-Z]\w*$/.test(t)) return false; // camelCase 키
  if (/^(rgba?|hsla?)\(/.test(t)) return false;
  if (/^\{[\s\S]*\}$/.test(t) && !/\{\d+\}/.test(t)) return false; // JSON 조각
  // 단어 하나면 대문자로 시작해야 화면 글자 (Home · Retake · OK). 두 단어 이상이거나 문장부호가 있으면 화면 글자
  if (!/\s/.test(t) && !/^[A-Z]/.test(t) && !/[.!?…]$/.test(t)) return false;
  return true;
}

// 화면 글자가 아닌 곳 — 가져오기 경로, 객체 키, 기록·로그 호출, 스타일·테스트 ID
const SKIP_CALLS = new Set(['track', 'require', 'log', 'warn', 'error', 'info', 'debug', 'trackEvent', 'logEvent', 'captureException', 'matchMedia', 'getItem', 'setItem', 'removeItem', 'querySelector']);
const SKIP_ATTRS = new Set(['testID', 'nativeID', 'style', 'source', 'href', 'name', 'icon', 'key', 'id', 'pointerEvents', 'resizeMode', 'keyboardType', 'returnKeyType', 'autoCapitalize', 'autoComplete', 'textContentType', 'contentFit', 'importantForAccessibility', 'accessibilityRole', 'role']);

function skipByParent(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isCaseClause(p) && p.expression === node) return true;
  if (ts.isJsxAttribute(p) && SKIP_ATTRS.has(p.name.getText())) return true;
  for (let n = p; n; n = n.parent) {
    if (ts.isJsxAttribute(n) && SKIP_ATTRS.has(n.name.getText())) return true;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      if (SKIP_CALLS.has(name)) return true;
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'console') return true;
    }
    if (ts.isTypeNode?.(n)) return true;
  }
  return false;
}

function templateKey(node) {
  let s = node.head.text;
  node.templateSpans.forEach((span, i) => {
    s += `{${i}}` + span.literal.text;
  });
  return s;
}

// AI 프롬프트·서버 전용 파일은 화면 글자가 아니다
const NOT_UI = /src[\\/]lib[\\/](coach-schema|ai-tasks|ai-schemas|gemini|ai-backup|version|release-notes|i18n)\.ts$|src[\\/]lib[\\/]knowledge[\\/]/;

const keys = new Map(); // 문장 → 처음 나온 파일
for (const file of walk(join(root, 'src')).filter((f) => !NOT_UI.test(f))) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const add = (k) => {
    const v = k.replace(/\s+$/g, '').replace(/^\s+/g, '');
    if (isProse(v.replace(/\{\d+\}/g, 'x')) && !keys.has(v)) keys.set(v, relative(root, file).split(sep).join('/'));
  };
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!skipByParent(node)) add(node.text);
    } else if (ts.isTemplateExpression(node)) {
      if (!skipByParent(node)) {
        const k = templateKey(node);
        // 자리표만 있고 글자가 거의 없는 틀은 뺀다 (`${a} · ${b}` 같은 것)
        if (k.replace(/\{\d+\}/g, '').replace(/[\s·•,:;()\-–—/|+]/g, '').length >= 2) add(k);
      }
    } else if (ts.isJsxText(node)) {
      const t = node.getText().trim();
      if (t) add(t);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const list = [...keys.keys()].sort((a, b) => a.localeCompare(b));
if (process.argv.includes('--check')) {
  const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  const missing = list.filter((k) => !old.includes(k));
  if (missing.length) {
    console.error(`번역 원본에 없는 문장 ${missing.length}개 — node tools/i18n/extract-en.mjs 로 갱신하고 번역을 채우세요`);
    for (const m of missing.slice(0, 20)) console.error('  ' + m);
    process.exit(1);
  }
  console.log(`번역 원본 확인 — ${list.length}개`);
} else {
  const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(list, null, 1) + '\n');
  const added = list.filter((k) => !old.includes(k)).length;
  const words = list.reduce((n, k) => n + k.split(/\s+/).length, 0);
  console.log(`번역 원본 ${list.length}개 (새로 ${added}개 · 단어 약 ${words}개) → ${relative(root, OUT)}`);
}
