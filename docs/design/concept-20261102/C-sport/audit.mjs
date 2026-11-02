import { chromium } from 'file:///C:/Users/shsop/mylovecoach-codex-tools/node_modules/playwright-core/index.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const dir=path.dirname(fileURLToPath(import.meta.url));
const names=['screen-1-home','screen-2-result','screen-3-kkti'];
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const report={screens:[],sizes:[],contrast:[]};
try{
for(const name of names){
 const page=await browser.newPage({viewport:{width:1179,height:2556},deviceScaleFactor:1});
 await page.goto(pathToFileURL(path.join(dir,name+'.html')).href,{waitUntil:'networkidle'});
 await page.evaluate(()=>document.fonts.ready);
 const metrics=await page.evaluate(()=>{
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;const text=[];const overflow=[];
  while(node=walker.nextNode()){
   if(!node.textContent.trim()||node.parentElement.closest('script,style'))continue;
   const parent=node.parentElement,style=getComputedStyle(parent),r=document.createRange();r.selectNodeContents(node);
   const boxes=[...r.getClientRects()];
   text.push({text:node.textContent.trim(),font:parseFloat(style.fontSize)});
   if(boxes.some(b=>b.left<-.5||b.top<-.5||b.right>1179.5||b.bottom>2556.5))overflow.push(node.textContent.trim());
  }
  return {fontLoaded:document.fonts.check('500 32px P')&&document.fonts.check('700 32px P'),minTextPx:Math.min(...text.map(n=>n.font)),smallText:text.filter(n=>n.font<26),textOutsideViewport:overflow,buttonHeights:[...document.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label')||b.textContent.trim(),height:b.getBoundingClientRect().height})),images:[...document.images].map(i=>({src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0})),replyCardCount:document.querySelectorAll('.reply-card').length,kktiStatCount:document.querySelectorAll('.stat').length};
 });
 report.screens.push({name,...metrics});await page.close();
}
}finally{await browser.close()}
for(const [name,w,h] of [['icon',1024,1024],...names.map(n=>[n,1179,2556]),['board',2400,1350]]){
 const png=readFileSync(path.join(dir,name+'.png'));const actual=[png.readUInt32BE(16),png.readUInt32BE(20)];report.sizes.push({name,actual,expected:[w,h],pass:actual[0]===w&&actual[1]===h});
}
function lum(hex){const s=hex.replace('#','');const rgb=[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]}
for(const [fg,bg] of [['#101410','#FFFFFF'],['#555D55','#FFFFFF'],['#555D55','#F3F5F0'],['#101410','#C5FF32'],['#DAE2D5','#101410'],['#48563C','#E9EFE0']]){const a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);report.contrast.push({foreground:fg,background:bg,ratio:+ratio.toFixed(2),pass:ratio>=4.5})}
report.pass=report.sizes.every(s=>s.pass)&&report.contrast.every(c=>c.pass)&&report.screens.every(s=>s.fontLoaded&&s.minTextPx>=26&&s.textOutsideViewport.length===0&&s.buttonHeights.every(b=>b.height>=120)&&s.images.every(i=>i.loaded));
writeFileSync(path.join(dir,'qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
