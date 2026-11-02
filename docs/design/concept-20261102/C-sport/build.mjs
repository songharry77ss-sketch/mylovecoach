import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const dir=path.dirname(fileURLToPath(import.meta.url));
const icons={
arrow:'<path d="M5 12h14M13 5l7 7-7 7"/>',back:'<path d="M19 12H5m7-7-7 7 7 7"/>',plus:'<path d="M12 5v14M5 12h14"/>',photo:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',pen:'<path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15z"/>',home:'<path d="m3 10 9-7 9 7v10H4V10m5 10v-7h6v7"/>',compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',check:'<path d="m5 12 4 4L19 6"/>',share:'<path d="M12 15V2m-5 5 5-5 5 5M5 11H3v10h18V11h-2"/>',link:'<path d="m10 14 4-4M8 15l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 14a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"/>',repeat:'<path d="M19 8a8 8 0 1 0 1 7M19 3v6h-6"/>',wifi:'<path d="M2 8a16 16 0 0 1 20 0M6 12a10 10 0 0 1 12 0M10 16a4 4 0 0 1 4 0"/><circle cx="12" cy="20" r=".8" fill="currentColor"/>',signal:'<path d="M3 18v3M8 13v8M13 8v13M18 3v18" stroke-width="4"/>'};
const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.arrow}</svg>`;
const status=`<div class="status"><span>9:41</span><div class="island"></div><div class="status-icons">${icon('signal')}${icon('wifi')}<div class="battery"></div></div></div>`;
const indicator='<div class="home-indicator"></div>';
const nav=(title,right='')=>`<div class="nav pos row"><button aria-label="뒤로">${icon('back')}</button><span class="nav-title">${title}</span>${right||'<span class="nav-side caps">직진</span>'}</div>`;
const wrap=(title,body)=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>직진 — ${title}</title><meta name="viewport" content="width=1179"><link rel="stylesheet" href="shared.css"></head><body><main class="screen">${status}${body}${indicator}</main></body></html>`;
const tabs=`<nav class="tabs" aria-label="하단 메뉴">${[['home','홈'],['compass','탐색'],['user','마이']].map(([i,t],n)=>`<button class="tab ${n===0?'active':''}"><span class="tab-icon">${icon(i)}</span>${t}</button>`).join('')}</nav>`;
const home=`
<div class="nav pos row"><div class="brand"><img src="icon.png" alt="직진 아이콘"><strong>직진</strong><span class="caps">JIKJIN</span></div><button class="plus" aria-label="새 상담">${icon('plus')}</button></div><div class="divider"></div>
<section class="hero pos"><img src="_art/velocity-object.png" alt="볼트 연두와 블랙 메탈의 입체 화살표"><div class="hero-copy"><div class="hello"><i class="dot"></i>안녕하세요, 민준님</div><h1>답장 고민,<br>여기서 끝.</h1><p>망설이지 말고, 직진.<br>센스 있는 한마디를 함께 찾아요.</p></div></section>
<button class="capture pos"><span class="capture-icon">${icon('photo')}</span><span class="text"><strong>캡처 올리기</strong><span class="sub">대화 한 장 → 답장 3가지 + 호감 온도</span></span><span class="arrow-box">${icon('arrow')}</span></button>
<section class="situation pos"><div class="label">${icon('pen')}상황만 적어도 괜찮아요</div><div class="input-row"><p>소개팅 후, 다음 약속을<br>어떻게 잡을까요?</p><button aria-label="상황 보내기">${icon('arrow')}</button></div></section>
<div class="quota pos row"><span class="free-label"><i class="dot"></i>오늘 남은 무료 코칭</span><strong class="free-num num">01<small>회</small></strong></div>
<div class="recent-heading pos row"><h2>이어가는 대화</h2><span>최근 상담</span></div>
<div class="recents pos"><article class="recent"><div class="avatar">수</div><div class="recent-copy"><div class="recent-top"><strong>수연</strong><span>방금 전</span></div><p>토요일 전시 약속, 자연스럽게 이어가기</p></div><div class="temp num">25°<small>+10°</small></div></article><article class="recent"><div class="avatar">지</div><div class="recent-copy"><div class="recent-top"><strong>지민</strong><span>어제</span></div><p>소개팅 다음 날, 첫 인사는 어떻게?</p></div><div class="temp num">15°<small>호감 온도</small></div></article></div>
<button class="discover pos"><div class="copy"><div class="caps">KKTI / MY PLAY STYLE</div><h3>나는 어떤 연애 플레이어?</h3></div><img src="_art/player-emblem.png" alt="KKTI 불도저 트로피">${icon('arrow')}</button>
${tabs}`;
const mind=[['관심 있음',62],['편한 대화',23],['아직 탐색 중',15]].map(([t,n],i)=>`<div class="mind-row ${i===0?'primary':''}"><span>${t}</span><div class="track"><i style="width:${n}%"></i></div><strong class="percentage num">${n}%</strong></div>`).join('');
const replies=[
{tone:'무난하게',score:88,text:'좋아요! 토요일 오후에 봬요.<br>맛있는 곳도 찾아볼게요.'},
{tone:'센스 있게',score:95,text:'전시 보고 맛있는 저녁까지,<br>토요일이 벌써 기대되네요.',best:true},
{tone:'직진',score:82,text:'저도 더 이야기하고 싶었어요.<br>토요일에 만나요!'}
].map((r,i)=>`<article class="reply-card ${r.best?'recommended':''}"><div class="reply-top"><span class="index">0${i+1}</span><h3>${r.tone}</h3>${r.best?'<span class="recommend-label">추천</span>':''}</div><p class="reply-text">${r.text}</p><div class="score"><label>성공 확률</label><span>${r.score}<small>%</small></span></div><div class="score-track"><i style="width:${r.score}%"></i></div><button class="copy-btn" aria-label="${r.tone} 답장 복사">${icon('copy')}복사</button></article>`).join('');
const result=`${nav('수연 · 코칭 결과')}
<section class="result-lead pos"><div class="caps"><i class="dot"></i>YOUR NEXT MOVE</div><h1>지금, 이렇게 답장.</h1></section>
<section class="summary pos"><div class="summary-head"><strong>상대 메시지 요약</strong><span>수연 · 방금 전</span></div><p>“토요일 오후 좋아요. 끝나고 밥도 먹어요!”</p></section>
<section class="mind pos"><div class="mind-head row"><h2>속마음 읽기</h2><span>대화 맥락으로 본 가능성</span></div>${mind}</section>
<div class="replies-label pos"><h2>답장 3가지</h2><span class="tag">${icon('check')}존댓말 유지</span></div><section class="reply-list pos">${replies}</section>
<section class="heat pos"><div class="heat-head"><span class="title">호감 온도</span><span class="heat-score">25°<b>+10°</b></span></div><div class="heat-track"><i></i></div><div class="heat-foot"><span>함께할 시간을 기대하고 있어요</span><span>0° — 100°</span></div></section>
<p class="result-note pos">상대의 페이스를 존중하며, 내 마음은 분명하게.</p>`;
const stats=[['연락 시작','먼저 연락',92],['답장 속도','즉답',100],['표현','리액션 폭발',83],['진도','직진',92]].map(([axis,pole,n])=>`<div class="stat"><div class="stat-head"><span class="stat-label">${axis}<strong>${pole}</strong></span><strong class="stat-value">${n}%</strong></div><div class="track"><i style="width:${n}%"></i></div></div>`).join('');
const kkti=`${nav('나의 KKTI',`<button aria-label="다시 하기">${icon('repeat')}</button>`)}
<section class="kkti-lead pos"><div class="caps"><i class="dot"></i>MY PLAY STYLE</div><h1>내 연애에도, 스타일이 있다.</h1></section>
<section class="player-card pos"><div class="player-head"><span class="caps">JIKJIN / PLAYER CARD</span><strong class="card-type">선빠폭직</strong></div><div class="player-art"><span class="ghost-word">FORWARD.</span><img src="_art/player-emblem.png" alt="볼트 연두와 티타늄의 직진 불도저"><span class="vertical">KKTI · 16 TYPES</span><div class="player-name"><h2>직진 불도저</h2></div></div><p class="player-sub">좋으면 좋다고, 마음은 분명하게.</p><div class="stats">${stats}</div></section>
<section class="match pos"><div class="match-icon">${icon('link')}</div><div><span class="label">궁합 좋은 유형</span><h3>꼬리 흔드는 골댕이</h3><p class="match-code">후빠폭직 · 같은 템포로 주고받는 대화</p></div></section>
<section class="coach-note pos"><span class="label">COACH'S NOTE</span><p>설렘은 그대로, 속도만 반 박자 늦춰 보세요.<br>상대가 다가올 자리도 남겨 두면 좋아요.</p></section>
<button class="share pos">${icon('share')}결과 공유하기</button><p class="kkti-note pos">카톡 습관으로 보는 나의 연애 유형</p>`;
for(const [name,title,body] of [['screen-1-home','홈',home],['screen-2-result','코칭 결과',result],['screen-3-kkti','KKTI 결과',kkti]])writeFileSync(path.join(dir,`${name}.html`),wrap(title,body));
console.log('Generated 3 HTML screens in C-sport.');
