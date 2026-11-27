// 영어판(My Love Coach) 스토어 이미지 — sendit-1.1/_source/build.mjs 를 옮겨 영어 문구·영어 원본 화면으로 바꾼 것.
// 실행: node docs/store-assets/en-1.5/_source/build.mjs → HTML 과 렌더 목록(manifest.json)을 만든다. 렌더·검수 방법은 ../README.md
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.dirname(here);
const repo = path.resolve(out, '../../..');
const uri = (...p) => pathToFileURL(path.join(repo, ...p)).href;
const raw = name => uri('docs/store-assets/en-1.5/raw', name + '.png');
const mark = uri('assets/images/sendit-mark.png');
const icon = name => uri('assets/images/sendit', `3d-${name}.png`);
const NAME = 'My Love Coach';
// 제목은 두 줄(각 줄이 캔버스 폭의 80% 안), <em> 은 그라데이션 글자
const slides = [
  {name:'1-hero', screen:'home', line1:'Your dating coach', line2:'for every <em>text.</em>', sub:'Get 3 replies + their interest level, instantly', icon:'send', hero:true, playFloatGap:100},
  {name:'2-replies', screen:'replies', line1:'One screenshot.', line2:'<em>3 perfect replies.</em>', sub:'Your own voice, plus each reply’s success chance', icon:'heart'},
  {name:'3-mind', screen:'mind', line1:'What are they', line2:'<em>really thinking?</em>', sub:'Their inner voice, the odds &amp; what to do next', icon:'heart'},
  // Play 는 화면 틀을 30px 올려 「Most recent」 기억 줄이 잘리지 않게 (아이콘은 설명 글과 겹치지 않게 덜 올림)
  {name:'4-memory', screen:'memory', line1:'A coach that', line2:'<em>remembers it all</em>', sub:'Past moments &amp; plans, used in your next reply', icon:'memory', playPhoneTop:750, playFloatGap:100},
  {name:'5-report', screen:'report', line1:'Watch their', line2:'<em>interest heat up</em>', sub:'A crush report that gets sharper with every chat', icon:'heart'},
  {name:'6-explore', screen:'explore', line1:'Practice, tips &amp;', line2:'your <em>texting type</em>', sub:'Practice chat · Texting Type Test · Mind cards', icon:'ticket'},
];
const font = `@font-face{font-family:P;font-style:normal;font-weight:700;src:url('${uri('api/_assets/fonts/Pretendard-Bold.otf')}')}@font-face{font-family:P;font-style:normal;font-weight:500;src:url('${uri('api/_assets/fonts/Pretendard-Medium.otf')}')}`;
const cap = `<svg width="42" height="42" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m2 12 14-7 14 7-14 7L2 12Z" fill="currentColor"/><path d="M8 16v7c5 4 11 4 16 0v-7l-8 4-8-4Z" fill="currentColor"/><path d="M29 13v10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

function page(s, i, kind) {
  const play = kind === 'play';
  const width = play ? 1242 : 1290;
  const height = play ? 2208 : 2796;
  const dark = i % 2 === 1;
  const phoneWidth = play ? 954 : 1044;
  const phoneTop = s.hero ? (play ? 880 : 1000) : (play ? (s.playPhoneTop ?? 780) : (s.screen==='replies'||s.screen==='mind'?920:875));
  const phoneLeft = (width-phoneWidth)/2-20;
  const floatSize = play ? 255 : 300;
  const floatTop = phoneTop-(play && s.playFloatGap ? s.playFloatGap : 130);
  const floatLeft = width-(play ? 280 : 295);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}"><title>${NAME} — ${s.name}</title><style>
  ${font}
  *{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}body{font-family:P,sans-serif;font-weight:500;color:#191F28;-webkit-font-smoothing:antialiased}
  .poster{position:relative;isolation:isolate;width:100%;height:100%;overflow:hidden;background:linear-gradient(160deg,#FFFFFF 12%,#F3F5FF 58%,#ECEFFF 100%)}
  .poster.dark{color:white;background:linear-gradient(151deg,#3D63F5 0%,#3D63F5 46%,#7559F6 100%)}
  .halo{position:absolute;z-index:-1;width:1900px;height:1900px;left:-320px;top:${play?780:1020}px;border-radius:50%;background:linear-gradient(135deg,rgba(138,216,255,.22),rgba(117,89,246,.08));border:2px solid rgba(255,255,255,.75)}
  .dark .halo{background:linear-gradient(120deg,rgba(138,216,255,.12),rgba(255,255,255,.025));border-color:rgba(255,255,255,.17)}
  .halo:after{content:'';position:absolute;inset:96px;border:2px solid rgba(255,255,255,.6);border-radius:50%}.dark .halo:after{border-color:rgba(255,255,255,.08)}
  .corner-light{position:absolute;z-index:-1;right:-370px;top:${play?850:1250}px;width:1000px;height:1000px;border-radius:50%;background:radial-gradient(circle,rgba(138,216,255,.25),rgba(63,124,248,.10) 42%,transparent 70%)}
  .brand{position:absolute;top:164px;left:104px;display:flex;align-items:center;gap:22px;font-size:58px;line-height:80px;font-weight:700;letter-spacing:-1.6px}.brand img{width:80px;height:80px;border-radius:24px}
  .copy{position:absolute;top:${play?310:342}px;left:104px;width:${width-208}px}
  h1{margin:0;font-size:${play?112:120}px;line-height:1.16;font-weight:700;letter-spacing:-.035em}h1 .line{display:block;white-space:nowrap}h1 em{font-style:normal;background:linear-gradient(112deg,#3F7CF8,#3D63F5 42%,#7559F6);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.04em}
  .dark h1 em{background:linear-gradient(110deg,#D5F2FF,#FFFFFF 65%,#F3ECFF);-webkit-background-clip:text;background-clip:text;color:transparent}
  .subtitle{margin:${play?32:40}px 0 0;font-size:${play?44:46}px;line-height:1.45;letter-spacing:-.03em;color:#5B6573;white-space:nowrap}.dark .subtitle{color:#FFFFFF}
  .badge{position:absolute;left:104px;top:${play?718:798}px;display:flex;align-items:center;gap:15px;border:2px solid #DEE4FC;background:#FFFFFF;padding:20px 28px;border-radius:60px;font-size:${play?33:35}px;line-height:44px;letter-spacing:-.6px;color:#3D50AD}.badge svg{flex-shrink:0}
  .phone{position:absolute;left:${phoneLeft}px;top:${phoneTop}px;width:${phoneWidth}px;aspect-ratio:1290/2826;background:#10141C;border:14px solid #10141C;border-radius:126px;box-shadow:0 38px 70px rgba(33,42,100,.17);overflow:hidden}
  .dark .phone{box-shadow:0 38px 75px rgba(20,21,72,.24)}
  .screen{position:absolute;inset:0;overflow:hidden;border-radius:111px;background:#FFF}.screen img{display:block;width:100%;height:auto;max-width:none}
  .island{position:absolute;top:21px;left:50%;transform:translateX(-50%);width:206px;height:57px;border-radius:40px;background:#10141C}
  .float{position:absolute;left:${floatLeft}px;top:${floatTop}px;width:${floatSize}px;height:${floatSize}px;object-fit:contain;filter:drop-shadow(0 22px 23px rgba(37,52,139,.18));transform:rotate(${i%2?9:-9}deg)}
  .folio{position:absolute;bottom:54px;right:48px;padding:14px 19px;border-radius:40px;background:#ECEFFF;color:#5B6573;font-size:34px;line-height:42px;letter-spacing:1px;font-variant-numeric:tabular-nums}.dark .folio{background:#705BF5;color:#FFF}
  </style></head><body><main class="poster ${dark?'dark':''}"><div class="halo"></div><div class="corner-light"></div><div class="brand"><img src="${mark}" alt="">${NAME}</div><div class="copy"><h1><span class="line">${s.line1}</span><span class="line">${s.line2}</span></h1><p class="subtitle">${s.sub}</p></div>${s.hero?`<div class="badge">${cap}<span>Developed with psychology researchers at Korea University</span></div>`:''}<div class="phone"><div class="screen"><img src="${raw(s.screen)}" alt="${NAME} ${s.screen} app screen"></div><div class="island"></div></div><img class="float" src="${icon(s.icon)}" alt=""><div class="folio">${String(i+1).padStart(2,'0')} / 06</div></main></body></html>`;
}

function feature(){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${NAME}</title><style>${font}
*{box-sizing:border-box}html,body{margin:0;width:1024px;height:500px;overflow:hidden}body{font-family:P,sans-serif;color:#FFF;background:linear-gradient(124deg,#3D63F5 0%,#3D63F5 45%,#7559F6 100%);-webkit-font-smoothing:antialiased}
.arc{position:absolute;width:900px;height:900px;left:475px;top:70px;border:1px solid #ffffff30;border-radius:50%;background:linear-gradient(120deg,#8AD8FF24,transparent)}.arc:after{content:'';position:absolute;inset:55px;border:1px solid #ffffff1a;border-radius:50%}
.brand{position:absolute;left:60px;top:66px;display:flex;align-items:center;gap:16px;font-size:44px;font-weight:700;letter-spacing:-1.2px}.brand img{width:66px;height:66px;border-radius:19px}.sub{position:absolute;left:63px;top:168px;margin:0;font-size:27px;letter-spacing:-.5px}.title{position:absolute;left:60px;top:226px;margin:0;font-size:60px;line-height:1.17;font-weight:700;letter-spacing:-.035em}.title span{color:#DAF3FF}.phone{position:absolute;left:652px;top:63px;width:342px;aspect-ratio:1290/2826;transform:rotate(12deg);transform-origin:50% 50%;border:7px solid #10141C;border-radius:46px;overflow:hidden;background:#10141C;box-shadow:0 16px 40px #17215255}.screen{position:absolute;inset:0;border-radius:39px;overflow:hidden;background:#fff}.screen img{display:block;width:100%;height:auto}.island{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:69px;height:20px;background:#10141C;border-radius:18px}
</style></head><body><div class="arc"></div><div class="brand"><img src="${mark}" alt="">${NAME}</div><p class="sub">Your AI dating coach</p><h1 class="title">Your dating coach<br>for every <span>text.</span></h1><div class="phone"><div class="screen"><img src="${raw('home')}" alt="${NAME} home screen"></div><div class="island"></div></div></body></html>`;}

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
