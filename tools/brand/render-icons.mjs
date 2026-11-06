// 센딧 아이콘 PNG 를 규격별로 뽑는다: node tools/brand/render-icons.mjs
// 원본은 tools/brand/icon.html (벡터). playwright-core 는 C:\Users\shsop\mylovecoach-codex-tools 의 것을 쓴다.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire('C:/Users/shsop/mylovecoach-codex-tools/package.json');
const { chromium } = require('playwright-core');

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'assets', 'images');
const src = pathToFileURL(join(here, 'icon.html')).href;

const JOBS = [
  { v: 'icon', file: 'icon.png', size: 1024, opaque: true },
  { v: 'bg', file: 'android-icon-background.png', size: 1024, opaque: true },
  { v: 'fg', file: 'android-icon-foreground.png', size: 1024 },
  { v: 'mono', file: 'android-icon-monochrome.png', size: 1024 },
  { v: 'splash', file: 'splash-icon.png', size: 512 },
  { v: 'rounded', file: 'sendit-mark.png', size: 512 },
];

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  for (const job of JOBS) {
    const page = await browser.newPage({ viewport: { width: job.size, height: job.size }, deviceScaleFactor: 1 });
    await page.goto(`${src}?v=${job.v}`, { waitUntil: 'load' });
    await page.screenshot({ path: join(out, job.file), omitBackground: !job.opaque });
    await page.close();
    console.log('ok', job.file, job.size);
  }
} finally {
  await browser.close();
}
// 아주 작은 창은 헤드리스 Edge 가 찍지 못해 512 를 줄여 favicon 을 만든다
const { execFileSync } = await import('node:child_process');
execFileSync('python', ['-c', `from PIL import Image; Image.open(r"${join(out, 'sendit-mark.png')}").resize((64, 64), Image.LANCZOS).save(r"${join(out, 'favicon.png')}")`]);
console.log('ok favicon.png 64');
