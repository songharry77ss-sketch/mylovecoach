// Layout QA only. Intentional collage overlaps are recorded, never rejected.
// Run: node docs/store-assets/candidates-20261025-v3/validate.mjs
import { chromium } from 'file:///C:/Users/shsop/mylovecoach-codex-tools/node_modules/playwright-core/index.mjs';
import { access, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const output = join(base, 'validation-layout.json');
const expectedPhoneCounts = [1, 0, 0, 2, 0, 0];
const formats = [
  { name: 'ios', width: 1290, height: 2796 },
  { name: 'play', width: 1242, height: 2208 },
];
const report = {
  generatedAt: new Date().toISOString(),
  coordinateSystem: '1290px-wide stage; CSS transforms removed from recorded stage bounds',
  requirements: { minimumHeadingFontSize: 130, safeTop: 150, safeBottom: 120, expectedPhoneCounts },
  notes: ['Overlaps are intentional design choices and are recorded without an overlap failure.'],
  checks: [],
  errors: [],
};

let browser;
try {
  for (let number = 1; number <= 6; number += 1) {
    await access(join(base, 'html', `S2-${number}.html`));
  }
  browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  for (const format of formats) {
    for (let number = 1; number <= 6; number += 1) {
      const page = await browser.newPage({ viewport: { width: format.width, height: format.height }, deviceScaleFactor: 1 });
      const consoleErrors = [];
      const pageErrors = [];
      const requestErrors = [];
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('requestfailed', request => requestErrors.push({ url: request.url(), error: request.failure()?.errorText }));
      const check = { slide: number, format: format.name, viewport: { width: format.width, height: format.height }, failures: [] };
      try {
        await page.goto(pathToFileURL(join(base, 'html', `S2-${number}.html`)).href, { waitUntil: 'networkidle' });
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.allSettled([...document.images].map(img => img.decode()));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        Object.assign(check, await page.evaluate(() => {
          const round = value => Math.round(value * 100) / 100;
          const stage = document.querySelector('.stage');
          if (!stage) return { evaluationError: 'Missing .stage element.' };
          const stageRect = stage.getBoundingClientRect();
          const stageStyle = getComputedStyle(stage);
          const stageWidth = parseFloat(stageStyle.width);
          const stageHeight = parseFloat(stageStyle.height);
          const scaleX = stageRect.width / stageWidth;
          const scaleY = stageRect.height / stageHeight;
          const normalizedRect = rect => ({
            left: round((rect.left - stageRect.left) / scaleX),
            top: round((rect.top - stageRect.top) / scaleY),
            right: round((rect.right - stageRect.left) / scaleX),
            bottom: round((rect.bottom - stageRect.top) / scaleY),
            width: round(rect.width / scaleX),
            height: round(rect.height / scaleY),
          });
          const isVisible = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
          };
          const describe = element => ({
            tag: element.tagName.toLowerCase(),
            id: element.id || null,
            class: element.getAttribute('class') || null,
            safe: element.hasAttribute('data-safe') ? element.getAttribute('data-safe') : null,
            text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 220),
            visible: isVisible(element),
            bounds: normalizedRect(element.getBoundingClientRect()),
          });
          const headings = [...document.querySelectorAll('h1')].map(heading => {
            const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
            const textFragments = [];
            while (walker.nextNode()) {
              const node = walker.currentNode;
              if (!node.textContent.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              for (const rect of range.getClientRects()) {
                if (rect.width && rect.height) textFragments.push({ text: node.textContent.trim(), bounds: normalizedRect(rect) });
              }
            }
            return { ...describe(heading), fontFamily: getComputedStyle(heading).fontFamily, fontSize: parseFloat(getComputedStyle(heading).fontSize), textFragments };
          });
          const images = [...document.images].map(img => ({
            src: img.currentSrc || img.src,
            alt: img.alt,
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            loaded: img.complete && img.naturalWidth > 0 && img.naturalHeight > 0,
          }));
          const selectors = '.phone,.portrait,.tile,.feature,.number,.bubble,.photo,.polaroid,.gauge,.sticker,.brand,.footer,header,h1,[data-safe]';
          const bounds = [...document.querySelectorAll(selectors)].map(describe);
          const safeElements = [...document.querySelectorAll('[data-safe]')].filter(isVisible).map(describe);
          const phoneElements = [...document.querySelectorAll('.phone')].filter(isVisible).map(describe);
          return {
            stage: { width: round(stageWidth), height: round(stageHeight), scaleX, scaleY, viewportBounds: { left: round(stageRect.left), top: round(stageRect.top), right: round(stageRect.right), bottom: round(stageRect.bottom) } },
            fonts: { status: document.fonts.status, pretendardBoldReady: document.fonts.check('700 130px Pretendard'), faces: [...document.fonts].map(font => ({ family: font.family, weight: font.weight, status: font.status })) },
            headings,
            images,
            safeElements,
            phoneCount: phoneElements.length,
            phoneElements,
            bounds,
          };
        }));
        if (check.evaluationError) {
          check.failures.push(check.evaluationError);
        } else {
          const tolerance = 1;
          if (Math.abs(check.stage.width - 1290) > tolerance) check.failures.push(`Stage width is ${check.stage.width}; expected 1290.`);
          if (Math.abs(check.stage.viewportBounds.left) > tolerance || Math.abs(check.stage.viewportBounds.top) > tolerance || Math.abs(check.stage.viewportBounds.right - format.width) > tolerance || Math.abs(check.stage.viewportBounds.bottom - format.height) > tolerance) {
            check.failures.push('Stage does not cover the output viewport exactly.');
          }
          if (check.fonts.status !== 'loaded' || !check.fonts.pretendardBoldReady || check.fonts.faces.some(font => font.status === 'error')) check.failures.push('Font loading is incomplete or failed.');
          if (!check.headings.length) check.failures.push('No h1 heading found.');
          for (const heading of check.headings) {
            if (heading.fontSize < 130) check.failures.push(`Heading font size ${heading.fontSize}px is below 130px.`);
            for (const fragment of heading.textFragments) {
              const b = fragment.bounds;
              if (b.left < -tolerance || b.top < -tolerance || b.right > check.stage.width + tolerance || b.bottom > check.stage.height + tolerance) check.failures.push(`Heading text leaves canvas: ${fragment.text}`);
            }
          }
          if (check.images.some(img => !img.loaded)) check.failures.push('One or more images failed to load.');
          if (!check.safeElements.length) check.failures.push('No visible [data-safe] elements found for safe-area verification.');
          for (const element of check.safeElements) {
            if (element.bounds.top < 150 - tolerance || element.bounds.bottom > check.stage.height - 120 + tolerance) check.failures.push(`Safe-area violation: ${element.tag}.${element.class || ''} (${element.bounds.top}–${element.bounds.bottom}).`);
          }
          if (check.phoneCount !== expectedPhoneCounts[number - 1]) check.failures.push(`Visible phone count ${check.phoneCount}; expected ${expectedPhoneCounts[number - 1]}.`);
        }
      } catch (error) {
        check.failures.push(error.stack || String(error));
      } finally {
        check.consoleErrors = consoleErrors;
        check.pageErrors = pageErrors;
        check.requestErrors = requestErrors;
        if (consoleErrors.length) check.failures.push('Browser console contains errors.');
        if (pageErrors.length) check.failures.push('Browser page contains JavaScript errors.');
        if (requestErrors.length) check.failures.push('One or more resource requests failed.');
        check.passed = check.failures.length === 0;
        report.checks.push(check);
        await page.close();
        console.log(`${check.passed ? 'PASS' : 'FAIL'} ${format.name} S2-${number}${check.failures.length ? `: ${check.failures.join(' | ')}` : ''}`);
      }
    }
  }
} catch (error) {
  report.errors.push(error.stack || String(error));
} finally {
  if (browser) await browser.close();
  report.passed = report.errors.length === 0 && report.checks.length === 12 && report.checks.every(check => check.passed);
  report.summary = { passed: report.checks.filter(check => check.passed).length, failed: report.checks.filter(check => !check.passed).length, expectedChecks: 12 };
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`${report.passed ? 'PASS' : 'FAIL'} layout validation; ${report.summary.passed}/12 cases passed; ${output}`);
  if (report.errors.length) console.error(report.errors.join('\n'));
  process.exitCode = report.passed ? 0 : 1;
}
