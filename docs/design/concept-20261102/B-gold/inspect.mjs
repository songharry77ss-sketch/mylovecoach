// Local-only render QA: images, font sizes, control sizes, content bounds, palette contrast.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const require=createRequire('C:/Users/shsop/mylovecoach-codex-tools/package.json');
const {chromium}=require('playwright-core');
const dir=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const report={};
try{
 for(const name of ['screen-1-home','screen-2-result','screen-3-kkti','board']){
  const board=name==='board';
  const page=await browser.newPage({viewport:{width:board?2400:1179,height:board?1350:2556},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(dir,name+'.html')).href,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  report[name]=await page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}};
   const visible=e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getBoundingClientRect().height>0};
   const texts=[...document.querySelectorAll('body *')].filter(e=>visible(e)&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
   const buttons=[...document.querySelectorAll('button,.round-button,.nav a')].filter(visible);
   return {
    viewport:[innerWidth,innerHeight],
    loadedFonts:document.fonts.check('500 36px P')&&document.fonts.check('700 36px P'),
    missingImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.getAttribute('src')),
    minimumFontSize:Math.min(...texts.map(e=>parseFloat(getComputedStyle(e).fontSize))),
    undersizedButtons:buttons.filter(e=>rect(e).h<120).map(e=>({text:e.textContent.trim(),rect:rect(e)})),
    textOutsideViewport:texts.filter(e=>{const r=rect(e);return r.x<0||r.y<0||r.x+r.w>innerWidth+.5||r.bottom>innerHeight+.5}).map(e=>({text:e.textContent.trim().slice(0,80),rect:rect(e)})),
    elementBounds:Object.fromEntries(['.hello','.capture-hero','.situation','.recent','.home-note','.nav','.summary','.mind','.reply-heading','.reply-list','.heat-panel','.result-footnote','.kkti-card','.match','.kkti-advice','.share-button','.left','.principle','.footer','.phones'].map(s=>[s,document.querySelector(s)?rect(document.querySelector(s)):null]).filter(([,v])=>v))
   };
  });
  await page.close();
 }
}finally{await browser.close()}
function luminance(hex){const rgb=hex.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
function contrast(a,b){const x=luminance(a),y=luminance(b);return +((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)}
report.contrast={ivoryOnCharcoal:contrast('F3EBDD','17191D'),mutedOnCharcoal:contrast('A5A39E','17191D'),mutedOnLightestCard:contrast('A5A39E','242522'),goldOnCharcoal:contrast('D6BC88','17191D'),buttonInkOnDarkestGold:contrast('17140F','BA9964')};
report.pngSizes={};
for(const name of ['icon','screen-1-home','screen-2-result','screen-3-kkti','board']){const b=fs.readFileSync(path.join(dir,name+'.png'));report.pngSizes[name]=[b.readUInt32BE(16),b.readUInt32BE(20)]}
fs.writeFileSync(path.join(dir,'qa.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
