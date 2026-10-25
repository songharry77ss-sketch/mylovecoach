// Actual composited-background contrast audit. QA screenshots are temporary only.
import { chromium } from 'file:///C:/Users/shsop/mylovecoach-codex-tools/node_modules/playwright-core/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const base=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));
const jobs=manifest.jobs.filter(job=>/^[PSN]-[1-6]\.html$/i.test(path.basename(job[0])));
const report={checkedAt:new Date().toISOString(),method:'Hide header and brand, screenshot each original text-range rectangle, then calculate minimum WCAG contrast against every actual composited background pixel. Full span tests include emphasized run; emphasis also tested separately. Antialiasing and text shadows excluded.',checks:[],temporaryFiles:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
  for(const [html,output,width,height] of jobs){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.goto(pathToFileURL(html).href,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    const fields=await page.evaluate(()=>[...document.querySelectorAll('h1 > span, h1 em, .sub')].map((el,i)=>{const range=document.createRange();range.selectNodeContents(el);const r=range.getBoundingClientRect();return {index:i,text:el.textContent,selector:el.tagName.toLowerCase()+'.'+el.className,color:getComputedStyle(el).color,rect:{x:Math.floor(r.left),y:Math.floor(r.top),width:Math.ceil(r.right)-Math.floor(r.left),height:Math.ceil(r.bottom)-Math.floor(r.top)}}}));
    await page.addStyleTag({content:'header,.brand{visibility:hidden!important}'});
    const format=path.basename(output).startsWith('play-')?'Play':'iOS';
    for(const field of fields){
      const png=path.join(base,`_qa-contrast-${path.basename(html,'.html')}-${format}-${field.index}.png`);
      await page.screenshot({path:png,clip:field.rect});
      report.temporaryFiles.push(png);
      report.checks.push({file:path.basename(html),format,...field,png});
    }
    await page.close();
  }
} finally {await browser.close();}
const reportPath=path.join(base,'validation-contrast.json');
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
const result=spawnSync('python',[path.join(base,'contrast_audit.py'),reportPath],{encoding:'utf8'});
if(result.stdout)console.log(result.stdout.trim());
if(result.stderr)console.error(result.stderr.trim());
process.exitCode=result.status??1;
