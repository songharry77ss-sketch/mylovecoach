import { chromium } from 'file:///C:/Users/shsop/mylovecoach-codex-tools/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const qa=path.join(dir,'qa'); fs.mkdirSync(qa,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const results=[];
try {
  for(const [name,width,height] of [['screen-1-home',1179,2556],['screen-2-result',1179,2556],['screen-3-kkti',1179,2556],['store-1',1290,2796],['board',2400,1350]]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(dir,name+'.html')).href,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    const report=await page.evaluate(()=>{
      const box=r=>({x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom});
      const walk=document.createTreeWalker(document.querySelector('.canvas'),NodeFilter.SHOW_TEXT);
      const text=[];
      while(walk.nextNode()){
        const n=walk.currentNode,p=n.parentElement,s=getComputedStyle(p);
        if(!n.textContent.trim()||['SCRIPT','STYLE'].includes(p.tagName)||s.display==='none')continue;
        const r=document.createRange();r.selectNodeContents(n);
        text.push({text:n.textContent.trim(),fontPx:parseFloat(s.fontSize),color:s.color,rects:[...r.getClientRects()].map(box)});
      }
      return {
        fontsLoaded:document.fonts.check('700 20px P')&&document.fonts.check('500 20px P'),
        minTextPx:Math.min(...text.map(t=>t.fontPx)),
        textOutsideCanvas:text.filter(t=>t.rects.some(r=>r.x<-.5||r.right>innerWidth+.5||r.y<-.5||r.bottom>innerHeight+.5)),
        buttons:[...document.querySelectorAll('button')].map(e=>({label:e.textContent.trim()||e.getAttribute('aria-label'),...box(e.getBoundingClientRect())})),
        images:[...document.images].map(e=>({src:e.getAttribute('src'),loaded:e.complete&&e.naturalWidth>0})),
        glass:[...document.querySelectorAll('.glass')].map(e=>({class:e.className,fill:getComputedStyle(e).backgroundColor,filter:getComputedStyle(e).backdropFilter})),
        text,
      };
    });
    // Keep only ink invisible to measure the composited photographic background beneath it.
    await page.addStyleTag({content:'*{color:transparent!important;text-shadow:none!important}'});
    await page.screenshot({path:path.join(qa,name+'-background.png')});
    results.push({name,width,height,errors,...report});
    await page.close();
  }
  const pngs=['icon','store-1','screen-1-home','screen-2-result','screen-3-kkti','board'].map(name=>{
    const b=fs.readFileSync(path.join(dir,name+'.png'));
    return {file:name+'.png',width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
  });
  fs.writeFileSync(path.join(qa,'layout-report.json'),JSON.stringify({results,pngs},null,2));
  console.log(JSON.stringify({screens:results.map(({name,fontsLoaded,minTextPx,textOutsideCanvas,buttons,images,errors})=>({name,fontsLoaded,minTextPx,overflow:textOutsideCanvas.length,minButtonHeight:buttons.length?Math.min(...buttons.map(b=>b.height)):null,allImagesLoaded:images.every(i=>i.loaded),errors})),pngs},null,2));
}finally{await browser.close()}
