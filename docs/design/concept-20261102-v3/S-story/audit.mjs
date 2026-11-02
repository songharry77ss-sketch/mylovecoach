import {chromium} from 'file:///C:/Users/shsop/mylovecoach-codex-tools/node_modules/playwright-core/index.mjs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const reports=[];
async function inspect(page,label){
  const report=await page.evaluate(()=>{
    const root=document.querySelector('.app,.store,.share-export');
    const rr=root.getBoundingClientRect();
    const nodes=[],contrastIssues=[];let lowestContrast=100;const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const luminance=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    while(n=walk.nextNode()){
      if(!n.textContent.trim())continue;
      const e=n.parentElement,s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')continue;
      const range=document.createRange();range.selectNodeContents(n);const rects=[...range.getClientRects()];if(!rects.length)continue;
      const text=n.textContent.trim();
      let background='rgb(10, 10, 10)';for(let p=e;p;p=p.parentElement){const bg=getComputedStyle(p).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent'){background=bg;break;}}
      const l1=luminance(rgb(s.color)),l2=luminance(rgb(background));const ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);lowestContrast=Math.min(lowestContrast,ratio);if(ratio<4.5)contrastIssues.push({text,ratio});
      const outside=rects.some(r=>r.left<rr.left-1||r.top<rr.top-1||r.right>rr.right+1||r.bottom>rr.bottom+1);
      let clipped=false;for(let p=e;p&&p!==root;p=p.parentElement){const ps=getComputedStyle(p);if(['hidden','clip'].includes(ps.overflow)){const pr=p.getBoundingClientRect();if(rects.some(r=>r.left<pr.left-2||r.right>pr.right+2||r.top<pr.top-2||r.bottom>pr.bottom+2))clipped=true;}}
      if(outside||clipped||parseFloat(s.fontSize)<26)nodes.push({text,outside,clipped,font:s.fontSize});
    }
    const smallControls=[...root.querySelectorAll('button,a')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().height<120).map(e=>({text:e.textContent.trim()||e.getAttribute('aria-label'),height:e.getBoundingClientRect().height}));
    const images=[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src);
    const bounds={};for(const sel of ['.kkti-note','.share-actions','.home-indicator','.story-note','.story-nav']){const e=document.querySelector(sel);if(e){const r=e.getBoundingClientRect();bounds[sel]={top:r.top,bottom:r.bottom};}}
    return {width:rr.width,height:rr.height,fontReady:document.fonts.check('700 48px P'),textIssues:nodes,smallControls,brokenImages:images,lowestTextContrast:Number(lowestContrast.toFixed(2)),contrastIssues,bounds};
  });reports.push({label,...report});
}
try{
 for(const [name,w,h] of [['screen-1-home',1179,2556],['screen-2-result',1179,2556],['screen-3-kkti',1179,2556],['store-1',1290,2796],['share-kkti',1080,1920]]){
  const page=await browser.newPage({viewport:{width:w,height:h}});await page.goto(pathToFileURL(path.join(dir,name+'.html')).href);await page.evaluate(()=>document.fonts.ready);await inspect(page,name);await page.close();
 }
 const page=await browser.newPage({viewport:{width:1179,height:2556}});
 await page.goto(pathToFileURL(path.join(dir,'screen-2-result.html')).href+'?step=1');await page.evaluate(()=>document.fonts.ready);
 for(let i=1;i<=5;i++){
   const label=await page.locator('.stage-label').innerText();if(!label.startsWith(i+'/5'))throw Error('Story step mismatch: '+label);
   await inspect(page,'story-step-'+i);
   if(i!==3)await page.screenshot({path:path.join(dir,'story-'+i+'.png')});
   if(i<5)await page.locator('.next').click();
 }
 await page.keyboard.press('ArrowLeft');if(!await page.locator('[data-step="4"]').isVisible())throw Error('Keyboard navigation failed');
 await page.keyboard.press('ArrowLeft');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedText=text;}}}));
 await page.locator('.recommend .copy-btn').click();
 const copy=await page.evaluate(()=>window.copiedText);if(copy!=='전시 보고 맛있는 거까지? 토요일 코스 완벽한데 ㅎㅎ')throw Error('Copy mismatch');
 await page.locator('.direct .copy-btn').click();await page.locator('.next').click();await page.locator('.next').click();
 const finalText=await page.locator('.ready-scene .message-bubble').innerText();const finalScore=await page.locator('.ready-scene .scene-foot').innerText();
 if(!finalText.includes('너 만나는 게 더 기대돼.')||!finalScore.includes('76%'))throw Error('Selected reply was not synchronized');
 reports.push({label:'interaction',steps:5,keyboardNavigation:true,copyText:copy,selectedReplySynced:true,finalText,finalScore,toast:await page.locator('.toast').innerText()});
 const failures=reports.filter(r=>r.textIssues?.length||r.smallControls?.length||r.brokenImages?.length||r.contrastIssues?.length);
 fs.writeFileSync(path.join(dir,'qa-report.json'),JSON.stringify(reports,null,2));
 console.log(JSON.stringify({screens:reports.length-1,failures,interaction:reports.at(-1)},null,2));
 if(failures.length)throw Error('Visual QA issues detected');
}finally{await browser.close();}
