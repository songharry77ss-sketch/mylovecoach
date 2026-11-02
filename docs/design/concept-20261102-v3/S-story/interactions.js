(() => {
  let timeout;
  function notify(text){const el=document.querySelector('.toast');if(!el)return;el.textContent=text;el.classList.add('visible');clearTimeout(timeout);timeout=setTimeout(()=>el.classList.remove('visible'),2200);}
  document.querySelectorAll('[data-toast]').forEach(el=>el.addEventListener('click',()=>notify(el.dataset.toast)));
  document.querySelectorAll('[data-copy]').forEach(el=>el.addEventListener('click',async()=>{
    const card=el.closest('.reply');
    if(card){
      const final=document.querySelector('.ready-scene');
      final.querySelector('.message-bubble').innerHTML=card.querySelector('p').innerHTML;
      final.querySelector('[data-copy]').dataset.copy=el.dataset.copy;
      const tone=card.querySelector('.tone').firstChild.textContent.trim();
      final.querySelector('.scene-foot').textContent=tone+' · 성공 확률 '+card.querySelector('.success b').textContent;
    }
    try{await navigator.clipboard.writeText(el.dataset.copy);notify('답장을 복사했어요. 내 말투로 보내요!');}
    catch{const input=document.createElement('textarea');input.value=el.dataset.copy;input.style.position='fixed';input.style.left='-9999px';document.body.append(input);input.select();const copied=document.execCommand('copy');input.remove();notify(copied?'답장을 복사했어요.':'복사가 지원되지 않아요. 답장 문장을 선택해 주세요.');}
  }));
  if(!document.getElementById('story-app'))return;
  const titles=['상대가 보낸 말','속마음','답장 3가지','호감 온도','답장 복사'];
  const params=new URLSearchParams(location.search);
  let step=Math.min(5,Math.max(1,Number(params.get('step'))||3));
  function render(){document.querySelectorAll('.story-scene').forEach((el,i)=>el.classList.toggle('active',i===step-1));document.querySelectorAll('.story-progress i').forEach((el,i)=>{el.className=i<step-1?'done':i===step-1?'current':'';});document.querySelector('.stage-label').textContent=step+'/5 · '+titles[step-1];document.querySelector('.previous').disabled=step===1;document.querySelector('.next span').textContent=step===5?'홈으로 돌아가기':'다음 · '+titles[step];}
  document.querySelector('.previous').addEventListener('click',()=>{step=Math.max(1,step-1);render();});
  document.querySelector('.next').addEventListener('click',()=>{if(step===5){location.href='screen-1-home.html';return;}step++;render();});
  document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'&&step<5){step++;render();}if(e.key==='ArrowLeft'&&step>1){step--;render();}});
  render();
})();
