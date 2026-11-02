import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const icons={
 back:'<path d="m15 5-7 7 7 7"/>',
 more:'<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 picture:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/>',
 arrow:'<path d="M12 19V5m-6 6 6-6 6 6"/>',
 home:'<path d="m3 10 9-7 9 7v10H15v-6H9v6H3Z"/>',
 explore:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>',
 check:'<path d="m5 12 4.5 4.5L19 7"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 signal:'<path d="M3 16v-2M7 16v-5M11 16V8M15 16V5" stroke-width="2.8"/>',
 wifi:'<path d="M2 7a15 15 0 0 1 20 0M5 11a10 10 0 0 1 14 0M8 15a5 5 0 0 1 8 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
 battery:'<rect x="2" y="6" width="18" height="12" rx="3"/><path d="M23 10v4"/><rect x="4.5" y="8.5" width="13" height="7" rx="1" fill="currentColor" stroke="none"/>'
};
const svg=(name,cls='')=>`<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${icons[name]}</svg>`;
const iconButton=(name,label)=>`<button class="icon-btn" aria-label="${label}">${svg(name)}</button>`;
const status=()=>`<div class="status"><span>9:41</span><span class="island"></span><div class="system">${svg('signal')}${svg('wifi')}${svg('battery','battery')}</div></div>`;
const indicator='<div class="home-indicator"></div>';
const header=(title,right='more')=>`<header class="topbar backbar">${iconButton('back','뒤로')}<span class="center-title">${title}</span>${iconButton(right,right==='close'?'닫기':'더 보기')}</header>`;
const object=(cls='')=>`<img class="soft-object ${cls}" src="assets/bubble-3d.png" alt="하트가 담긴 보라색 말풍선">`;
function write(name,contents,kind='phone'){
 fs.writeFileSync(path.join(dir,`${name}.html`),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>럽코 · ${name}</title><link rel="stylesheet" href="style.css"></head><body><main class="artboard ${kind}">${contents}</main></body></html>`,'utf8');
}
write('screen-1-home',`${status()}<header class="topbar"><div class="wordmark">럽코</div>${iconButton('bell','알림')}</header>
 <section class="home-greeting"><p class="hello">지수님, 안녕하세요</p><h1>어떤 답장을<br>보내볼까요?</h1>${object()}</section>
 <section class="upload-box"><h2>카톡 캡처 한 장이면 돼요</h2><p class="body-copy">말투에 맞는 답장 3가지를 드려요</p><button class="primary">${svg('picture')}캡처 올리기</button><p class="free">오늘 무료 상담 <b>3회</b> 남았어요</p></section>
 <section class="situation"><h2 class="section-title">캡처 없이도 괜찮아요</h2><div class="input-box">지금 어떤 상황인지 알려주세요<button aria-label="상황 보내기">${svg('arrow')}</button></div></section>
 <section class="recent"><div class="section-row"><h2 class="section-title">최근 상담</h2><button class="text-btn">전체 보기</button></div><div class="recent-row"><span class="avatar">수</span><div class="recent-info"><b>수연</b><p>토요일 약속, 뭐라고 답할까요?</p></div><span class="recent-temp">25°</span></div><div class="recent-row"><span class="avatar neutral">민</span><div class="recent-info"><b>민준</b><p>오랜만에 먼저 연락이 왔어요</p></div><span class="recent-temp">32°</span></div></section>
 <nav class="tabbar" aria-label="하단 메뉴"><button class="tab active">${svg('home')}홈</button><button class="tab">${svg('explore')}탐색</button><button class="tab">${svg('user')}마이</button></nav>${indicator}`);
const replies=[
 {type:'무난하게',score:95,text:'좋아요 언니! 토요일 오후에 봐요.<br>맛있는 것도 같이 먹어요 :)'},
 {type:'센스 있게',score:91,text:'전시도 밥도 완벽한 코스네요.<br>토요일이 벌써 기다려져요 ㅎㅎ'},
 {type:'직진',score:87,text:'언니랑 더 얘기하고 싶었어요.<br>전시 끝나고 맛있는 거 먹으러 가요!'}
];
write('screen-2-result',`${status()}${header('수연님과의 대화')}<div class="result-main"><p class="from">수연님이 보냈어요</p><div class="message">토요일 오후 좋아!<br>끝나고 밥도 먹자 :)</div><section class="mind"><div class="mind-top"><h2>관심 있을 가능성</h2><span class="percent">62<small>%</small></span></div><div class="mind-bar"><i></i><i></i><i></i></div><div class="mind-others"><span>바빠서 <b>23%</b></span><span>선 긋는 중 <b>15%</b></span></div></section><section class="reply-section"><div class="reply-heading"><h2>이렇게 답장해 봐요</h2>${object()}</div>${replies.map((r,i)=>`<article class="reply-card ${i===0?'recommended':''}"><div class="reply-top"><h3 class="reply-type">${r.type}</h3><div class="reply-score">성공 확률 <b>${r.score}<small>%</small></b></div></div><p class="reply-text">${r.text}</p><button class="copy" aria-label="${r.type} 답장 복사">복사</button></article>`).join('')}</section><section class="temperature"><div><h2>수연님과의 호감 온도</h2><p>지난 대화보다 따뜻해졌어요</p></div><div class="reading"><span class="delta">+10°</span><span class="current">25°</span></div></section></div>${indicator}`);
write('screen-3-kkti',`${status()}${header('이용권','close')}<div class="plans-main"><section class="plan-intro"><h1>필요한 만큼,<br>편하게 물어봐요</h1><p>답장이 막힐 때마다 럽코와 함께해요</p>${object()}</section><section class="plan-card"><h2 class="plan-name">하루 이용권</h2><span class="radio"></span><div class="price">2,700<span>원</span></div><p>오늘의 대화에 집중하고 싶을 때</p></section><section class="plan-card selected"><h2 class="plan-name">평생 이용권<span class="plan-tag">한 번 결제</span></h2><span class="radio">${svg('check')}</span><div class="price">29,800<span>원</span></div><p>기간 제한 없이 오래 함께해요</p></section><p class="plan-features">${svg('check')}답장 3가지 · 속마음 분석 · 호감 온도</p></div><div class="pay-action"><button class="primary">평생 이용권 시작하기</button><p>추가 정기 결제 없이 이용해요</p></div>${indicator}`);
write('store-1',`<div class="store-logo">럽코</div><h1>답장 하나로,<br><span>다음 만남까지.</span></h1><p class="store-sub">카톡 캡처 한 장, 내 말투에 맞는 답장 3가지</p><img class="store-photo" src="assets/cafe-couple.png" alt="카페에서 마주 보며 웃는 두 성인"><section class="store-ui"><div class="ui-top"><span>수연님과의 대화</span>${object()}</div><div class="store-incoming">끝나고 밥도 먹자 :)</div><div class="store-reply"><div class="meta"><span>무난하게</span><span>성공 확률 <b>95<small>%</small></b></span></div><p>좋아요 언니! 토요일 오후에 봐요.<br>맛있는 것도 같이 먹어요 :)</p></div></section>`,'store');
write('board',`<section class="brand-column"><div class="board-logo">럽코</div><h1 class="brand-slogan">마음은 담고,<br>고민은 덜어요.</h1><p class="brand-description">답장을 함께 고르는 연애 코치</p><img class="board-icon" src="icon.png" alt="럽코 앱 아이콘"><div class="palette"><div class="swatch"><i style="background:#5B47FF"></i>#5B47FF</div><div class="swatch"><i style="background:#F2F4F6;border:1px solid #E6E8EC"></i>#F2F4F6</div><div class="swatch"><i style="background:#191F28"></i>#191F28</div></div><p class="type-spec">프리텐다드 · 미디엄 / 볼드<b>좋은 대화의 시작, 95%</b></p></section><div class="board-note">클린 시안 · 2026. 11. 02.</div><section class="phone-lineup">${[{name:'스토어',file:'store-1',note:'답장 하나로, 다음 만남까지.',cls:'store-device'},{name:'홈',file:'screen-1-home',note:'캡처 한 장으로 가볍게 시작해요.'},{name:'코칭 결과',file:'screen-2-result',note:'답장 3가지를 한눈에 비교해요.'},{name:'이용권',file:'screen-3-kkti',note:'필요한 만큼 편하게 이용해요.'}].map(x=>`<div class="device-group"><h2 class="device-title">${x.name}</h2><div class="device ${x.cls||''}"><img src="${x.file}.png" alt="${x.name} 화면"></div><p class="device-note">${x.note}</p></div>`).join('')}</section>`,'board');
console.log('T-clean HTML 5개 생성 완료');
