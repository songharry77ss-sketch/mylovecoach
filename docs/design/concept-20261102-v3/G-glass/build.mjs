import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const paths = {
  back:'<path d="m15 5-7 7 7 7"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  up:'<path d="M12 19V5m-6 6 6-6 6 6"/>',
  photo:'<rect x="3" y="4" width="18" height="16" rx="4"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
  home:'<path d="m3 10 9-7 9 7v10H15v-7H9v7H3z"/>',
  explore:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"/>',
  person:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  copy:'<rect x="8" y="7" width="12" height="14" rx="3"/><path d="M15 7V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/>',
  share:'<path d="M8 7H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3M12 16V2m-5 5 5-5 5 5"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
};
const svg=(n,cls='')=>`<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n]}</svg>`;
const photo='<img class="scene-photo" src="assets/riverside-couple.png" alt="햇살 아래 웃는 가상의 한국인 성인 남녀">';
const scene=(cls='')=>`<div class="scene ${cls}" aria-hidden="true">${photo}<div class="scene-veil"></div></div>`;
const brand=(cls='')=>`<div class="brand ${cls}"><img src="icon.png" alt=""><span>청신호</span></div>`;
const status=()=>`<div class="status"><b>9:41</b><div class="island"></div><div class="status-right"><svg viewBox="0 0 30 22" aria-hidden="true"><rect x="1" y="15" width="5" height="7" rx="1"/><rect x="9" y="10" width="5" height="12" rx="1"/><rect x="17" y="5" width="5" height="17" rx="1"/><rect x="25" width="5" height="22" rx="1"/></svg><svg viewBox="0 0 30 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" aria-hidden="true"><path d="M3 7Q15-3 27 7M8 13q7-6 14 0M13 19q2-2 4 0"/></svg><div class="battery"></div></div></div>`;
const safe=()=>'<div class="home-indicator"></div>';
const nav=title=>`<header class="detail-nav"><button class="round glass" aria-label="뒤로">${svg('back')}</button><b>${title}</b><button class="round glass" aria-label="더 보기">${svg('more')}</button></header>`;
const tabs=()=>`<nav class="tabs glass" aria-label="하단 탐색"><button class="active">${svg('home')}<span>홈</span></button><button>${svg('explore')}<span>탐색</span></button><button>${svg('person')}<span>마이</span></button></nav>`;
const avatar=(who='woman')=>`<div class="avatar ${who}"><img src="assets/riverside-couple.png" alt="${who==='woman'?'수연':'도윤'}"></div>`;
const frame=(body,type,title)=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · 청신호</title><link rel="stylesheet" href="style.css"></head><body class="${type}"><main class="canvas">${body}</main></body></html>`;
const write=(name,body,type='app',title=name)=>fs.writeFileSync(path.join(dir,name+'.html'),frame(body,type,title));

write('screen-1-home',`${scene('home-scene')}${status()}
  <header class="home-header">${brand()}<span class="quiet-pill glass"><i class="signal-dot"></i>답장 코치</span></header>
  <section class="greeting"><p>지수님, 안녕하세요</p><h1>그 사람,<br>청신호일까요?</h1></section>
  <section class="start-panel glass"><div class="panel-title"><h2>답장 고민, 여기까지.</h2><span>캡처 한 장이면 돼요</span></div>
    <button class="primary upload">${svg('photo')}<span>캡처 올리기</span>${svg('arrow')}</button>
    <p class="remaining">오늘 무료 <b>2회</b> 남았어요</p>
    <button class="situation"><div><span>캡처가 없어도 괜찮아요</span><b>상황만 적어볼래요</b></div>${svg('arrow')}</button>
  </section>
  <section class="recent"><div class="section-head"><h2>최근 상담</h2><span>이어 이야기해요</span></div>
    <div class="recent-row">${avatar()}<div class="recent-copy"><b>수연</b><p>토요일 약속, 뭐라고 답할까요?</p></div><strong class="temp-pill">35°</strong></div>
    <div class="recent-row">${avatar('man')}<div class="recent-copy"><b>도윤</b><p>다음 약속, 먼저 잡아도 될까요?</p></div><strong class="temp-pill neutral">25°</strong></div>
  </section>${tabs()}${safe()}`,'app home','홈');

const answers=[
  {type:'무난하게',score:84,text:'좋아 ㅎㅎ 토요일에 보자.<br>맛있는 것도 같이 먹자!',recommended:false},
  {type:'센스 있게',score:92,text:'전시 보고 맛집까지?<br>토요일 코스 완벽한데 ㅎㅎ',recommended:true},
  {type:'직진',score:78,text:'좋아. 사실 전시보다<br>너 만나는 게 더 기대돼 ㅎㅎ',recommended:false}
];
const answerCard=a=>`<article class="answer-card glass ${a.recommended?'recommended':''}"><div class="answer-text"><div class="answer-label"><h3>${a.type}</h3>${a.recommended?'<span class="recommend-badge">추천</span>':''}</div><p>${a.text}</p></div><div class="answer-side"><div class="success"><span>성공 확률</span><strong>${a.score}<small>%</small></strong></div><button class="copy-button" data-copy="${a.text.replace('<br>',' ')}">${svg('copy')}복사</button></div></article>`;
write('screen-2-result',`${scene('soft-scene')}${status()}${nav('수연과의 대화')}
  <section class="received"><div class="received-label">${avatar()}<span>수연이 보냈어요</span></div><div class="message glass">토요일 오후 좋아!<br>끝나고 밥도 먹자 ㅎㅎ</div></section>
  <section class="mind-card glass"><div class="mind-main"><div class="signal-label"><i class="signal-dot"></i><b>지금은 청신호</b></div><div class="mind-number">62<small>%</small></div><p>관심 있을 가능성</p></div><div class="mind-detail"><p>다음 약속을 함께<br>이어가고 싶어 해요.</p><div><span>바빠서</span><b>23%</b></div><div><span>선 긋는 중</span><b>15%</b></div></div><div class="probability-track"><i></i><i></i><i></i></div></section>
  <section class="answers"><div class="section-head"><h2>이렇게 답장해요</h2><span>내 말투에 맞춘 3가지</span></div>${answers.map(answerCard).join('')}</section>
  <section class="temperature glass"><div><b>호감 온도</b><p>지난 대화보다 따뜻해졌어요</p></div><div class="temperature-score"><span>25°</span>${svg('arrow')}<strong>35°</strong><b>+10°</b></div></section>
  <p class="result-note">대화로 추정한 가능성이에요</p>${safe()}<div class="toast" role="status"></div><script src="preview.js"></script>`,'app result','코칭 결과');

write('screen-3-kkti',`${scene('soft-scene kkti-scene')}${status()}${nav('나의 카톡 연애 유형')}
  <section class="kkti-heading"><p>카톡 습관으로 알아봐요</p><h1>좋아하는 마음,<br>티가 나는 편.</h1></section>
  <section class="share-card glass"><img class="share-photo" src="assets/riverside-couple.png" alt="밝게 웃는 가상의 성인 남녀"><div class="share-fade"></div><span class="type-chip glass">16가지 카톡 연애 유형</span><div class="share-copy"><div class="type-label"><i class="signal-dot"></i>직진 불도저</div><h2>좋으면,<br>먼저 말해요.</h2><div class="sample-bubble glass">“나는 너랑 또 보고 싶은데.”</div><div class="type-footer"><span>마음을 숨기기보다<br>한 걸음 먼저 다가가요.</span>${brand('mini')}</div></div></section>
  <div class="share-actions"><button class="primary">${svg('share')}결과 공유하기</button><button class="compatibility glass">친구와 궁합 보기${svg('arrow')}</button></div>${safe()}`,'app kkti','연애 유형 공유');

write('store-1',`${scene('store-scene')}<header class="store-header">${brand()}<span class="store-kind">카톡 답장 코치</span></header>
  <section class="store-heading"><h1>그 사람,<br>청신호일까?</h1><p>카톡 한 장, 답장은 세 가지.</p></section>
  <div class="store-message glass"><span>수연</span><p>토요일 오후 좋아! 끝나고 밥도 먹자 ㅎㅎ</p></div>
  <section class="store-result glass"><header><div><span class="recommend-badge">추천 답장</span><h2>센스 있게</h2></div><div class="success"><span>성공 확률</span><strong>92<small>%</small></strong></div></header><p>전시 보고 맛집까지?<br>토요일 코스 완벽한데 ㅎㅎ</p><button class="primary">${svg('copy')}답장 복사하기</button></section><p class="store-bottom"><i class="signal-dot"></i>마음은 선명하게. 답장은 가볍게.</p>`,'store','스토어 첫 장');

const devices=[['store-1','첫인상','그 사람, 청신호일까?'],['screen-1-home','홈','캡처 한 장으로 시작해요'],['screen-2-result','코칭 결과','세 가지 답장을 비교해요'],['screen-3-kkti','연애 유형','나를 닮은 카드로 공유해요']];
write('board',`<div class="board-wash"></div><section class="board-brand"><div class="board-logo">청신호<span></span></div><h1>그 사람,<br>청신호일까?</h1><p class="board-description">사진에 설렘을 담고,<br>대화의 신호를 읽어요.</p><img class="board-icon" src="icon.png" alt="청신호 앱 아이콘"><div class="swatches"><div><i style="background:#14C38E"></i><b>#14C38E</b></div><div><i style="background:#0E1116"></i><b>#0E1116</b></div><div><i style="background:#F4FAF8"></i><b>#F4FAF8</b></div></div><div class="font-spec"><span>프리텐다드</span><b>맑은 사진, 또렷한 한마디.</b><p>미디엄 · 볼드</p></div><p class="board-material">사진 위에 유리 한 겹.<br>초록은 신호가 되는 순간에만.</p></section>
  <section class="board-product"><header><h2>마음은 선명하게. 답장은 가볍게.</h2><span>캡처 한 장 → 답장 세 가지</span></header><div class="phone-grid">${devices.map(([f,label,caption])=>`<figure><figcaption>${label}</figcaption><div class="device"><img src="${f}.png" alt="${label}">${f==='store-1'?'<i class="mock-island"></i>':''}</div><p>${caption}</p></figure>`).join('')}</div></section><footer class="board-footer"><span>청신호 · 브랜드와 화면</span><span>밝은 사진 · 투명한 유리 · 한 번의 행동</span><span>2026. 11. 02.</span></footer>`,'board','브랜드 보드');
console.log('Created 5 HTML canvases in G-glass.');
