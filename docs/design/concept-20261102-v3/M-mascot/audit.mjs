import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'file:///C:/Users/shsop/mylovecoach-codex-tools/node_modules/playwright-core/index.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const pages=[['screen-1-home',1179,2556],['screen-2-result',1179,2556],['screen-3-practice',1179,2556],['store-1',1290,2796],['board',2400,1350]];
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const result={pages:[],pngs:[],checks:[]};
try{
 for(const [name,width,height] of pages){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(dir,name+'.html')).href,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  const report=await page.evaluate(()=>{
   const scale=document.querySelector('.canvas').classList.contains('board')?1.5:3;
   const texts=[...document.querySelectorAll('.canvas *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
   const box=e=>{const r=e.getBoundingClientRect();return{x:+r.x.toFixed(1),y:+r.y.toFixed(1),width:+r.width.toFixed(1),height:+r.height.toFixed(1),right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1)}};
   const rgb=s=>{const m=s.match(/[\d.]+/g)?.map(Number);return m?[m[0],m[1],m[2],m[3]??1]:[255,255,255,0]};
   const blend=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])).concat([1]);
   const bg=e=>{if(!e)return[255,255,255,1];const c=rgb(getComputedStyle(e).backgroundColor);return c[3]===1?c:blend(c,bg(e.parentElement))};
   const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   const contrasts=texts.map(e=>{const foreground=rgb(getComputedStyle(e).color),background=bg(e),f=lum(foreground),b=lum(background);return{text:e.textContent.trim().slice(0,45),ratio:+((Math.max(f,b)+.05)/(Math.min(f,b)+.05)).toFixed(2)}});
   const app=document.querySelector('.app');
   return{
    fontLoaded:document.fonts.check('700 20px P')&&document.fonts.check('500 20px P'),
    minimumTextPx:Math.min(...texts.map(e=>parseFloat(getComputedStyle(e).fontSize)*scale)),
    minimumTextContrast:Math.min(...contrasts.map(v=>v.ratio)),
    contrastFailures:contrasts.filter(v=>v.ratio<4.5),
    missingImages:[...document.images].filter(e=>!e.complete||!e.naturalWidth).map(e=>e.src),
    appButtonsBelow120Px:app?[...app.querySelectorAll('button')].filter(e=>box(e).height<119.5).map(e=>({label:e.textContent||e.ariaLabel,...box(e)})):[],
    appTextOutsideCanvas:app?texts.filter(e=>{const r=box(e);return r.x<0||r.right>innerWidth+.5||r.y<0||r.bottom>innerHeight+.5}).map(e=>e.textContent):[],
    keyBounds:[...document.querySelectorAll('.mind>.mascot,.mind-stats,.feedback,.feedback-footer,.share-button,.composer,.reply,.temperature,.tabs,.device')].map(e=>({class:e.className,...box(e)}))
   };
  });
  result.pages.push({name,...report});await page.close();
 }
 for(const [name,w,h] of [['icon',1024,1024],...pages]){const b=fs.readFileSync(path.join(dir,name+'.png'));const width=b.readUInt32BE(16),height=b.readUInt32BE(20);result.pngs.push({file:name+'.png',width,height,correct:width===w&&height===h});}
 const practice=result.pages.find(p=>p.name==='screen-3-practice');
 const feedback=practice.keyBounds.find(e=>e.class==='feedback');const share=practice.keyBounds.find(e=>e.class==='share-button');const composer=practice.keyBounds.find(e=>e.class==='composer');
 result.checks.push({name:'Practice share button contained with bottom padding',pass:share.bottom+20<=feedback.bottom},{name:'Practice feedback clear of composer',pass:feedback.bottom+20<composer.y});
 result.pass=result.pages.every(p=>p.fontLoaded&&!p.missingImages.length&&!p.contrastFailures.length&&!p.appButtonsBelow120Px.length&&!p.appTextOutsideCanvas.length)&&(result.pages.filter(p=>p.name.startsWith('screen')).every(p=>p.minimumTextPx>=26))&&result.pngs.every(p=>p.correct)&&result.checks.every(c=>c.pass);
 fs.writeFileSync(path.join(dir,'qa-report.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({pass:result.pass,pages:result.pages.map(({keyBounds,...r})=>r),pngs:result.pngs,checks:result.checks},null,2));
}finally{await browser.close()}
