import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const shapes={
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>', back:'<path d="m14 5-7 7 7 7"/>', plus:'<path d="M12 5v14M5 12h14"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 6"/>',
  home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  user:'<circle cx="12" cy="7.5" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  share:'<path d="M12 16V3m-5 5 5-5 5 5M6 11H3v10h18V11h-3"/>',
  match:'<path d="m8 5-5 7 5 7m8-14 5 7-5 7M10 16l4-8"/>',
  dots:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
};
const ico=(name,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${shapes[name]}</svg>`;
const status=`<div class="status"><span>9:41</span><div class="island"></div><div class="status-right"><div class="signal"><i></i><i></i><i></i><i></i></div><svg viewBox="0 0 24 20" aria-hidden="true"><path d="M2 6a16 16 0 0 1 20 0M5 10a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg><div class="battery"></div></div></div>`;
const nav=`<nav class="nav" aria-label="주 메뉴"><a class="active" href="screen-1-home.html">${ico('home')}홈</a><a href="screen-3-kkti.html">${ico('compass')}탐색</a><a href="#" data-toast="개인 설정은 실제 앱에서 이용할 수 있어요">${ico('user')}마이</a></nav>`;
const subnav=(name,right='HANSU')=>`<header class="subnav"><a class="round-button" href="screen-1-home.html" aria-label="홈으로">${ico('back')}</a><h1>${name}</h1><span class="right-label">${right}</span></header>`;
const script=`<script>
function toast(text){const t=document.querySelector('.toast');t.textContent=text;t.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>t.classList.remove('show'),1800)}
document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast('답장을 복사했어요')}catch{toast('미리보기 · 실제 앱에서는 답장이 복사돼요')}}));
document.querySelectorAll('[data-toast]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();toast(b.dataset.toast)}));
document.querySelectorAll('[data-result]').forEach(b=>b.addEventListener('click',()=>location.href='screen-2-result.html'));
document.querySelectorAll('[data-share]').forEach(b=>b.addEventListener('click',()=>toast('미리보기 · KKTI 결과를 공유해요')));
</script>`;
const html=(name,body,cls='')=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=1179"><title>한 수 · ${name}</title><link rel="stylesheet" href="style.css"></head><body><div class="screen ${cls}">${status}${body}<div class="home-indicator"></div><div class="toast" role="status"></div></div>${script}</body></html>`;
const home=html('홈',`<main class="home-main">
  <header class="brandbar"><div class="brand-lockup"><img class="brand-logo" src="icon.png" alt="한 수 심벌"><div><div class="wordmark">한 수</div><div class="brand-meta">HANSU</div></div></div><button class="round-button" aria-label="새 상담" data-result>${ico('plus')}</button></header>
  <section class="hello"><p class="greeting">민준님, 안녕하세요.</p><h1>말문이 막힐 때,<br>당신의 <em>다음 한 수.</em></h1></section>
  <section class="capture-hero panel"><img class="hero-art" src="_art/hero-metal.png" alt=""><div class="capture-copy"><div class="eyebrow">THE NEXT MOVE</div><h2>캡처 한 장,<br>답장은 세 가지.</h2><p>상대의 말투에 맞춰 더 자연스럽게</p></div><button class="gold-button" data-result>${ico('image')}캡처 올리기${ico('arrow','arrow')}</button></section>
  <form class="situation" action="screen-2-result.html"><div class="field"><label for="situation">캡처가 없어도 괜찮아요</label><input id="situation" name="situation" placeholder="지금 고민되는 상황을 적어주세요"></div><button type="submit" aria-label="상황으로 코칭 시작">${ico('arrow')}</button></form>
  <div class="quota"><span>오늘 남은 무료 코칭</span><span class="quota-count"><span class="quota-dots"><i></i><i></i><i></i></span><strong>2회</strong></span></div>
  <section class="recent"><div class="section-head"><h2>이어가는 대화</h2><span>최근 상담</span></div><div class="recent-list"><a class="recent-item" href="screen-2-result.html"><div class="avatar">수</div><div class="text"><h3>수연</h3><p>전시가 끝난 뒤, 자연스럽게 저녁 약속까지</p></div><span class="when">방금 전</span><span class="heat-small serif">25°</span></a><a class="recent-item" href="screen-2-result.html"><div class="avatar">지</div><div class="text"><h3>지민</h3><p>소개팅 다음 날, 첫 연락을 어떻게 할까?</p></div><span class="when">어제</span><span class="heat-small serif">15°</span></a></div></section>
  <p class="home-note">상대를 존중하면서, 조금 더 나답게.</p>
</main>${nav}`,'home-screen');
const replies=[
  {n:1,tone:'무난하게',score:92,text:'좋아! 그럼 토요일 오후에 보자.\n전시 보고 맛있는 것도 먹자.',note:'편안하게 약속을 이어가요',featured:true},
  {n:2,tone:'센스 있게',score:88,text:'전시도 기대되는데, 끝나고 먹을\n저녁이 벌써 더 기대되네 ㅎㅎ',note:'가벼운 설렘을 더해요'},
  {n:3,tone:'직진',score:84,text:'좋아. 너랑 같이 가서 더 기대돼.\n토요일에 맛있는 저녁도 먹자.',note:'부담 없이 마음을 전해요'}
];
const replyMarkup=replies.map(r=>`<article class="reply-card ${r.featured?'featured':''}"><div class="reply-main"><div class="reply-label"><span class="reply-order">${r.n}수</span><span class="reply-tone">${r.tone}</span>${r.featured?'<span class="reply-recommended">추천</span>':''}</div><p class="reply-text">${r.text.replace('\n','<br>')}</p><p class="reply-note">${r.note}</p></div><div class="probability"><span class="label">성공 확률</span><div class="value serif">${r.score}<small>%</small></div><button class="copy-button" data-copy="${r.text.replace('\n',' ')}" aria-label="${r.n}수 답장 복사">${ico('copy')}복사</button></div></article>`).join('');
const result=html('코칭 결과',`<main class="sub-main result-main">${subnav('답장의 한 수')}
  <section class="summary"><div class="summary-label">수연 · 상대 메시지 요약<span>전시 약속</span></div><blockquote>“토요일 오후 좋아!<br>끝나고 밥도 먹자.”</blockquote></section>
  <section class="mind"><div class="mind-head"><h2>지금, 상대의 속마음</h2><p>대화 맥락 기반 추정</p></div><div class="mind-row"><span>관심 있음</span><div class="track"><i style="width:62%"></i></div><b>62%</b></div><div class="mind-row"><span>편안한 친밀감</span><div class="track"><i style="width:23%"></i></div><b>23%</b></div><div class="mind-row"><span>가벼운 제안</span><div class="track"><i style="width:15%"></i></div><b>15%</b></div></section>
  <div class="reply-heading"><h2>어떤 한 수를 둘까요?</h2><span>말투에 맞춘 답장 3가지</span></div><section class="reply-list" aria-label="추천 답장">${replyMarkup}</section>
  <section class="heat-panel"><div class="heat-top"><h2>호감 온도</h2><span class="heat-delta">이전 대화보다 +10°</span></div><div class="heat-main"><div class="heat-value serif">25°</div><div class="heat-detail"><p>조금씩 가까워지고 있어요.</p><div class="heat-scale"></div><div class="heat-endpoints"><span>0°</span><span>100°</span></div></div></div></section><p class="result-footnote">마음을 단정하기보다, 다음 대화를 위한 참고로 봐주세요.</p>
</main>`,'result-screen');
const axes=[['연락 시작','먼저 연락',92],['답장 속도','즉답',83],['표현','리액션 폭발',100],['진도','직진',92]];
const kkti=html('KKTI 결과',`<main class="sub-main kkti-main">${subnav('나의 KKTI','16 TYPES')}
  <section class="kkti-card"><div class="card-overline"><span>HANSU · PERSONALITY</span><span>01 / 16</span></div><div class="kkti-title"><p>마음이 움직이면, 망설임 없이.</p><h2>직진 불도저</h2></div><img class="kkti-art" src="_art/kkti-metal.png" alt="직진을 상징하는 샴페인 골드 조형물"><div class="kkti-art-label">THE STRAIGHTFORWARD</div><div class="type-code">${['선','빠','폭','직'].map((t,i)=>`<div class="type-cell"><strong>${t}</strong><span>${axes[i][1]}</span></div>`).join('')}</div><div class="stats"><div class="stats-header"><h3>나의 대화 성향</h3><span>카톡 습관으로 본 연애 유형</span></div>${axes.map(a=>`<div class="stat"><div class="stat-head"><span>${a[0]} · ${a[1]}</span><b>${a[2]}%</b></div><div class="track"><i style="width:${a[2]}%"></i></div></div>`).join('')}</div><div class="card-footer"><span>한 수</span><span>연애의 한 수</span></div></section>
  <section class="match"><div class="match-mark">${ico('match')}</div><div><small>궁합 좋은 유형</small><h3>꼬리 흔드는 골댕이</h3></div><span class="match-code">후빠폭직</span></section>
  <p class="kkti-advice">설렘은 그대로, 속도만 반 박자 늦춰 보세요.<br>상대가 다가올 자리를 남겨 두면 더 깊어져요.</p>
  <button class="gold-button share-button" data-share>${ico('share')}내 유형 공유하기</button>
</main>`,'kkti-screen');
for(const [name,contents] of [['screen-1-home.html',home],['screen-2-result.html',result],['screen-3-kkti.html',kkti]])fs.writeFileSync(path.join(dir,name),contents,'utf8');
console.log('Built 3 HTML screens in B-gold.');
