import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.dirname(here);
const repo = path.resolve(out, '../../..');
const uri = (...p) => pathToFileURL(path.join(repo, ...p)).href;
const raw = name => uri('docs/store-assets/sendit-1.1/raw', name + '.png');
const mark = uri('assets/images/sendit-mark.png');
const icon = name => uri('assets/images/sendit', `3d-${name}.png`);
const slides = [
  {name:'1-hero', screen:'home', line1:'생각났으면,', line2:'지금 <em>센딧.</em>', sub:'카톡 캡처 한 장이면 답장 3가지와 호감 온도까지', icon:'send', hero:true},
  {name:'2-replies', screen:'replies', line1:'뭐라고 보낼지,', line2:'<em>답장 3가지</em>로', sub:'내 말투 그대로, 성공 확률까지 보여 줘요', icon:'heart'},
  {name:'3-mind', screen:'mind', line1:'그 사람 마음,', line2:'<em>몇 %</em>일까?', sub:'관심 있을 가능성과 호감 온도를 한눈에', icon:'heart'},
  {name:'4-memory', screen:'memory', line1:'지난 대화도', line2:'<em>센딧이 기억</em>해요', sub:'있었던 일·약속을 기억해서 다음 답장에 살려요', icon:'memory'},
  {name:'5-report', screen:'report', line1:'우리 사이,', line2:'<em>호감 온도</em>로 봐요', sub:'대화가 쌓일수록 정확해지는 상대 분석 보고서', icon:'heart'},
  {name:'6-explore', screen:'explore', line1:'연애가 더', line2:'<em>재밌어지는</em> 것들', sub:'KKTI 테스트 · 속마음 카드 · 비밀 상담', icon:'ticket', explore:true},
];
const font = `@font-face{font-family:P;font-style:normal;font-weight:700;src:url('${uri('api/_assets/fonts/Pretendard-Bold.otf')}')}@font-face{font-family:P;font-style:normal;font-weight:500;src:url('${uri('api/_assets/fonts/Pretendard-Medium.otf')}')}`;
const cap = `<svg width="42" height="42" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m2 12 14-7 14 7-14 7L2 12Z" fill="currentColor"/><path d="M8 16v7c5 4 11 4 16 0v-7l-8 4-8-4Z" fill="currentColor"/><path d="M29 13v10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

function page(s, i, kind) {
  const play = kind === 'play';
  const width = play ? 1242 : 1290;
  const height = play ? 2208 : 2796;
  const dark = i % 2 === 1;
  const phoneWidth = s.explore ? (play ? 1120 : 1170) : (play ? 954 : 1044);
  const phoneTop = s.explore ? (play ? 930 : 1430) : s.hero ? (play ? 880 : 1000) : (play ? 780 : (s.screen==='replies'||s.screen==='mind'?920:875));
  const phoneLeft = s.explore ? (width-phoneWidth)/2 : (width-phoneWidth)/2-20;
  const floatSize = s.explore ? (play ? 360 : 540) : (play ? 255 : 300);
  const floatTop = s.explore ? (play ? 663 : 980) : phoneTop-130;
  const floatLeft = s.explore ? (play ? 820 : 685) : width-(play ? 280 : 295);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}"><title>센딧 — ${s.name}</title><style>
  ${font}
  *{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}body{font-family:P,sans-serif;font-weight:500;color:#191F28;-webkit-font-smoothing:antialiased}
  .poster{position:relative;isolation:isolate;width:100%;height:100%;overflow:hidden;background:linear-gradient(160deg,#FFFFFF 12%,#F3F5FF 58%,#ECEFFF 100%)}
  .poster.dark{color:white;background:linear-gradient(151deg,#3D63F5 0%,#3D63F5 46%,#7559F6 100%)}
  .halo{position:absolute;z-index:-1;width:1900px;height:1900px;left:-320px;top:${play?780:1020}px;border-radius:50%;background:linear-gradient(135deg,rgba(138,216,255,.22),rgba(117,89,246,.08));border:2px solid rgba(255,255,255,.75)}
  .dark .halo{background:linear-gradient(120deg,rgba(138,216,255,.12),rgba(255,255,255,.025));border-color:rgba(255,255,255,.17)}
  .halo:after{content:'';position:absolute;inset:96px;border:2px solid rgba(255,255,255,.6);border-radius:50%}.dark .halo:after{border-color:rgba(255,255,255,.08)}
  .corner-light{position:absolute;z-index:-1;right:-370px;top:${play?850:1250}px;width:1000px;height:1000px;border-radius:50%;background:radial-gradient(circle,rgba(138,216,255,.25),rgba(63,124,248,.10) 42%,transparent 70%)}
  .brand{position:absolute;top:164px;left:104px;display:flex;align-items:center;gap:22px;font-size:60px;line-height:80px;font-weight:700;letter-spacing:-2.4px}.brand img{width:80px;height:80px;border-radius:24px}
  .copy{position:absolute;top:${play?310:342}px;left:104px;width:${width-208}px}
  h1{margin:0;font-size:${play?116:124}px;line-height:1.18;font-weight:700;letter-spacing:-6.4px}h1 .line{display:block;white-space:nowrap}h1 em{font-style:normal;background:linear-gradient(112deg,#3F7CF8,#3D63F5 42%,#7559F6);-webkit-background-clip:text;background-clip:text;color:transparent}
  .dark h1 em{background:linear-gradient(110deg,#D5F2FF,#FFFFFF 65%,#F3ECFF);-webkit-background-clip:text;background-clip:text;color:transparent}
  .subtitle{margin:${play?32:40}px 0 0;font-size:${play?44:46}px;line-height:1.45;letter-spacing:-1.45px;color:#5B6573;white-space:nowrap}.dark .subtitle{color:#FFFFFF}
  .badge{position:absolute;left:104px;top:${play?718:798}px;display:flex;align-items:center;gap:15px;border:2px solid #DEE4FC;background:#FFFFFF;padding:20px 28px;border-radius:60px;font-size:35px;line-height:44px;letter-spacing:-.9px;color:#3D50AD}.badge svg{flex-shrink:0}
  .phone{position:absolute;left:${phoneLeft}px;top:${phoneTop}px;width:${phoneWidth}px;aspect-ratio:1290/2826;background:#10141C;border:14px solid #10141C;border-radius:126px;box-shadow:0 38px 70px rgba(33,42,100,.17);overflow:hidden}
  .dark .phone{box-shadow:0 38px 75px rgba(20,21,72,.24)}
  .screen{position:absolute;inset:0;overflow:hidden;border-radius:111px;background:#FFF}.screen img{display:block;width:100%;height:auto;max-width:none}
  .island{position:absolute;top:21px;left:50%;transform:translateX(-50%);width:206px;height:57px;border-radius:40px;background:#10141C}
  .float{position:absolute;left:${floatLeft}px;top:${floatTop}px;width:${floatSize}px;height:${floatSize}px;object-fit:contain;filter:drop-shadow(0 22px 23px rgba(37,52,139,.18));transform:rotate(${s.explore?-13:i%2?9:-9}deg)}
  .folio{position:absolute;bottom:54px;right:48px;padding:14px 19px;border-radius:40px;background:#ECEFFF;color:#5B6573;font-size:34px;line-height:42px;letter-spacing:1px;font-variant-numeric:tabular-nums}.dark .folio{background:#705BF5;color:#FFF}
  </style></head><body><main class="poster ${dark?'dark':''}"><div class="halo"></div><div class="corner-light"></div><div class="brand"><img src="${mark}" alt="">센딧</div><div class="copy"><h1><span class="line">${s.line1}</span><span class="line">${s.line2}</span></h1><p class="subtitle">${s.sub}</p></div>${s.hero?`<div class="badge">${cap}<span>고려대학교 연구진이 개발한 연애 특화 AI 코치</span></div>`:''}<div class="phone"><div class="screen"><img src="${raw(s.screen)}" alt="센딧 ${s.screen} 실제 앱 화면"></div><div class="island"></div></div><img class="float" src="${icon(s.icon)}" alt=""><div class="folio">${String(i+1).padStart(2,'0')} / 06</div></main></body></html>`;
}

function feature(){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>센딧</title><style>${font}
*{box-sizing:border-box}html,body{margin:0;width:1024px;height:500px;overflow:hidden}body{font-family:P,sans-serif;color:#FFF;background:linear-gradient(124deg,#3D63F5 0%,#3D63F5 45%,#7559F6 100%);-webkit-font-smoothing:antialiased}
.arc{position:absolute;width:900px;height:900px;left:475px;top:70px;border:1px solid #ffffff30;border-radius:50%;background:linear-gradient(120deg,#8AD8FF24,transparent)}.arc:after{content:'';position:absolute;inset:55px;border:1px solid #ffffff1a;border-radius:50%}
.brand{position:absolute;left:60px;top:66px;display:flex;align-items:center;gap:16px;font-size:46px;font-weight:700;letter-spacing:-1.7px}.brand img{width:66px;height:66px;border-radius:19px}.sub{position:absolute;left:63px;top:168px;margin:0;font-size:27px;letter-spacing:-.7px}.title{position:absolute;left:60px;top:226px;margin:0;font-size:62px;line-height:1.17;font-weight:700;letter-spacing:-3.2px}.title span{color:#DAF3FF}.phone{position:absolute;left:652px;top:63px;width:342px;aspect-ratio:1290/2826;transform:rotate(12deg);transform-origin:50% 50%;border:7px solid #10141C;border-radius:46px;overflow:hidden;background:#10141C;box-shadow:0 16px 40px #17215255}.screen{position:absolute;inset:0;border-radius:39px;overflow:hidden;background:#fff}.screen img{display:block;width:100%;height:auto}.island{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:69px;height:20px;background:#10141C;border-radius:18px}
</style></head><body><div class="arc"></div><div class="brand"><img src="${mark}" alt="">센딧</div><p class="sub">나만의 연애 코치</p><h1 class="title">생각났으면,<br>지금 <span>센딧.</span></h1><div class="phone"><div class="screen"><img src="${raw('home')}" alt="센딧 실제 홈 화면"></div><div class="island"></div></div></body></html>`;}

await fs.mkdir(here,{recursive:true});
const jobs=[];
for (const [kind,folder,w,h] of [['ios','ios-6.7-framed',1290,2796],['play','play-framed',1242,2208]]) {
  await fs.mkdir(path.join(out,folder),{recursive:true});
  for(let i=0;i<slides.length;i++){
    const s=slides[i], html=path.join(here,`${kind}-${s.name}.html`), png=path.join(out,folder,`${s.name}.png`);
    await fs.writeFile(html,page(s,i,kind));jobs.push({html,png,width:w,height:h});
  }
}
await fs.writeFile(path.join(here,'feature.html'),feature());
jobs.push({html:path.join(here,'feature.html'),png:path.join(out,'feature-graphic-1024x500.png'),width:1024,height:500});
for(const [kind,folder,w,h] of [['ios','ios-6.7-framed',1290,2796],['play','play-framed',1242,2208]]){
  const thumbW=300, thumbH=h*thumbW/w, boardWidth=6*thumbW+7*24, boardHeight=Math.ceil(thumbH)+48;
  await fs.writeFile(path.join(here,`${kind}-board.html`),`<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0;width:${boardWidth}px;height:${boardHeight}px;background:#E4E7F0}body{display:flex;gap:24px;padding:24px}img{width:${thumbW}px;height:${thumbH}px;display:block;box-shadow:0 2px 7px #19285818}</style></head><body>${slides.map(s=>`<img src="${pathToFileURL(path.join(out,folder,s.name+'.png')).href}">`).join('')}</body></html>`);
  jobs.push({html:path.join(here,`${kind}-board.html`),png:path.join(out,kind==='ios'?'board.png':'board-play.png'),width:boardWidth,height:boardHeight,board:true});
}
const sourceHashes={};
for(const s of slides){const b=await fs.readFile(path.join(out,'raw',s.screen+'.png'));sourceHashes[s.screen+'.png']=createHash('sha256').update(b).digest('hex')}
await fs.writeFile(path.join(here,'manifest.json'),JSON.stringify({jobs,sourceHashes},null,2));
console.log(`Prepared ${jobs.length} HTML renders in ${out}`);
