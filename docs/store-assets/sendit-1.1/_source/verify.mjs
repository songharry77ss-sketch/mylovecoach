import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const here=path.dirname(fileURLToPath(import.meta.url)), out=path.dirname(here);
const require=createRequire('C:/Users/shsop/mylovecoach-codex-tools/package.json');
const {chromium}=require('playwright-core');
const manifest=JSON.parse(await fs.readFile(path.join(here,'manifest.json'),'utf8'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const results=[];
try{
for(const job of manifest.jobs){
  const png=await fs.readFile(job.png);
  const dimensions={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
  const page=await browser.newPage({viewport:{width:job.width,height:job.height},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(job.html).href,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  const dom=await page.evaluate(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
    const texts=[...document.querySelectorAll('.line,.subtitle,.badge,.brand,.folio,.title,.sub')].map(e=>{
      const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect();const c=getComputedStyle(e);
      return {selector:e.className,text:e.textContent.trim(),x:r.x,y:r.y,right:r.right,bottom:r.bottom,fontSize:parseFloat(c.fontSize),font:c.fontFamily,weight:c.fontWeight,color:c.color};
    });
    const screen=document.querySelector('.screen img'),phone=document.querySelector('.phone');
    const screenBox=screen?box(screen):null;
    return {fonts:[...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status})),texts,images:[...document.images].map(e=>({src:e.src.split('/').pop(),loaded:e.complete&&e.naturalWidth>0,natural:[e.naturalWidth,e.naturalHeight],rendered:box(e)})),screen:screenBox,phone:phone?box(phone):null,viewport:{width:innerWidth,height:innerHeight}};
  });
  const checks={dimensions:dimensions.width===job.width&&dimensions.height===job.height,loadedImages:dom.images.every(i=>i.loaded),fontsLoaded:job.board||dom.fonts.length===2&&dom.fonts.every(f=>f.status==='loaded'),textInsideCanvas:dom.texts.every(t=>t.x>=0&&t.y>=0&&t.right<=job.width&&t.bottom<=job.height),headlinesIn80Percent:dom.texts.filter(t=>t.selector==='line').every(t=>t.right-t.x<=job.width*.8),noScriptErrors:errors.length===0};
  if(!job.board && !job.html.endsWith('feature.html')){
    const screen=dom.images.find(i=>['home.png','replies.png','mind.png','memory.png','report.png','explore.png'].includes(i.src));
    checks.screenRatio=Math.abs(screen.rendered.width/screen.rendered.height-screen.natural[0]/screen.natural[1])<.00001;
    checks.topSafeMargin=dom.texts.find(t=>t.selector==='brand').y>=160;
    if(job.html.includes('6-explore')){const pinkTop=dom.screen.y+1570*dom.screen.width/1290;checks.pinkBalloonBelowCanvas=pinkTop>job.height;}
  }
  results.push({file:path.relative(out,job.png),dimensions,checks,details:dom,errors});await page.close();
}
}finally{await browser.close()}
const rawUnchanged={};for(const [name,expected] of Object.entries(manifest.sourceHashes)){const bytes=await fs.readFile(path.join(out,'raw',name));rawUnchanged[name]=createHash('sha256').update(bytes).digest('hex')===expected;}
const failed=results.flatMap(r=>Object.entries(r.checks).filter(([k,v])=>!v).map(([k])=>`${r.file}: ${k}`));
if(Object.values(rawUnchanged).some(v=>!v))failed.push('Raw screenshots changed');
await fs.writeFile(path.join(out,'qa-report.json'),JSON.stringify({passed:failed.length===0,failed,rawUnchanged,results},null,2));
console.log(JSON.stringify({passed:failed.length===0,files:results.length,rawUnchanged,failed},null,2));
if(failed.length)process.exitCode=1;
