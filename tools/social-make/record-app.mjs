// 실제 앱 화면 녹화 — 데모 웹 빌드(EXPO_PUBLIC_DEMO_MODE=1)를 띄워 진짜 AI 결과를 넣어 두고, 사람처럼 누르고 치는 흐름을 프레임으로 잡는다.
// app-reel 포맷이 쓴다. 한 번 실행에서 웹 빌드·정적 서버·브라우저는 한 번만 띄우고 closeApp() 으로 닫는다.
//
// - 데모 웹: APP_DEMO_WEB=<폴더> 가 있으면 그 빌드를 그대로 쓰고(없으면 거기에 빌드), 아니면 임시 폴더에 빌드해 두고 커밋이 같으면 다시 쓴다.
//   빌드할 때는 코치 서버 주소·토큰(EXPO_PUBLIC_API_*)을 빼서 번들에 들어가지 않게 한다.
// - 브라우저: playwright-core 를 동적으로 불러온다 (CI 는 `npm i --no-save playwright-core@1.48.2`, PC 는 PLAYWRIGHT_CORE=<playwright-core 폴더>).
//   윈도우는 Edge(msedge), 그 밖에는 설치된 Google Chrome(chrome). APP_DEMO_BROWSER 로 바꿀 수 있다.
// - 화면: 390×844 · DPR 3 (프레임 1170×2532). CDP Page.startScreencast(jpeg, 시각 포함)로 바뀔 때마다 잡는다.
// - 글꼴: 앱의 웹 글꼴(system-ui)은 PC·CI 마다 달라서 저장소의 Pretendard 로 바꿔 그린다 (아이폰 기본 글꼴과 비슷). 이모지는 시스템 글꼴.
import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const VIEW = { width: 390, height: 844, scale: 3 };
const STORE_KEY = 'mylovecoach.store.v1';
const REL_LABEL = { crush: '짝사랑', talking: '썸', blind_date: '소개팅', friend: '친구', dating: '연인', ex: '재회' };
const GENDER_LABEL = { female: '여성', male: '남성', other: '기타' };

let session = null;

// ───────────── 데모 웹 빌드 ─────────────

export const demoWebDir = () => (process.env.APP_DEMO_WEB ? path.resolve(process.env.APP_DEMO_WEB) : path.join(os.tmpdir(), 'sendit-app-demo-web'));

function headCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/** 데모 웹 빌드 폴더 — 있으면 다시 쓰고, 없으면 한 번 빌드한다 */
export function ensureDemoWeb() {
  const dir = demoWebDir();
  const marker = path.join(dir, 'sendit-demo.json');
  if (existsSync(path.join(dir, 'index.html'))) {
    if (process.env.APP_DEMO_WEB) return dir;
    const m = existsSync(marker) ? JSON.parse(readFileSync(marker, 'utf8')) : null;
    if (m?.demo && m.commit === headCommit()) return dir;
  }
  const cli = path.join(ROOT, 'node_modules', 'expo', 'bin', 'cli');
  if (!existsSync(cli)) throw new Error('expo 가 없어요 — npm ci 뒤에 실행해 주세요');
  console.log(`  데모 웹 빌드 중 (한 번만) → ${dir}`);
  const env = { ...process.env, EXPO_PUBLIC_DEMO_MODE: '1', EXPO_NO_DOTENV: '1', CI: '1' };
  // 데모는 서버를 부르지 않는다 — 주소·토큰이 번들(EXPO_PUBLIC_*)에 들어가지 않게 뺀다
  delete env.EXPO_PUBLIC_API_URL;
  delete env.EXPO_PUBLIC_API_TOKEN;
  rmSync(dir, { recursive: true, force: true });
  const started = Date.now();
  const r = spawnSync(process.execPath, [cli, 'export', '--platform', 'web', '--output-dir', dir], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 || !existsSync(path.join(dir, 'index.html'))) throw new Error(`데모 웹 빌드 실패\n${String(r.stderr || r.stdout || r.error).slice(-3000)}`);
  writeFileSync(marker, JSON.stringify({ demo: true, commit: headCommit(), at: new Date().toISOString() }));
  console.log(`  데모 웹 빌드 끝 (${Math.round((Date.now() - started) / 1000)}초)`);
  return dir;
}

// ───────────── 정적 서버 · 브라우저 ─────────────

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const FONT_DIRS = [path.join(ROOT, 'scripts', 'assets', 'fonts'), path.join(ROOT, 'api', '_assets', 'fonts')];
const FONT_FACES = [
  ['Pretendard-Medium.otf', '100 500'],
  ['Pretendard-SemiBold.otf', '600'],
  ['Pretendard-Bold.otf', '700'],
  ['Pretendard-ExtraBold.otf', '800'],
  ['Pretendard-Black.otf', '900'],
];

function serve(dir) {
  const server = createServer((req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      let file;
      if (p.startsWith('/__sendit_fonts/')) {
        const name = path.basename(p);
        file = FONT_DIRS.map((d) => path.join(d, name)).find((f) => existsSync(f));
      } else {
        file = path.join(dir, path.normalize(p).replace(/^([/\\])+/, ''));
        if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(dir, 'index.html'); // SPA
      }
      if (!file) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(500).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function loadPlaywright() {
  try {
    // eslint-disable-next-line import/no-unresolved -- 저장소 의존성이 아니다 (CI 는 npm i --no-save 로 깐다)
    return await import('playwright-core');
  } catch {
    const dir = process.env.PLAYWRIGHT_CORE;
    if (dir && existsSync(path.join(dir, 'index.mjs'))) return import(pathToFileURL(path.join(dir, 'index.mjs')).href);
    throw new Error('playwright-core 가 없어요 — `npm i --no-save playwright-core@1.48.2` 또는 PLAYWRIGHT_CORE=<playwright-core 폴더>');
  }
}

/** 데모 웹 + 정적 서버 + 브라우저 (한 번만 띄움) */
export async function openApp() {
  if (session) return session;
  const dir = ensureDemoWeb();
  const server = await serve(dir);
  const { chromium } = await loadPlaywright();
  const channel = process.env.APP_DEMO_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chrome');
  const browser = await chromium.launch({ channel, headless: true });
  session = { server, browser, base: `http://127.0.0.1:${server.address().port}` };
  return session;
}

/** 브라우저·서버 닫기 (열려 있을 때만) */
export async function closeApp() {
  if (!session) return;
  const s = session;
  session = null;
  await s.browser.close().catch(() => {});
  await new Promise((r) => s.server.close(r));
}

// ───────────── 페이지 준비 ─────────────

/** 처음 실행 안내·약관 동의를 마친 「시작한」 기기 상태 (사용법 안내판은 앱 소스에서 읽는다) */
function seedState(sc) {
  const guide = readFileSync(path.join(ROOT, 'src', 'store', 'app-store.ts'), 'utf8').match(/GUIDE_VERSION = '([^']+)'/)?.[1];
  if (!guide) throw new Error('app-store.ts 에서 GUIDE_VERSION 을 못 찾았어요');
  const now = Date.now();
  return {
    state: {
      user: { ...sc.user, createdAt: now },
      crushes: {},
      messages: {},
      termsAgreedAt: now,
      onboardingSeen: true,
      guideSeen: guide,
      privacyNoticeSeen: 999,
      contentConsent: false,
      contentConsentAt: now,
      legacyDeletionChecked: true,
      hapticsOn: false,
      upsellDismissed: true,
    },
    version: 1,
  };
}

/** 페이지가 뜨기 전에 넣는 것: 기기 상태 · 진짜 AI 결과 · 글꼴 · 터치 표시 */
function initScript({ key, seed, inject, faces }) {
  try {
    if (!sessionStorage.getItem('__sendit_seeded')) {
      localStorage.setItem(key, seed);
      sessionStorage.setItem('__sendit_seeded', '1');
    }
  } catch {
    // 저장소가 막힌 환경 — 아래 확인에서 걸린다
  }
  globalThis.__SENDIT_DEMO__ = inject;
  // 앱 웹 글꼴(system-ui …) → Pretendard. 아이콘 글꼴(ionicons 등)은 그대로 둔다
  const FONT = `'SenditRec', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
  const swap = (s) => (typeof s === 'string' ? s.replace(/system-ui\s*,\s*-apple-system\s*,\s*"?Pretendard"?\s*,\s*sans-serif/g, FONT) : s);
  const insert = CSSStyleSheet.prototype.insertRule;
  CSSStyleSheet.prototype.insertRule = function (rule, index) {
    return insert.call(this, swap(rule), index);
  };
  const fixInline = (el) => {
    const ff = el.style?.fontFamily;
    if (ff && ff.includes('system-ui')) el.style.fontFamily = swap(ff);
  };
  const css = `${faces.map(([url, weight]) => `@font-face{font-family:'SenditRec';src:url('${url}') format('opentype');font-weight:${weight};font-display:block}`).join('')}
html,body{font-family:${FONT}}
.__sendit_tap{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(25,31,40,.22);border:2px solid rgba(255,255,255,.95);box-shadow:0 2px 10px rgba(25,31,40,.25);pointer-events:none;z-index:2147483647;animation:__sendit_tap .55s ease-out forwards}
@keyframes __sendit_tap{0%{transform:scale(.55);opacity:1}60%{transform:scale(1);opacity:.9}100%{transform:scale(1.15);opacity:0}}`;
  const ready = () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    document.querySelectorAll('[style*="system-ui"]').forEach(fixInline);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'attributes') fixInline(m.target);
        else m.addedNodes.forEach((n) => n.nodeType === 1 && (fixInline(n), n.querySelectorAll?.('[style*="system-ui"]').forEach(fixInline)));
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
  // 맞춤법 검사 밑줄(빨간 물결)이 영상에 나오지 않게
  document.addEventListener('focusin', (e) => e.target instanceof HTMLElement && e.target.spellcheck && (e.target.spellcheck = false), true);
  globalThis.__senditTap = (x, y) => {
    const d = document.createElement('div');
    d.className = '__sendit_tap';
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 700);
  };
}

// ───────────── 녹화 ─────────────

async function startScreencast(page) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const recv = Date.now() / 1000;
    frames.push({ ts: metadata?.timestamp ?? recv, recv, jpg: Buffer.from(data, 'base64') });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VIEW.width * VIEW.scale, maxHeight: VIEW.height * VIEW.scale, everyNthFrame: 1 });
  return {
    async stop() {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await cdp.detach().catch(() => {});
      return frames;
    },
  };
}

const sleep = (page, ms) => page.waitForTimeout(ms);

/** 사람처럼 누르기 — 누를 곳에 동그란 터치 표시를 띄우고 잠깐 뒤에 누른다 */
async function tap(page, locator, { before = 160, after = 0, onTap } = {}) {
  await locator.waitFor({ state: 'visible', timeout: 15_000 });
  const b = await locator.boundingBox();
  if (!b) throw new Error('누를 곳이 화면에 없어요');
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.evaluate(([px, py]) => globalThis.__senditTap?.(px, py), [x, y]);
  await sleep(page, before);
  onTap?.();
  await page.mouse.click(x, y);
  if (after) await sleep(page, after);
}

/**
 * 목록을 부드럽게 굴린다. 대상은 selector 나 글(text, 정확히 같은 글의 맨 안쪽 요소).
 * align 'top': 대상 위쪽을 화면 top 에 맞춤 · 'into': 화면 [top, bottom] 밖에 있을 때만 들어오게
 */
async function smoothScrollTo(page, { selector, text, align = 'top', top = 122, bottom = VIEW.height - 190, ms = 900 }) {
  return page.evaluate(
    async ({ selector, text, align, top, bottom, ms }) => {
      const visible = (e) => e.getClientRects().length > 0;
      const el = selector
        ? [...document.querySelectorAll(selector)].find(visible)
        : [...document.querySelectorAll('div,span,h1,h2,h3')].find((e) => visible(e) && e.childElementCount === 0 && e.textContent.trim() === text);
      if (!el) return null;
      let box = el.parentElement;
      while (box && !(box.scrollHeight > box.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
      if (!box) return null;
      const r = el.getBoundingClientRect();
      let delta = 0;
      if (align === 'top') delta = r.top - top;
      else if (r.top < top) delta = r.top - top;
      else if (r.bottom > bottom) delta = r.bottom - bottom;
      const from = box.scrollTop;
      const to = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, from + delta));
      if (Math.abs(to - from) < 1) return 0;
      const t0 = performance.now();
      await new Promise((done) => {
        const step = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
          box.scrollTop = from + (to - from) * e;
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
      return to - from;
    },
    { selector, text, align, top, bottom, ms },
  );
}

/**
 * 실제 앱에서 한 장면을 녹화한다.
 * sc: { user: { name, gender, defaultTone, emoji, style }, name, gender, relationship, text (입력창에 칠 글), analysis (진짜 AI 결과), pick (고를 답장 0~2), waitMs? }
 * 돌려줌: { frames: [{ t (녹화 시작부터 초), jpg }], marks: { 장면 이름: t }, duration, request (앱이 실제로 만든 코칭 요청) }
 */
export async function recordApp(sc) {
  const { browser, base } = await openApp();
  const ctx = await browser.newContext({
    viewport: { width: VIEW.width, height: VIEW.height },
    deviceScaleFactor: VIEW.scale,
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  const errors = [];
  try {
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base }).catch(() => {});
    const faces = FONT_FACES.filter(([f]) => FONT_DIRS.some((d) => existsSync(path.join(d, f)))).map(([f, w]) => [`/__sendit_fonts/${f}`, w]);
    await ctx.addInitScript(initScript, { key: STORE_KEY, seed: JSON.stringify(seedState(sc)), inject: { analysis: sc.analysis, waitMs: sc.waitMs ?? 2000 }, faces });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/`, { waitUntil: 'load' });
    const plus = page.getByRole('button', { name: '새 채팅 시작' });
    await plus.waitFor({ state: 'visible', timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    // 글꼴이 Pretendard 로 바뀌었는지 (안 바뀌면 PC·CI 마다 글꼴이 달라진다 — 멈추지는 않고 알린다)
    const font = await page.evaluate(() => getComputedStyle(document.querySelector('h1') ?? document.body).fontFamily);
    if (!font.includes('SenditRec')) errors.push(`앱 글꼴을 Pretendard 로 못 바꿨어요 (${font})`);
    await sleep(page, 1200);

    const rec = await startScreencast(page);
    const marks = {};
    const taps = [];
    const t0 = Date.now() / 1000;
    const now = () => Date.now() / 1000 - t0;
    const mark = (k) => (marks[k] = now());
    const onTap = () => taps.push(now());
    const press = (loc, opts = {}) => tap(page, loc, { ...opts, onTap });
    mark('home');
    await sleep(page, 700);

    // ① 상대 만들기 (+ → 이름 · 성별 · 관계 → 채팅방 만들기)
    mark('form');
    await press(plus, { after: 900 });
    await press(page.locator('input[placeholder="예: 민지"]:visible').first(), { after: 150 });
    await page.keyboard.type(sc.name, { delay: 130 });
    await sleep(page, 250);
    if ((sc.gender ?? 'female') !== 'female') await press(page.getByRole('button', { name: GENDER_LABEL[sc.gender], exact: true }), { after: 300 });
    if ((sc.relationship ?? 'talking') !== 'talking') await press(page.getByRole('button', { name: new RegExp(`^[^가-힣]*${REL_LABEL[sc.relationship]}$`) }), { after: 300 });
    const create = page.getByRole('button', { name: '채팅방 만들기' });
    await create.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await sleep(page, 700);
    await press(create, { after: 1000 });

    // ② 받은 카톡 넣기 (입력창에 한 글자씩)
    mark('typing');
    await press(page.locator('textarea:visible').first(), { after: 250 });
    await page.keyboard.type(sc.text, { delay: 55 });
    mark('typed');
    await sleep(page, 450);
    await press(page.getByRole('button', { name: '코치에게 보내기' }));
    mark('sent');

    // ③ 분석 중 → 결과 (요약·관심 있을 가능성)
    await page.locator('[aria-label^="답장 1,"]:visible').first().waitFor({ state: 'visible', timeout: 30_000 });
    mark('result');
    const shown = await page.$$eval('[aria-label^="답장 "]', (els) => els.map((e) => e.getAttribute('aria-label')).filter((l) => /^답장 [0-9], /.test(l)));
    for (const [i, r] of sc.analysis.replies.slice(0, 3).entries()) {
      if (!shown.some((l) => l.startsWith(`답장 ${i + 1},`) && l.endsWith(r.text.trim()))) throw new Error(`화면의 답장 ${i + 1} 이 넣어 둔 결과와 달라요`);
    }
    if (/데모/.test(await page.evaluate(() => document.body.innerText))) throw new Error('화면에 데모 표시가 있어요 — 진짜 결과가 들어가지 않았어요');
    await sleep(page, 1700);

    // ④ 답장 3개가 보이게 굴리기 → 하나 골라 복사
    mark('scroll');
    await smoothScrollTo(page, { text: '이렇게 답장해 봐요', ms: 1100 });
    mark('replies');
    await sleep(page, 1600);
    const pick = Math.max(0, Math.min(2, sc.pick ?? 0));
    const copyBtn = page.getByRole('button', { name: `답장 ${pick + 1} 복사하기` });
    if (await smoothScrollTo(page, { selector: `[aria-label="답장 ${pick + 1} 복사하기"]`, align: 'into', ms: 600 })) await sleep(page, 300);
    mark('pick');
    await press(copyBtn, { before: 220, after: 1600 });
    mark('end');
    const raw = await rec.stop();
    const request = await page.evaluate(() => globalThis.__SENDIT_DEMO__?.request ?? null);
    if (!request) throw new Error('앱이 만든 요청을 못 읽었어요 — 결과가 주입되지 않았을 수 있어요');
    if (!raw.length) throw new Error('녹화된 프레임이 없어요');
    // 프레임 시각(브라우저) → 녹화 시작 기준 초. 브라우저 시각이 받은 시각과 크게 다르면 받은 시각 기준으로 옮긴다
    const lag = raw.map((f) => f.recv - f.ts).sort((x, y) => x - y)[raw.length >> 1];
    const fix = Math.abs(lag) > 1 ? lag : 0;
    const frames = raw.map((f) => ({ t: Math.max(0, f.ts + fix - t0), jpg: f.jpg }));
    return { frames, marks, taps, duration: marks.end, request, errors };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** 디버그: 프레임을 폴더에 jpg 로 */
export function dumpFrames(frames, dir) {
  mkdirSync(dir, { recursive: true });
  frames.forEach((f, i) => writeFileSync(path.join(dir, `${String(i).padStart(4, '0')}_${f.t.toFixed(3)}.jpg`), f.jpg));
}
