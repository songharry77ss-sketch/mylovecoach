import { chromium } from 'file:///C:/Users/shsop/mylovecoach-codex-tools/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const results=[];
try {
 for(const [file,w,h] of [['screen-1-home',1179,2556],['screen-2-result',1179,2556],['screen-3-kkti',1179,2556],['store-1',1290,2796],['board',2400,1350]]) {
  const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(dir,file+'.html')).href,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  const report=await page.evaluate(()=>{
   const box=e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),bottom:Math.round(r.bottom)}};
   const texts=[...document.querySelectorAll('body *')].filter(e=>e.childNodes.length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
   const scale=document.querySelector('.artboard').classList.contains('board')?2:3;
   return {
    fontsLoaded:document.fonts.check('700 20px P')&&document.fonts.check('500 20px P'),
    minTextPx:Math.min(...texts.map(e=>parseFloat(getComputedStyle(e).fontSize)*scale)),
    buttons:[...document.querySelectorAll('button')].map(e=>({label:e.textContent.trim()||e.getAttribute('aria-label'),...box(e)})),
    images:[...document.images].map(e=>({src:e.getAttribute('src'),loaded:e.complete&&e.naturalWidth>0})),
    textOutsideCanvas:texts.filter(e=>{const r=e.getBoundingClientRect();return r.x<0||r.right>innerWidth+1||r.y<0||r.bottom>innerHeight+1}).map(e=>e.textContent.trim()),
    sections:[...document.querySelectorAll('.recent,.tabbar,.temperature,.store-ui,.store-bottom,.device,.plan-features,.pay-action')].map(e=>({class:e.className,...box(e)}))
   };
  });
  results.push({file,...report}); await page.close();
 }
 const lum=hex=>{const c=hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 const contrast=(a,b)=>{const x=lum(a),y=lum(b);return +((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
 const contrastPairs=[['191F28','FFFFFF'],['626B78','FFFFFF'],['626B78','F2F4F6'],['5B47FF','FFFFFF'],['5B47FF','F0EEFF'],['626B78','F5F3FF']].map(([fg,bg])=>({fg:'#'+fg,bg:'#'+bg,ratio:contrast(fg,bg)}));
 const pngs=['icon','store-1','screen-1-home','screen-2-result','screen-3-kkti','board'].filter(f=>fs.existsSync(path.join(dir,f+'.png'))).map(f=>{const bytes=fs.readFileSync(path.join(dir,f+'.png'));return{file:f+'.png',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}});
 const result={results,contrastPairs,pngs};fs.writeFileSync(path.join(dir,'qa-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close()}
