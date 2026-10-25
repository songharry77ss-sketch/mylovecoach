"""S2: six distinct compositions made only from original app captures + AI portraits.
Run from repository root. The requested render.mjs is used unchanged.
"""
from pathlib import Path
import json

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]
NAMES = ['1-chat-replies','2-practice','3-mind','4-report','5-kkti','6-home']
COLORS = ['#940051','#4e21bd','#005c85','#9d300e','#3444aa','#00634e']
PHOTOS = ['01-point-woman-cutout','02-heart-man','03-think-woman','04-laugh-man','05-friends','06-wink-man']
COPY = [
 ('뭐라고 답장하지?','<em>캡처 한 장</em>이면 끝','호칭·말투 그대로, 답장 3가지'),
 ('실전 전에','AI랑 <em>카톡 연습</em>','보낼 때마다 코치가 바로 피드백'),
 ('그 사람 속마음','가능성은 <em>몇 %?</em>','하나의 상황을 여러 가능성으로'),
 ('대화 속에 담긴','우리 <em>호감 온도</em>','온도 변화부터 상대 분석 보고서까지'),
 ('카톡 습관 속','나의 <em>연애 유형</em>','16가지 유형 · 나만의 연애 컬러'),
 ('캡처 없이','<em>상황만</em> 적어도 OK','연습·속마음·비밀 상담까지 한 앱에')]

HEART = '<svg viewBox="0 0 200 200" fill="none"><path d="M100 169C72 147 21 109 22 66C23 20 77 14 100 53C125 12 179 24 178 67C177 111 125 151 100 169Z" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>'
STAR = '<svg viewBox="0 0 200 200"><path d="M100 6L120 62L173 28L149 83L197 101L143 120L173 174L119 147L100 197L80 147L26 175L53 121L4 101L56 81L29 28L81 58Z" fill="currentColor" stroke="white" stroke-width="8" stroke-linejoin="round"/></svg>'
CHAT = '<svg viewBox="0 0 230 210"><path d="M23 17H196Q216 17 216 40V139Q216 160 193 160H91L42 195L47 160H28Q8 160 8 140V40Q8 17 23 17Z" fill="currentColor" stroke="white" stroke-width="10" stroke-linejoin="round"/><path d="M62 72Q78 54 94 72M137 72Q153 54 169 72M84 108Q115 135 147 108" stroke="#20362a" stroke-width="10" fill="none" stroke-linecap="round"/></svg>'

CSS = r'''
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font-family:Pretendard,sans-serif;color:white}
.stage{position:relative;width:1290px;height:var(--h);background:var(--bg);overflow:hidden;isolation:isolate;transform:scale(var(--scale));transform-origin:0 0}
.wash{position:absolute;inset:0;background:linear-gradient(145deg,#ffffff07,transparent 55%,#1c003022);z-index:-3}
.ribbon{position:absolute;inset:0;z-index:-2;opacity:.2}.ribbon svg{width:100%;height:100%}
.brand{position:absolute;left:80px;top:166px;font-size:36px;font-weight:700;display:flex;align-items:center;gap:16px;white-space:nowrap}.brand svg{width:44px;height:44px;color:#fff18e}
header{position:absolute;left:55px;right:55px;top:280px;text-align:center;z-index:10}h1{margin:0;font-size:140px;line-height:1.12;letter-spacing:-7.5px;font-weight:700}h1 span{display:block;white-space:nowrap}em{font-style:normal;color:#fff18e}.sub{font-size:43px;line-height:1.35;letter-spacing:-1.7px;margin:32px 0 0;font-weight:500}
.s1 header{text-align:left;left:75px;right:30px}.s3 header,.s6 header{top:auto;bottom:300px}.s3 .brand,.s4 .brand,.s5 .brand,.s6 .brand,.s2 .brand{left:50%;transform:translateX(-50%)}
.placed{position:absolute;left:calc(var(--x)*1px);top:calc(var(--y)*1px);width:calc(var(--w)*1px);transform:rotate(calc(var(--r,0)*1deg));z-index:var(--z,2)}
.crop{position:relative;width:100%;aspect-ratio:var(--cw)/var(--ch);overflow:hidden;background:white}.crop>img{position:absolute;display:block;width:calc(1290/var(--cw)*100%);max-width:none;height:auto;left:calc(-1*var(--cx)/var(--cw)*100%);top:calc(-1*var(--cy)/var(--ch)*100%)}
.feature,.bubble,.tile,.token{border:14px solid white;border-radius:40px;overflow:hidden;background:white;box-shadow:0 16px 0 #1e09332a,0 26px 55px #10002525}.feature .crop,.tile .crop,.bubble .crop{border-radius:24px}.bubble{border-width:16px;border-radius:46px}
.phone{padding:15px;background:linear-gradient(110deg,#77757b,#111116 12%,#323239 84%,#aaa6ad);border-radius:85px;box-shadow:0 35px 55px #21071e44,inset 0 0 0 3px #ddd7e7aa}.screen{border-radius:70px;overflow:hidden;background:white;padding:65px 0 24px;position:relative}.screen>img{width:100%;display:block}.island{position:absolute;top:18px;left:50%;transform:translateX(-50%);width:170px;height:39px;background:#08080a;border-radius:40px;z-index:2}.homebar{position:absolute;bottom:10px;left:33%;width:34%;height:7px;background:#13131a;border-radius:12px}
.portrait{overflow:hidden;border:14px solid white;background:#fff8ef;box-shadow:12px 20px 0 #1d063329}.portrait img{width:100%;height:100%;object-fit:cover;display:block}.round{aspect-ratio:1;border-radius:50%}.round img{object-position:center 18%;transform:scale(1.12);transform-origin:center 25%}.cutout{border:0;background:none;box-shadow:none;overflow:visible;filter:drop-shadow(8px 0 0 white) drop-shadow(-8px 0 0 white) drop-shadow(0 -8px 0 white) drop-shadow(0 8px 0 white) drop-shadow(8px 16px 0 #240d2b30)}.cutout img{height:auto;object-fit:contain}
.sticker{filter:drop-shadow(0 9px 0 #24103150);pointer-events:none}.sticker svg{width:100%;display:block}.star{color:#ffe779}.heart{color:#ff94bf}.chat{color:#bcf6d2}
.number{font-size:450px;line-height:1;letter-spacing:-25px;font-weight:700;color:#fff18e;text-shadow:8px 12px 0 #063c61;white-space:nowrap}.number small{font-size:.52em;letter-spacing:-8px}.boost{font-size:245px;line-height:1;font-weight:700;letter-spacing:-14px;color:#ff8dbb;-webkit-text-stroke:12px white;paint-order:stroke fill;text-shadow:8px 14px 0 #220950;white-space:nowrap}
.thought{border-radius:48% 48% 46% 36%;aspect-ratio:1.03;overflow:visible;background:white}.thought img{border-radius:48% 48% 46% 36%;object-position:center 25%;object-fit:cover}.thought:after{content:'';position:absolute;bottom:-62px;left:20px;width:48px;height:48px;background:white;border-radius:50%;box-shadow:-40px 62px 0 -9px white}
.polaroid{border:17px solid white;border-bottom:50px solid white;border-radius:8px;aspect-ratio:.82;box-shadow:0 12px 0 #11173333,0 20px 45px #0002}.polaroid img{object-fit:cover}.polaroid.left img{object-position:center}.polaroid.right img{width:200%;max-width:none;object-position:center 25%;margin-left:-100%}
.heartframe{overflow:visible;border:0;background:none;box-shadow:none;aspect-ratio:1.05;filter:drop-shadow(8px 12px 0 #54171755)}.heartframe svg{width:100%;height:100%;display:block}
.gauge{border-radius:55px;border-width:19px}.gauge-label{display:flex;justify-content:center;align-items:center;gap:28px;color:#852736;font-size:145px;line-height:1;font-weight:700;letter-spacing:-6px;background:#fff3a5;padding:18px 10px 30px}.gauge-label b{font-size:110px}.gauge .crop{border-radius:20px}
.input{overflow:visible;border-radius:45px;filter:drop-shadow(0 15px 0 #053b3460);box-shadow:none}.input:after{content:'';position:absolute;left:95px;bottom:-55px;border-top:60px solid white;border-right:65px solid transparent}.input .crop{border-radius:28px}
.peek{aspect-ratio:.85;border-radius:48% 48% 20% 20%}.peek img{object-position:center 20%}.smallnote{font-size:34px;line-height:1.4;color:#fff;font-weight:500;letter-spacing:-.8px;text-align:center}
.footer{position:absolute;left:80px;right:80px;bottom:150px;display:flex;justify-content:space-between;font-size:29px;line-height:1.3;letter-spacing:-.5px;z-index:20}.footer .page{opacity:.7;letter-spacing:3px;font-size:27px}
@media(min-aspect-ratio:1/2){
 .placed{left:calc(var(--px,var(--x))*1px);top:calc(var(--py,var(--y))*1px);width:calc(var(--pw,var(--w))*1px);transform:rotate(calc(var(--pr,var(--r,0))*1deg))}
 header{top:258px}h1{font-size:134px;line-height:1.1;letter-spacing:-7px}.sub{font-size:41px;margin-top:27px}.brand{top:160px;font-size:34px}.brand svg{width:41px;height:41px}
 .s3 header{bottom:230px}.s6 header{bottom:278px}.footer{bottom:143px;font-size:27px}.footer .page{font-size:25px}
 .number{font-size:390px}.boost{font-size:200px}.gauge-label{font-size:125px}.gauge-label b{font-size:95px}
}
'''

CROPS=[]
def pos(x,y,w,r=0,z=2,play=None):
    s=f'--x:{x};--y:{y};--w:{w};--r:{r};--z:{z}'
    if play:
        s+=';'+(';'.join(f'--{k}:{v}' for k,v in zip(['px','py','pw','pr'],play)))
    return s

def crop(n,box):
    x,y,x2,y2=box
    CROPS.append({'source':NAMES[n-1]+'.png','box':box})
    return f'<div class="crop" data-source="{NAMES[n-1]}" style="--cx:{x};--cy:{y};--cw:{x2-x};--ch:{y2-y}"><img src="../../ios-6.7/{NAMES[n-1]}.png" alt="실제 앱 원본 캡처 일부"></div>'

def card(n,box,p,cls='feature'):
    return f'<div class="placed {cls}" style="{p}">{crop(n,box)}</div>'

def photo(n,p,cls='round',old=False):
    name=n if isinstance(n,str) else PHOTOS[n-1]
    src=('../../candidates-20261025/_photos/' if old else '../_photos/')+name+'.png'
    return f'<div class="placed portrait {cls}" style="{p}"><img src="{src}" alt="AI로 생성한 가상 한국인 성인 스튜디오 사진"></div>'

def sticker(kind,p):
    return f'<div class="placed sticker {kind}" aria-hidden="true" style="{p}">'+{'star':STAR,'heart':HEART,'chat':CHAT}[kind]+'</div>'

def phone(n,p,box=None):
    inner=crop(n,box) if box else f'<img src="../../ios-6.7/{NAMES[n-1]}.png" alt="실제 앱 원본 화면">'
    return f'<div class="placed phone" style="{p}"><div class="screen"><div class="island"></div>{inner}<div class="homebar"></div></div></div>'

def composition(i):
    if i==1:
        return ''.join([
          phone(1,pos(530,760,625,12,1,(565,700,510,12))),
          photo(1,pos(-90,1120,930,-3,3,(-80,910,780,-3)),'cutout'),
          card(1,(215,1600,1105,2080),pos(315,2000,890,-6,5,(365,1610,820,-6))),
          sticker('star',pos(1000,675,220,8,7,(1030,648,190))),
          sticker('heart',pos(895,1490,215,12,4,(970,1250,175))),
          sticker('chat',pos(80,785,235,-15,4,(85,708,205)))])
    if i==2:
        return ''.join([
          photo('05-studio-woman',pos(50,785,200,-10,4,(55,720,180)),'round',True),
          card(2,(168,898,1067,1100),pos(265,870,935,-4,3,(255,770,940,-4)),'bubble'),
          photo(2,pos(1035,1250,200,10,4,(1035,1060,180)),'round'),
          card(2,(225,1135,1245,1344),pos(68,1330,1000,4,3,(65,1130,1005,4)),'bubble'),
          card(2,(143,1354,1243,1498),pos(150,1610,1050,4,3,(150,1380,1050,4)),'bubble feedback'),
          card(2,(167,1532,739,1667),pos(255,1900,790,-5,3,(255,1630,790,-5)),'bubble'),
          '<div class="placed boost" style="'+pos(140,2250,780,-8,5,(135,1860,720,-8))+'">+10°</div>',
          sticker('star',pos(875,2230,260,12,2,(930,1860,210))),
          sticker('heart',pos(65,1815,145,-18,4,(70,1595,140))),
          sticker('chat',pos(1020,700,150,12,2,(1050,650,130)))])
    if i==3:
        return ''.join([
          photo(3,pos(845,355,355,8,3,(875,310,315,8)),'thought'),
          '<div class="placed number" style="'+pos(80,585,950,-6,2,(85,490,950,-6))+'">50<small>%</small></div>',
          card(3,(45,920,1245,1115),pos(70,1080,1120,-3,5,(70,850,1080,-3))),
          card(3,(90,1155,1205,1270),pos(75,1370,1070,-8,6,(70,1110,1000,-6))),
          card(3,(90,1398,1205,1505),pos(140,1600,1060,1,7,(165,1300,1000,1))),
          card(3,(90,1630,1205,1745),pos(90,1830,1070,7,8,(90,1490,1000,6))),
          sticker('star',pos(55,385,190,-13,3,(55,320,165))),
          sticker('heart',pos(1095,1060,145,14,6,(1110,870,140)))])
    if i==4:
        heart_path='M100 185C70 161 5 116 5 60C5 4 75 0 100 43C125 0 195 4 195 60C195 116 130 161 100 185Z'
        heart=f'<div class="placed portrait heartframe" style="{pos(430,730,430,-4,4,(465,675,370,-4))}"><svg viewBox="0 0 200 200"><defs><clipPath id="heartPhoto"><path d="{heart_path}"/></clipPath></defs><g clip-path="url(#heartPhoto)"><rect width="200" height="200" fill="#f5e3f0"/><image href="../_photos/04-laugh-man.png" x="-35" y="0" width="165" height="248"/><image href="../../candidates-20261025/_photos/05-studio-woman.png" x="75" y="0" width="165" height="248"/></g><path d="{heart_path}" fill="none" stroke="white" stroke-width="7"/></svg></div>'
        return ''.join([
          phone(4,pos(95,1140,500,-14,2,(110,1000,450,-14))),
          phone(4,pos(680,1120,500,14,1,(695,980,450,14)),(45,220,1245,2500)),
          heart,
          '<div class="placed feature gauge" style="'+pos(150,1990,990,-4,6,(185,1580,920,-4))+'">'+crop(4,(95,490,1195,815))+'<div class="gauge-label">0° <b>→</b> 25°</div></div>',
          sticker('star',pos(1030,850,200,12,5,(1060,740,170))),
          sticker('chat',pos(60,790,225,-12,4,(55,705,190))),
          sticker('heart',pos(555,1700,150,-12,5,(565,1430,140)))])
    if i==5:
        toks=[(113,672,368,875),(383,672,638,875),(652,672,908,875),(923,672,1178,875)]
        return ''.join([
          photo(5,pos(50,770,350,-14,2,(60,695,310,-14)),'polaroid left'),
          photo(5,pos(950,2210,270,10,4,(1015,1815,220,10)),'polaroid right'),
          card(5,(45,180,1245,1450),pos(170,1140,965,-5,3,(185,970,910,-5))),
          card(5,toks[0],pos(700,785,195,-11,5,(690,705,175,-11)),'token'),
          card(5,toks[1],pos(990,825,195,14,5,(1010,745,175,14)),'token'),
          card(5,toks[2],pos(100,2380,195,-13,6,(75,1930,175,-13)),'token'),
          card(5,toks[3],pos(410,2395,195,11,6,(340,1960,175,11)),'token'),
          sticker('star',pos(1080,1080,170,12,6,(1090,930,150))),
          sticker('heart',pos(60,1845,160,-13,5,(40,1600,145))),
          sticker('chat',pos(630,2380,170,-10,5,(600,1970,150)))])
    if i==6:
        return ''.join([
          photo('05-studio-woman',pos(-95,470,420,12,1,(-80,385,360,12)),'peek',True),
          photo(6,pos(1000,1460,310,-13,1,(1010,1210,310,-13)),'peek'),
          card(6,(45,318,635,630),pos(175,720,565,-7,3,(155,570,575,-7)),'tile'),
          card(6,(655,318,1245,630),pos(750,700,510,9,4,(755,560,500,9)),'tile'),
          card(6,(45,652,635,967),pos(35,1380,565,6,3,(40,1140,565,6)),'tile'),
          card(6,(655,652,1245,967),pos(610,1420,470,-7,4,(610,1175,470,-7)),'tile'),
          card(1,(178,2568,1114,2734),pos(85,1110,1120,-3,7,(80,930,1130,-3)),'feature input'),
          sticker('star',pos(835,390,230,14,4,(840,310,200))),
          sticker('heart',pos(425,1870,170,-12,5,(435,1505,120))),
          sticker('chat',pos(100,1780,230,-12,5,(105,1510,200)))])

def shot(i):
    a,b,sub=COPY[i-1]
    ribbon='<svg viewBox="0 0 1290 2796" preserveAspectRatio="none"><path d="M-100 1750C360 1050 850 2250 1390 1510M-100 1810C360 1110 850 2310 1390 1570" stroke="#ffdb89" stroke-width="25" fill="none"/></svg>'
    return f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S2-{i} · 나만의 연애코치</title><style>
@font-face{{font-family:Pretendard;src:url('../../../../api/_assets/fonts/Pretendard-Bold.otf');font-weight:700}}@font-face{{font-family:Pretendard;src:url('../../../../api/_assets/fonts/Pretendard-Medium.otf');font-weight:500}}
{CSS}</style><main class="stage s{i}" data-page="{i}" style="--bg:{COLORS[i-1]}"><div class="wash"></div><div class="ribbon">{ribbon}</div><div class="brand" data-safe>{HEART}나만의 연애코치</div><header data-safe><h1><span>{a}</span><span>{b}</span></h1><p class="sub">{sub}</p></header>{composition(i)}<footer class="footer" data-safe><span>실제 앱 화면 · 코칭 예시</span><span class="page">{i:02d} / 06</span></footer></main><script>const s=innerWidth/1290;document.querySelector('.stage').style.setProperty('--scale',s);document.querySelector('.stage').style.setProperty('--h',(innerHeight/s)+'px');</script></html>'''

def contact(prefix,w,h):
    return '<!doctype html><html lang="ko"><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;overflow:hidden;background:#15121c}body{display:flex}img{display:block;width:'+str(w)+'px;height:'+str(h)+'px}</style>'+''.join(f'<img src="../S2/{prefix}{i}.png" alt="S2 {i}">' for i in range(1,7))+'</html>'

def main():
    (BASE/'html').mkdir(exist_ok=True)
    (BASE/'S2').mkdir(exist_ok=True)
    jobs=[]
    for i in range(1,7):
        html=BASE/'html'/f'S2-{i}.html'
        html.write_text(shot(i),encoding='utf-8')
        for prefix,w,h in [('',1290,2796),('play-',1242,2208)]:
            jobs.append([str(html),str(BASE/'S2'/f'{prefix}{i}.png'),w,h])
    mainjobs=jobs[:]
    for suffix,prefix,w,h in [('', '',415,900),('-play','play-',506,900),('-230','',230,499)]:
        html=BASE/'html'/f'contact{suffix}.html'
        html.write_text(contact(prefix,w,h),encoding='utf-8')
        jobs.append([str(html),str(BASE/'S2'/f'contact{suffix}.png'),w*6,h])
    compare=BASE/'html'/'compare.html'
    compare.write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><style>html,body{margin:0;background:#15121c;overflow:hidden}img{display:block;width:2490px;height:900px}</style><img src="../../candidates-20261025/S/contact.png" alt="위: 2차 S"><img src="../S2/contact.png" alt="아래: 3차 S2"></html>',encoding='utf-8')
    comparejob=[str(compare),str(BASE/'compare.png'),2490,1800]
    jobs.append(comparejob)
    (BASE/'manifest.json').write_text(json.dumps({'jobs':jobs,'crops':CROPS,'phone_counts':[1,0,0,2,0,0],'palette':COLORS,'copy':COPY,'photos_by_slide':[['01-point-woman-cutout'],['v2/05-studio-woman','02-heart-man'],['03-think-woman'],['04-laugh-man','v2/05-studio-woman'],['05-friends'],['v2/05-studio-woman','06-wink-man']]},ensure_ascii=False,indent=2),encoding='utf-8')
    lines=["$ErrorActionPreference = 'Stop'"]
    for batch in [mainjobs,jobs[len(mainjobs):-1],[comparejob]]:
        args=' '.join("'"+str(x).replace("'","''")+"'" for job in batch for x in job)
        lines+=['node C:/Users/shsop/mylovecoach-codex-tools/render.mjs '+args,'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }']
    (BASE/'render-all.ps1').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print('Built six distinct S2 layouts and render jobs.')

if __name__=='__main__': main()
