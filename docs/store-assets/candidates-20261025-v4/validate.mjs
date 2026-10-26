// Read-only browser QA of the v4 HTMLs. Final artwork is rendered by render.mjs.
import { chromium } from 'file:///C:/Users/shsop/mylovecoach-codex-tools/node_modules/playwright-core/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const base = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(base, 'manifest.json'), 'utf8'));
const jobs = manifest.jobs.filter(job => /^P2-[1-6]\.html$/i.test(path.basename(job[0])));
const originalDir = path.resolve(base, '..', 'ios-6.7');
const allowed = Object.keys(manifest.sources).map(stem => pathToFileURL(path.join(originalDir, stem + '.png')).href);
const report = { checkedAt: new Date().toISOString(), sourceHashes: [], checks: [], errors: [], limitations: ['Layout and source checks supplement manual visual review of photos, composition and 230 px thumbnail readability.'] };
const contrast = { checkedAt: report.checkedAt, method: 'Measure each visible text-node rectangle against every composited background pixel with audited text made transparent. Text shadows and antialiasing are excluded. Conservative rectangles include spaces between glyphs. Rotated stickers use a black/white glyph mask to exclude exterior bounding-box corners, sampling only background pixels beneath the actual rotated text.', checks: [], errors: [] };
for (const [stem, expected] of Object.entries(manifest.sources)) {
  const actual = createHash('sha256').update(await readFile(path.join(originalDir, stem + '.png'))).digest('hex');
  report.sourceHashes.push({ stem, expected, actual, matches: expected === actual });
  if (expected !== actual) report.errors.push('Original screenshot changed: ' + stem);
}
const qa = path.join(base, '_qa');
await mkdir(qa, {recursive:true});
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true});
try {
  for (const [html, output, width, height] of jobs) {
    const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('requestfailed', req => errors.push(req.url() + ': ' + req.failure()?.errorText));
    await page.goto(pathToFileURL(html).href, {waitUntil:'networkidle'});
    await page.evaluate(() => document.fonts.ready);
    const data = await page.evaluate(({allowed}) => {
      const rect = el => { if (!el) return null; const r=el.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
      const textRect = el => { const r=document.createRange(); r.selectNodeContents(el); const b=r.getBoundingClientRect(); return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}; };
      const h1=document.querySelector('h1');
      const css=getComputedStyle(h1);
      const appImages=[...document.querySelectorAll('.crop img,.screen>img,[data-app]')].filter(el=>el.tagName==='IMG');
      const cards=[...document.querySelectorAll('.crop')];
      const auditSelector='[data-contrast],h1>span,h1 em,.sub,.stat,.sticker';
      const auditEls=[...document.querySelectorAll(auditSelector)];
      const fields=[];
      const seen=new Set();
      for (const el of auditEls) {
        const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()) {
          const node=walker.currentNode;
          if(seen.has(node)||!node.textContent.trim()) continue;
          seen.add(node);
          const p=node.parentElement;
          const cs=getComputedStyle(p);
          if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)===0) continue;
          const range=document.createRange(); range.selectNodeContents(node);
          for(const r of range.getClientRects()) {
            if(r.width<=0||r.height<=0)continue;
            const sticker=p.closest('.sticker');
            const masked=sticker&&getComputedStyle(sticker).transform!=='none';
            const qaNodeId=String(fields.length);
            if(masked)p.setAttribute('data-qa-text',qaNodeId);
            fields.push({text:node.textContent.trim(),selector:p.tagName.toLowerCase()+'.'+p.className,color:cs.color,masked:Boolean(masked),qaNodeId,rect:{x:Math.floor(r.left),y:Math.floor(r.top),width:Math.ceil(r.right)-Math.floor(r.left),height:Math.ceil(r.bottom)-Math.floor(r.top)}});
          }
        }
      }
      return {
        viewport:{width:innerWidth,height:innerHeight},scale:innerWidth/1290,
        stage:rect(document.querySelector('.stage')),brand:rect(document.querySelector('.brand')),header:rect(document.querySelector('header')),footer:rect(document.querySelector('.footer')),
        headline:{fontSize:parseFloat(css.fontSize),fontFamily:css.fontFamily,fontWeight:css.fontWeight,lines:[...h1.querySelectorAll(':scope>span')].map(el=>({text:el.textContent,bounds:textRect(el)}))},
        safe:[...document.querySelectorAll('[data-safe]')].map(el=>({selector:el.className,bounds:rect(el)})),
        fonts:[...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status})),
        images:[...document.images].map(img=>({src:img.src,loaded:img.complete&&img.naturalWidth>0,dimensions:[img.naturalWidth,img.naturalHeight]})),
        appImages:appImages.map(img=>({src:img.src,allowed:allowed.includes(img.src)})),
        crops:cards.map(el=>({images:el.querySelectorAll('img').length,text:el.textContent.trim(),pixelOnly:[...el.querySelectorAll('*')].every(e=>['DIV','IMG'].includes(e.tagName))})),
        phones:document.querySelectorAll('.phone').length,fields,
      };
    },{allowed});
    const inside=r=>r&&r.left>=-0.5&&r.top>=-0.5&&r.right<=width+0.5&&r.bottom<=height+0.5;
    const safe=r=>inside(r)&&r.top>=149.5&&r.bottom<=height-119.5;
    if(data.images.some(i=>!i.loaded))errors.push('Image missing or unloaded');
    if(!data.fonts.some(f=>f.family==='Pretendard'&&f.status==='loaded')||data.fonts.some(f=>f.family==='Pretendard'&&f.status!=='loaded'))errors.push('Pretendard font not fully loaded');
    if(data.headline.fontSize<130||!data.headline.fontFamily.includes('Pretendard'))errors.push('Headline must be Pretendard at least 130 px at 1290 design width');
    if(data.headline.lines.length<2)errors.push('Expected at least two explicit headline lines');
    for(const line of data.headline.lines)if(!safe(line.bounds))errors.push('Headline outside safe area: '+line.text);
    for(const name of ['brand','footer'])if(!safe(data[name]))errors.push(name+' outside top 150/bottom 120 px safe area');
    for(const item of data.safe)if(!safe(item.bounds))errors.push(item.selector+' outside safe area');
    if(!data.appImages.length||data.appImages.some(i=>!i.allowed))errors.push('App imagery missing or not from original screenshot directory');
    if(data.crops.some(c=>c.images!==1||c.text!==''||!c.pixelOnly))errors.push('App crops must contain original image pixels only');
    const format=path.basename(output).startsWith('play-')?'Play':'iOS';
    const fields=data.fields;delete data.fields;
    report.checks.push({file:path.basename(html),format,...data,errors,passed:errors.length===0});
    report.errors.push(...errors.map(e=>path.basename(html)+' '+format+': '+e));
    await page.addStyleTag({content:'[data-contrast],[data-contrast] *,h1>span,h1>span *,.sub,.sub *,.stat,.stat *,.sticker,.sticker *{color:transparent!important;text-shadow:none!important;-webkit-text-stroke-color:transparent!important}'});
    for(let index=0;index<fields.length;index++){
      const field=fields[index];
      if(field.rect.x<0||field.rect.y<0||field.rect.x+field.rect.width>width||field.rect.y+field.rect.height>height){contrast.errors.push(`${path.basename(html)} ${format}: outside viewport ${field.text}`);continue;}
      const png=path.join(qa,`contrast-${path.basename(html,'.html')}-${format}-${index}.png`);
      await page.screenshot({path:png,clip:field.rect});
      if(field.masked){
        const maskFiles=[];
        for(const [label,color] of [['black','#000'],['white','#fff']]){
          await page.evaluate(({id,color})=>{const el=document.querySelector(`[data-qa-text="${id}"]`);el.style.setProperty('color',color,'important');},{id:field.qaNodeId,color});
          const maskFile=path.join(qa,`contrast-${path.basename(html,'.html')}-${format}-${index}-mask-${label}.png`);
          await page.screenshot({path:maskFile,clip:field.rect});
          maskFiles.push(maskFile);
        }
        await page.evaluate(id=>document.querySelector(`[data-qa-text="${id}"]`).style.setProperty('color','transparent','important'),field.qaNodeId);
        field.maskFiles=maskFiles;
      }
      contrast.checks.push({file:path.basename(html),format,...field,png});
    }
    await page.close();
  }
}finally{await browser.close();}
report.summary={expected:12,checked:report.checks.length,passed:report.checks.filter(c=>c.passed).length,errorCount:report.errors.length,allPassed:report.checks.length===12&&report.errors.length===0};
await writeFile(path.join(base,'validation-layout.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(path.join(base,'validation-contrast.json'),JSON.stringify(contrast,null,2)+'\n');
console.log('Layout',JSON.stringify(report.summary));
for(const e of report.errors)console.log(e);
const result=spawnSync('python',[path.join(base,'validate_contrast.py')],{encoding:'utf8'});
if(result.stdout)console.log(result.stdout.trim());
if(result.stderr)console.error(result.stderr.trim());
if(!report.summary.allPassed||result.status!==0)process.exitCode=1;
