import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const svg=(body,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const icons={
 heart:svg('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>'),
 image:svg('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.3"/><path d="m4 17 5-5 4 4 3-3 5 5"/>'),
 arrow:svg('<path d="M4 12h16m-6-6 6 6-6 6"/>'),
 chevron:svg('<path d="m9 5 7 7-7 7"/>'),
 back:svg('<path d="m15 5-7 7 7 7"/>'),
 copy:svg('<rect x="8" y="8" width="12" height="13" rx="3"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
 home:svg('<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2Z"/>'),
 explore:svg('<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2 5.2-5.2 2 2-5.2 5.2-2Z"/>'),
 person:svg('<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'),
 share:svg('<path d="M12 15V2m-4 4 4-4 4 4M5 10H3v11h18V10h-2"/>'),
 more:svg('<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>'),
 check:svg('<path d="m5 12 4 4 10-10"/>'),
 close:svg('<path d="m6 6 12 12M6 18 18 6"/>')
};
const status=`<div class="status"><b>9:41</b><div class="island"></div><div class="signals"><svg width="16" height="12" viewBox="0 0 16 12"><path d="M1 10V8m4 2V6m4 4V4m4 6V2" stroke="currentColor" stroke-width="2.6"/></svg><svg width="16" height="12" viewBox="0 0 16 12"><path d="M1 4a11 11 0 0 1 14 0M4 7a6 6 0 0 1 8 0m-5 3h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><svg width="26" height="13" viewBox="0 0 26 13"><rect x=".7" y="1" width="21.5" height="11" rx="3" fill="none" stroke="currentColor" stroke-opacity=".45"/><rect x="3" y="3.2" width="17" height="6.6" rx="1.4" fill="currentColor"/><path d="M24 4.5v4" stroke="currentColor" stroke-width="2"/></svg></div></div>`;
const indicator='<div class="home-indicator"></div>';
const brand='<div class="brand">애프터<span class="brand-dot"></span></div>';
const avatar=(file,cls='')=>`<img class="avatar ${cls}" src="assets/${file}" alt="가상 인물 사진">`;
const nav=`<nav class="bottom-tabs"><a class="selected" href="screen-1-home.html">${icons.home}<span>홈</span></a><a href="screen-3-kkti.html">${icons.explore}<span>탐색</span></a><div>${icons.person}<span>마이</span></div></nav>`;
const wrap=(title,body,type='screen',script='')=>`<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 애프터</title><link rel="stylesheet" href="style.css"></head><body><main class="${type}">${body}</main>${script}</body></html>`;
const home=`${status}<header class="home-top">${brand}<a class="icon-button" href="screen-3-kkti.html" aria-label="카톡 연애 유형 보기">${icons.heart}</a></header>
<h1 class="home-title">민서님,<br>오늘은 어떤 사이예요?</h1>
<div class="home-photo"><img src="assets/cafe-couple.png" alt="카페에서 대화하는 가상의 20대 남녀"><div class="photo-bubble">카톡 한 장이면 충분해요${icons.heart}</div></div>
<a class="primary capture" href="screen-2-result.html">${icons.image}캡처 올리기</a><div class="free-note">오늘 무료 상담 <b>2회</b> 남았어요</div>
<div class="situation"><label for="situation">캡처 없이 상황만 적어도 돼요</label><textarea id="situation" placeholder="어떤 말을 보내면 좋을까요?"></textarea><a href="screen-2-result.html" class="send" aria-label="상황으로 상담하기">${icons.arrow}</a></div>
<section class="recent"><h2>최근 상담</h2><a class="recent-row" href="screen-2-result.html">${avatar('portrait-man.png')}<div><b>도윤</b><p>다음 약속, 먼저 물어봐도 될까요?</p></div><span class="temp-pill">25°</span></a><a class="recent-row" href="screen-2-result.html">${avatar('portrait-woman.png')}<div><b>수연</b><p>주말에 같이 전시 보러 가기로 했어요</p></div><span class="temp-pill light">15°</span></a></section>${nav}${indicator}`;
fs.writeFileSync(path.join(dir,'screen-1-home.html'),wrap('홈',home));
const replies=[
 {tone:'무난하게',rate:92,text:'나도 재밌었어 ㅎㅎ<br>다음에 또 보자!',note:'상대의 편한 말투에 맞췄어요'},
 {tone:'센스 있게',rate:89,text:'그러게 ㅎㅎ 시간이 너무 빨리 갔어.<br>다음엔 아까 말한 카페 가자',note:'대화 속 이야기를 자연스럽게 이어가요'},
 {tone:'직진',rate:85,text:'나도 또 보고 싶어 ㅎㅎ<br>이번 주 토요일 어때?',note:'마음을 전하고, 다음 약속을 잡아요'}
];
const cards=replies.map((r,i)=>`<article class="reply-card" data-index="${i}"><div class="reply-top"><b>${r.tone}</b><span>${i+1}/3</span></div><div class="success"><span>성공 확률</span><strong>${r.rate}<small>%</small></strong></div><p class="reply-text">${r.text}</p><p class="reply-note">${r.note}</p><button class="copy-button" data-copy="${i}">${icons.copy}답장 복사</button></article>`).join('');
const result=(active=0)=>`${status}<header class="page-top"><a class="icon-button" href="screen-1-home.html" aria-label="뒤로">${icons.back}</a><h1>도윤님과의 대화</h1><button class="icon-button" aria-label="더 보기">${icons.more}</button></header>
<section class="incoming">${avatar('portrait-man.png')}<div><div class="incoming-label">도윤 · 상대가 보낸 말</div><div class="message">오늘 재밌었어 ㅎㅎ<br>다음에 또 보자</div></div></section>
<section class="mind"><div class="section-label"><h2>지금, 상대의 속마음</h2><span>대화를 바탕으로 분석했어요</span></div><div class="mind-grid"><div class="primary-mind"><span>관심 있음</span><strong>62<small>%</small></strong></div><div><span>바빠서</span><strong>23<small>%</small></strong></div><div><span>선 긋는 중</span><strong>15<small>%</small></strong></div></div></section>
<section class="replies"><div class="blur-photo"></div><div class="reply-heading"><h2>이렇게 답장해봐요</h2><div class="card-controls"><button id="previous" class="icon-button" aria-label="이전 답장">${icons.back}</button><button id="next" class="icon-button" aria-label="다음 답장">${icons.chevron}</button></div></div><div class="carousel"><div class="card-track" style="transform:translateX(-${active*330}px)">${cards}</div></div><div class="carousel-bottom"><div class="dots">${replies.map((r,i)=>`<i class="${i===active?'on':''}"></i>`).join('')}</div><span>오른쪽으로 넘기면 복사돼요${icons.arrow}</span></div></section>
<section class="temperature"><div><b>호감 온도</b><span>지난 대화보다 <em>+10°</em></span></div><strong>25<span>°</span></strong></section>${indicator}<div class="toast" role="status">${icons.check}답장을 복사했어요</div>`;
const resultScript=(active=0)=>`<script>
let active=${active};const track=document.querySelector('.card-track');const dots=[...document.querySelectorAll('.dots i')];const replies=${JSON.stringify(replies.map(r=>r.text.replace(/<br>/g,' ')))};
function show(i){active=(i+3)%3;track.style.transform='translateX(-'+active*330+'px)';dots.forEach((d,j)=>d.classList.toggle('on',j===active));}
document.querySelector('#next').onclick=()=>show(active+1);document.querySelector('#previous').onclick=()=>show(active-1);
async function copyReply(i){try{await navigator.clipboard.writeText(replies[i]);document.querySelector('.toast').classList.add('visible');setTimeout(()=>document.querySelector('.toast').classList.remove('visible'),1800);}catch(e){document.querySelector('.toast').textContent='답장을 길게 눌러 복사해주세요';document.querySelector('.toast').classList.add('visible');setTimeout(()=>document.querySelector('.toast').classList.remove('visible'),2200);}}
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copyReply(+b.dataset.copy));let start=null;track.onpointerdown=e=>{if(e.target.closest('button'))return;start=e.clientX;};track.onpointerup=e=>{if(start===null)return;const dx=(e.clientX-start)/3;if(dx>40)copyReply(active);else if(dx< -40)show(active+1);start=null;};track.onpointercancel=()=>start=null;
</script>`;
fs.writeFileSync(path.join(dir,'screen-2-result.html'),wrap('답장 코칭',result(), 'screen result',resultScript()));
for(let i=1;i<3;i++) fs.writeFileSync(path.join(dir,`screen-2-result-${i+1}.html`),wrap('답장 코칭',result(i),'screen result',resultScript(i)));
const kkti=`${status}<header class="page-top"><a class="icon-button" href="screen-1-home.html" aria-label="뒤로">${icons.back}</a><h1>나의 카톡 연애 유형</h1><button class="icon-button" aria-label="결과 메뉴">${icons.more}</button></header><section class="personality-card"><img class="personality-photo" src="assets/portrait-woman.png" alt="창가에 앉은 가상의 26세 한국인 여성"><div class="type-count">16가지 카톡 연애 유형</div><div class="type-caption"><div class="type-label">직진 불도저</div><h2>좋으면,<br>티가 나요.</h2><div class="type-bottom"><span>마음이 먼저 움직이는 편</span>${brand}</div></div></section><p class="type-description">돌려 말하기보다,<br>마음이 먼저 보여요.</p><button class="primary share-result">${icons.share}결과 공유하기</button><button class="compatibility">친구와 궁합 보기${icons.chevron}</button>${indicator}`;
fs.writeFileSync(path.join(dir,'screen-3-kkti.html'),wrap('카톡 연애 유형',kkti,'screen kkti'));
const store=`<header class="store-brand">${brand}</header><h1 class="store-title">만남 다음에도,<br>대화가 이어지게</h1><p class="store-subtitle">카톡 한 장으로, 나다운 답장 3가지</p><div class="store-photo"><img src="assets/cafe-couple.png" alt="함께 웃는 가상의 한국인 성인 남녀"><div class="store-chat"><span>도윤</span><p>오늘 재밌었어 ㅎㅎ 다음에 또 보자</p></div></div><div class="store-reply"><div class="store-reply-head"><b>이렇게 답장해봐요</b><span>3/3</span></div><div class="store-answer">나도 또 보고 싶어 ㅎㅎ<br>이번 주 토요일 어때?</div><div class="store-card-bottom"><span>직진 <i>·</i> 성공 확률 <b>85%</b></span><div>${icons.copy}<b>복사</b></div></div></div><div class="store-foot"><img src="icon.png" alt="애프터 아이콘"><span>첫 만남 다음, 애프터까지.</span></div>`;
fs.writeFileSync(path.join(dir,'store-1.html'),wrap('스토어 첫 장',store,'store'));
const board=`<aside class="board-meta">${brand}<p class="board-tagline">첫 만남 다음,<br>애프터까지.</p><p class="board-copy">나다운 답장으로<br>이어가는 우리 사이</p><img class="board-icon" src="icon.png" alt="애프터 아이콘"><div class="palette"><div><i class="sunset"></i><span>#FF3D6E<br>#FF8A3D</span></div><div><i class="blush"></i><span>#FFF3F5</span></div><div><i class="lilac"></i><span>#F1EDFA</span></div></div><div class="board-type"><span>프리텐다드 · 굵게 / 중간</span><b>가까워지는 말 한마디</b></div></aside><section class="board-phones">${[['store-1.png','스토어 · 첫인상'],['screen-1-home.png','홈 · 대화의 시작'],['screen-2-result.png','코칭 · 나다운 답장'],['screen-3-kkti.png','카톡 유형 · 나를 알아가기']].map(([file,label],i)=>`<div class="phone-column"><div class="phone"><img src="${file}" alt="${label}">${i===0?'<div class="mock-island"></div>':''}</div><p>${label}</p></div>`).join('')}</section><footer class="board-footer"><span>사진이 전하는 설렘. 답장으로 이어지는 대화.</span><span>애프터 · 브랜드와 화면</span></footer>`;
fs.writeFileSync(path.join(dir,'board.html'),wrap('브랜드 보드',board,'board'));
console.log('P-photo HTML generated');
