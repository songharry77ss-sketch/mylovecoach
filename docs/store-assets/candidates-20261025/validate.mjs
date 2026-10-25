// Independent DOM validation. Does not render or modify any PNG.
import { chromium } from 'file:///C:/Users/shsop/mylovecoach-codex-tools/node_modules/playwright-core/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const base = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(base, 'manifest.json'), 'utf8'));
const originalDir = path.resolve(base, '..', 'ios-6.7');
const allowedSources = Object.keys(manifest.sources).map(name => pathToFileURL(path.join(originalDir, name + '.png')).href);
const report = { checkedAt: new Date().toISOString(), checks: [], sourceHashes: {}, errors: [], limitations: ['DOM checks do not substitute for visual inspection of faces, compositing, thumbnail readability or photographic contrast.'] };
for (const [name, expected] of Object.entries(manifest.sources)) {
  const actual = createHash('sha256').update(await readFile(path.join(originalDir, name + '.png'))).digest('hex');
  report.sourceHashes[name] = { expected, actual, matches: actual === expected };
  if (actual !== expected) report.errors.push('Source hash changed: ' + name);
}
const jobs = manifest.jobs.filter(job => /^[PSN]-[1-6]\.html$/i.test(path.basename(job[0])));
let browser;
try {
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  for (const [html, output, width, height] of jobs) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const loadErrors = [];
    page.on('pageerror', error => loadErrors.push(error.message));
    page.on('requestfailed', request => loadErrors.push(request.url() + ': ' + request.failure()?.errorText));
    await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const data = await page.evaluate(({ allowedSources }) => {
      const rect = element => { if (!element) return null; const r = element.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
      const textRect = element => { const r = document.createRange(); r.selectNodeContents(element); const b = r.getBoundingClientRect(); return { left:b.left, top:b.top, right:b.right, bottom:b.bottom, width:b.width, height:b.height }; };
      const stage = document.querySelector('.stage');
      const h1 = document.querySelector('h1');
      const lines = [...h1.querySelectorAll(':scope > span')].map(el => ({text:el.textContent, chars:[...el.textContent].length, bounds:textRect(el)}));
      const images = [...document.images].map(img => ({src:img.currentSrc || img.src, loaded:img.complete && img.naturalWidth > 0, naturalWidth:img.naturalWidth, naturalHeight:img.naturalHeight}));
      const sourceImgs = [...document.querySelectorAll('.screen > img, .card img, .input-card img')];
      const cards = [...document.querySelectorAll('.card, .input-card')].map(el => ({imageCount:el.querySelectorAll('img').length, renderedText:el.textContent.trim(), allowedElements:[...el.querySelectorAll('*')].every(child => ['DIV','IMG'].includes(child.tagName)), bounds:rect(el)}));
      const css = getComputedStyle(h1);
      const fontFaces = [...document.fonts].map(face => ({family:face.family,weight:face.weight,status:face.status}));
      return {viewport:{width:innerWidth,height:innerHeight}, designScale:innerWidth/1290, stage:rect(stage), header:rect(document.querySelector('header')), brand:rect(document.querySelector('.brand')), footer:rect(document.querySelector('.footer')), phone:rect(document.querySelector('.phone')), feature:rect(document.querySelector('.feature')), headline:{fontFamily:css.fontFamily,fontSize:parseFloat(css.fontSize),fontWeight:css.fontWeight,lines}, subtitle:{fontSize:parseFloat(getComputedStyle(document.querySelector('.sub')).fontSize),bounds:textRect(document.querySelector('.sub'))}, fonts:{bold:document.fonts.check('700 138px Pretendard'), medium:document.fonts.check('500 48px Pretendard'), faces:fontFaces}, images, cards, appImages:sourceImgs.map(img => ({src:img.src,allowed:allowedSources.includes(img.src)})), actualAppPixelsPresent:sourceImgs.length >= 2, cardPixelsOnly:cards.every(card => card.imageCount === 1 && card.renderedText === '' && card.allowedElements)};
    }, { allowedSources });
    const errors = [...loadErrors];
    const eps = 0.5;
    const inside = r => r.left >= -eps && r.top >= -eps && r.right <= width + eps && r.bottom <= height + eps;
    if (data.images.some(image => !image.loaded)) errors.push('Some images did not load');
    if (!data.fonts.bold || !data.fonts.medium || data.fonts.faces.some(face => face.family === 'Pretendard' && face.status !== 'loaded')) errors.push('Pretendard faces not ready');
    if (!data.headline.fontFamily.includes('Pretendard')) errors.push('Headline font is not Pretendard');
    if (data.headline.fontSize < 130 || data.headline.fontSize > 150) errors.push('Headline design size is outside 130–150 px');
    if (data.headline.lines.length !== 2) errors.push('Headline must have two lines');
    for (const line of data.headline.lines) {
      if (!inside(line.bounds)) errors.push('Headline text overflow: ' + line.text);
      if (line.chars > 14) errors.push('Headline over 14 characters: ' + line.text);
    }
    if (data.header.top < 150 - eps || data.brand.top < 150 - eps) errors.push('Header/brand violates top 150 px safe area');
    if (data.header.bottom > height * 0.3 + eps) errors.push('Header extends below top 30%');
    if (!inside(data.subtitle.bounds)) errors.push('Subtitle text overflow');
    if (data.footer.bottom > height - 120 + eps || !inside(data.footer)) errors.push('Footer violates bottom 120 px safe area');
    data.phone.heightRatio = data.phone.height / height;
    if (data.phone.heightRatio < 0.5 || data.phone.heightRatio > 0.65) errors.push('Transformed phone height outside 50–65%: ' + data.phone.heightRatio);
    if (data.phone.top < 150 - eps || data.phone.bottom > height - 120 + eps) errors.push('Transformed phone violates top 150/bottom 120 px safe areas');
    if (!data.actualAppPixelsPresent || !data.cardPixelsOnly || data.appImages.some(img => !img.allowed)) errors.push('App content must use original capture images only');
    const item = {file:path.basename(html),format:path.basename(output).startsWith('play-')?'Play':'iOS',...data,errors,passed:errors.length===0};
    report.checks.push(item);
    report.errors.push(...errors.map(error => item.file + ' ' + item.format + ': ' + error));
    await page.close();
  }
} catch (error) {
  report.errors.push(error.stack || String(error));
} finally {
  if (browser) await browser.close();
}
report.summary = {expected:36,checked:report.checks.length,passed:report.checks.filter(check => check.passed).length,errorCount:report.errors.length,allPassed:report.checks.length===36 && report.errors.length===0};
await writeFile(path.join(base,'validation-layout.json'),JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify(report.summary));
for (const error of report.errors) console.log(error);
if (!report.summary.allPassed) process.exitCode = 1;
