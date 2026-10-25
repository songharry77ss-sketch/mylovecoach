"""Generate reproducible HTML compositions. All app pixels come from original PNGs.

Run: python docs/store-assets/candidates-20261025/build.py
Render: powershell -ExecutionPolicy Bypass -File .../render-all.ps1
"""
from pathlib import Path
import json
import hashlib

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]
SRC = ROOT / 'docs/store-assets/ios-6.7'
FONTS = ROOT / 'api/_assets/fonts'
NAMES = ['1-chat-replies', '2-practice', '3-mind', '4-report', '5-kkti', '6-home']
PHOTOS = ['01-cafe-woman', '02-neon-man', '03-lamplight-woman', '04-studio-man',
          '05-studio-woman', '06-riverside-couple', '07-friends', '08-sofa-man']
COPY = [
    ('뭐라고 답장하지?', '<em>캡처 한 장</em>이면 끝', '호칭·말투 그대로, 답장 3가지'),
    ('실전 전에', 'AI랑 <em>카톡 연습</em>', '보낼 때마다 코치가 바로 피드백'),
    ('그 사람 속마음', '가능성은 <em>몇 %?</em>', '하나의 상황을 여러 가능성으로'),
    ('대화 속에 담긴', '우리 <em>호감 온도</em>', '온도 변화부터 상대 분석 보고서까지'),
    ('카톡 습관 속', '나의 <em>연애 유형</em>', '16가지 유형 · 나만의 연애 컬러'),
    ('캡처 없이', '<em>상황만</em> 적어도 OK', '연습·속마음·비밀 상담까지 한 앱에'),
]
CROPS = [
    (0, (215, 1600, 1105, 2080), '실제 답장 예시'),
    (1, (45, 890, 1245, 1500), '실제 연습 피드백'),
    (2, (45, 920, 1245, 1890), '실제 속마음 분석 예시'),
    (3, (45, 220, 1245, 1035), '실제 상대 분석 보고서'),
    (4, (45, 630, 1245, 1450), '실제 KKTI 결과 예시'),
    (5, (45, 300, 1245, 970), '실제 앱 메뉴'),
]
COLORS = ['#940051', '#4e21bd', '#005c85', '#9d300e', '#3444aa', '#00634e']
CSS = r'''
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
body{font-family:Pretendard,sans-serif;background:#101017;color:#fff}
.stage{width:1290px;height:var(--h);position:relative;overflow:hidden;transform:scale(var(--scale));transform-origin:0 0;isolation:isolate;background:#21191b}
.backdrop{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:100% center;z-index:-5}
.wash{position:absolute;inset:0;z-index:-4;background:linear-gradient(180deg,rgba(28,14,18,.92) 0%,rgba(28,14,18,.84) 22%,rgba(36,20,20,.09) 44%,rgba(29,17,23,.2) 66%,rgba(26,16,23,.9) 100%)}
.light{position:absolute;z-index:-3;inset:25% -35% -20%;background:radial-gradient(ellipse at 80% 62%,#ff9b6a55,transparent 55%);mix-blend-mode:screen}
.brand{position:absolute;top:164px;left:86px;display:flex;gap:19px;align-items:center;font-size:37px;letter-spacing:-1.4px;font-weight:700}
.brand svg{width:45px;height:45px;color:var(--accent)}
header{position:absolute;top:272px;left:86px;right:70px;z-index:6}
h1{margin:0;font-size:138px;line-height:1.14;letter-spacing:-7px;font-weight:700;word-break:keep-all;text-shadow:0 3px 30px #0002}
h1 span{display:block;white-space:nowrap}em{font-style:normal;color:var(--accent)}
.sub{font-size:48px;line-height:1.3;letter-spacing:-1.6px;margin:39px 0 0;white-space:nowrap;color:#fff}
.phone{position:absolute;top:calc(var(--h) - 1850px);right:72px;width:740px;padding:18px;background:linear-gradient(110deg,#5d5d62,#131316 12%,#35343b 84%,#737077);border-radius:109px;transform:rotate(7deg);box-shadow:0 72px 110px #08030e66,0 20px 35px #08030e44,inset 0 0 0 3px #d5d0da99;z-index:1}
.phone:before{content:'';position:absolute;left:-5px;top:340px;width:7px;height:125px;border-radius:4px;background:#77717c}
.phone:after{content:'';position:absolute;right:-5px;top:380px;width:7px;height:158px;border-radius:4px;background:#77717c}
.screen{position:relative;overflow:hidden;border-radius:91px;background:white;padding-top:74px;padding-bottom:29px}
.screen>img{width:100%;height:auto;display:block}
.island{position:absolute;top:20px;left:50%;transform:translateX(-50%);width:204px;height:48px;border-radius:40px;background:#060608;z-index:3}
.island:after{content:'';position:absolute;right:15px;top:16px;width:15px;height:15px;background:#172338;border-radius:50%;box-shadow:inset 2px 2px 4px #05050b}
.homebar{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);width:210px;height:8px;border-radius:8px;background:#101015}
.feature{position:absolute;left:76px;bottom:300px;width:970px;z-index:4;transform:rotate(-4deg);filter:drop-shadow(0 36px 33px #11091955)}
.caption{display:inline-block;border:1.5px solid #ffffff85;border-radius:100px;background:#ffffffdd;backdrop-filter:blur(20px);color:#292137;font-size:32px;line-height:1;padding:19px 27px;margin:0 0 20px 12px;font-weight:700;letter-spacing:-.6px}
.card{border:16px solid #fff;overflow:hidden;border-radius:42px;background:white;box-shadow:0 2px 2px #fff8}
.crop{width:100%;aspect-ratio:var(--cw)/var(--ch);position:relative;overflow:hidden;background:#fff}
.crop img{position:absolute;max-width:none;width:calc(1290 / var(--cw) * 100%);height:auto;left:calc(-1 * var(--cx) / var(--cw) * 100%);top:calc(-1 * var(--cy) / var(--ch) * 100%)}
.input-card{margin-top:20px;border:13px solid #fff;border-radius:34px;overflow:hidden;background:#fff}
.footer{position:absolute;left:86px;right:86px;bottom:149px;display:flex;justify-content:space-between;align-items:center;font-size:29px;letter-spacing:-.4px;color:#fff;z-index:9}
.footer .page{opacity:.65;letter-spacing:3px;font-size:27px}
.heart-line{position:absolute;width:190px;height:190px;left:81px;top:calc(var(--h) - 1220px);transform:rotate(-13deg);color:var(--accent);filter:drop-shadow(0 7px 7px #0002);z-index:2}
.photo-bubble,.sticker,.ribbon,.orb{display:none}
.P .backdrop{filter:saturate(.94);object-position:135% center;transform:translateY(-160px);mask-image:linear-gradient(90deg,#000 65%,#000c 74%,transparent 84%)}
.P[data-page="2"] .backdrop,.P[data-page="6"] .backdrop{object-position:95% center;transform:translateY(200px);mask-image:none}
.P[data-page="3"] .backdrop{object-position:105% center;transform:translateY(110px);mask-image:none}
.P .wash{background:linear-gradient(180deg,rgba(28,14,18,.94) 0%,rgba(28,14,18,.87) 22%,rgba(36,20,20,.03) 40%,rgba(29,17,23,.12) 65%,rgba(26,16,23,.98) 96%),linear-gradient(90deg,transparent 77%,#21191b 100%)}
.P .phone{width:680px;top:calc(var(--h) - 1720px);right:76px;transform:rotate(6deg)}
.P[data-page="4"] .backdrop{object-position:55% center;transform:translateY(10px);mask-image:none}
.P[data-page="5"] .backdrop{object-position:65% center;transform:none;mask-image:none}
.P[data-page="5"] .feature{bottom:300px}
.P[data-page="6"] .feature{bottom:300px;width:940px}
.S{background:var(--bg)}
.S .backdrop{display:none}
.S .wash{background:linear-gradient(135deg,#ffffff0c,transparent 45%,#1e004842)}
.S .light{background:radial-gradient(ellipse at 70% 45%,#ff7eff80,transparent 62%);mix-blend-mode:soft-light}
.S header{text-align:center;left:55px;right:55px}
.S .brand{left:50%;transform:translateX(-50%);white-space:nowrap}
.S h1{font-size:140px;letter-spacing:-7.7px}
.S .photo-bubble{display:block;position:absolute;top:780px;left:37px;width:625px;height:720px;border:17px solid white;border-radius:50% 50% 46% 20%;overflow:hidden;transform:rotate(-11deg);z-index:0;box-shadow:20px 32px 0 #200a3230}
.photo-bubble img{width:100%;height:100%;object-fit:cover;object-position:center 32%}
.S .phone{top:calc(var(--h) - 1790px);right:160px;width:745px;transform:rotate(5deg)}
.S .feature{left:90px;bottom:288px;width:1055px;transform:rotate(-5deg)}
.S .sticker{display:block;position:absolute;z-index:3;filter:drop-shadow(0 8px 0 #24103155)}
.S .sticker.star{right:23px;top:780px;width:220px;height:220px;color:#ffe779;transform:rotate(9deg)}
.S .sticker.heart{right:45px;top:1540px;width:180px;height:180px;transform:rotate(15deg);color:#ff94bf}
.S .sticker.chat{left:40px;top:1530px;width:230px;height:210px;transform:rotate(-13deg);color:#bcf6d2}
.S .heart-line{display:none}
.S .ribbon{display:block;position:absolute;inset:0;z-index:-1;opacity:.24}
.N{background:#080911}
.N .backdrop{object-position:115% center;filter:saturate(.9) brightness(.9)}
.N .wash{background:linear-gradient(180deg,#090913f5 0%,#090913ef 23%,#0909130d 40%,#09091377 65%,#090913 100%)}
.N .light{inset:20% -40% -20%;background:radial-gradient(ellipse at 75% 65%,#b127ff66,transparent 55%),radial-gradient(ellipse at 20% 65%,#ff286633,transparent 40%);mix-blend-mode:screen}
.N .phone{top:calc(var(--h) - 1840px);right:100px;transform:rotate(5deg);box-shadow:0 0 0 2px #ea8aff,0 0 32px #de40ff77,0 0 150px #843af777,0 55px 100px #000b}
.N .feature{left:80px;width:1010px;bottom:300px;transform:rotate(-3deg);filter:drop-shadow(0 0 16px #c975ff55) drop-shadow(0 28px 30px #04000a88)}
.N .caption{background:#21152ce6;border-color:#eca5ff80;color:#f5d9ff;box-shadow:0 0 30px #c649ff33}
.N .card{border-color:#f7e7ff;box-shadow:0 0 0 2px #ca6bff}
.N .heart-line{color:#f19bff;filter:drop-shadow(0 0 18px #ee4cfa88)}
.N .orb{display:block;position:absolute;top:840px;right:70px;width:240px;height:240px;border:2px solid #ffb8e3aa;border-radius:50%;box-shadow:0 0 55px #e72bab66,inset 0 0 55px #bf49f24d;z-index:0}
.N[data-page="4"] .backdrop{object-position:55% center}
.N[data-page="5"] .backdrop{object-position:70% center}
.N[data-page="2"] .backdrop{object-position:95% center;transform:translateY(150px)}
.P[data-page] .backdrop,.N .backdrop{mask-image:linear-gradient(180deg,transparent 0%,#000 14%,#000 86%,transparent 100%)}
.P[data-page="1"] .backdrop{mask-image:linear-gradient(180deg,transparent 0%,#000 14%,#000 86%,transparent 100%),linear-gradient(90deg,#000 63%,transparent 83%);mask-composite:intersect}
.P[data-page="3"] .backdrop,.N .backdrop{mask-image:linear-gradient(180deg,transparent 0%,#000 14%,#000 86%,transparent 100%),linear-gradient(90deg,#000 77%,transparent 91%);mask-composite:intersect}
.feature.compact{bottom:300px}
.P .phone,.S .phone,.N .phone{top:auto;bottom:230px}
.N .phone{width:690px}
@media(max-aspect-ratio:1/2){.stage{--short:0}}
@media(min-aspect-ratio:1/2){
 .brand{top:156px;font-size:33px}
 header{top:244px}h1{font-size:134px;line-height:1.11}.sub{margin-top:27px;font-size:45px}
 .S h1{font-size:134px}
 .phone,.N .phone{top:calc(var(--h) - 1510px);width:630px;right:76px;border-radius:93px;padding:15px}
 .P .phone{width:580px;right:76px}
 .P .backdrop{object-position:200% center;transform:translateY(-75px)}
 .P[data-page="2"] .backdrop,.P[data-page="6"] .backdrop{object-position:145% center;transform:translateY(230px)}
 .P[data-page="3"] .backdrop{object-position:155% center;transform:translateY(200px)}
 .P[data-page="4"] .backdrop{object-position:55% center;transform:translateY(80px)}
 .P[data-page="5"] .backdrop{object-position:65% center;transform:translateY(60px)}
 .screen{border-radius:78px;padding-top:62px}.island{top:17px;width:175px;height:42px}
 .feature,.N .feature{width:910px;bottom:235px;left:68px}
 .S .phone{width:610px;right:150px}
 .N .phone{width:610px}
 .P .phone,.S .phone,.N .phone{top:auto;bottom:230px}
 .S .feature{width:980px;bottom:235px;left:110px}
 .S .photo-bubble{top:690px;width:545px;height:620px;left:35px}
 .S .sticker.star{top:680px;width:180px;height:180px}
 .S .sticker.chat{top:1260px;left:34px;width:190px;height:175px}
 .S .sticker.heart{top:1260px;width:160px;height:160px;right:30px}
 .heart-line{top:calc(var(--h) - 1000px);width:150px;height:150px}
 .footer{bottom:139px;font-size:26px}.footer .page{font-size:25px}
 .P[data-page="5"] .feature,.P[data-page="6"] .feature{bottom:235px;width:910px}
 .N .orb{top:700px;width:200px;height:200px}
}
'''
HEART = '<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M100 169C72 147 21 109 22 66C23 20 77 14 100 53C125 12 179 24 178 67C177 111 125 151 100 169Z" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>'
STAR = '<svg viewBox="0 0 200 200"><path d="M100 6L120 62L173 28L149 83L197 101L143 120L173 174L119 147L100 197L80 147L26 175L53 121L4 101L56 81L29 28L81 58Z" fill="currentColor" stroke="white" stroke-width="8" stroke-linejoin="round"/></svg>'
CHAT = '<svg viewBox="0 0 230 210"><path d="M23 17H196Q216 17 216 40V139Q216 160 193 160H91L42 195L47 160H28Q8 160 8 140V40Q8 17 23 17Z" fill="currentColor" stroke="white" stroke-width="10" stroke-linejoin="round"/><path d="M62 72Q78 54 94 72M137 72Q153 54 169 72M84 108Q115 135 147 108" stroke="#20362a" stroke-width="10" fill="none" stroke-linecap="round"/></svg>'

def crop(source, box):
    x,y,x2,y2 = box
    return f'<div class="crop" style="--cx:{x};--cy:{y};--cw:{x2-x};--ch:{y2-y}"><img src="{(SRC/(NAMES[source]+".png")).as_uri()}" alt="원본 앱 화면 크롭"></div>'

def shot(style, i):
    pmap = {'P':[0,7,2,5,6,7], 'S':[4,3,4,3,4,3], 'N':[1,7,2,5,6,1]}
    p = PHOTOS[pmap[style][i]]
    photo = f'../_photos/{p}.png'
    first, second, sub = COPY[i]
    source, box, label = CROPS[i]
    accent = '#ffe786' if style=='P' else ('#fff18e' if style=='S' else '#f5a6ff')
    # Full screenshot in bezel. The foreground card covers lower native share icons.
    phone = f'<div class="phone {"kkti" if i==4 else ""}"><div class="screen"><div class="island"></div><img src="{(SRC/(NAMES[i]+".png")).as_uri()}" alt="실제 앱 원본 캡처"><div class="homebar"></div></div></div>'
    feature = f'<div class="feature"><div class="caption">{label}</div><div class="card">{crop(source,box)}</div>'
    if i == 5:
        feature += f'<div class="input-card">{crop(0,(178,2568,1114,2734))}</div>'
    feature += '</div>'
    svg = '<svg viewBox="0 0 1290 2796" preserveAspectRatio="none"><path d="M-100 1630C500 800 700 1950 1390 1000M-100 1680C500 850 700 2000 1390 1050" fill="none" stroke="#ffdb89" stroke-width="26"/></svg>'
    return f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{style}-{i+1} · 나만의 연애코치</title><style>
@font-face{{font-family:Pretendard;src:url("{(FONTS/'Pretendard-Bold.otf').as_uri()}");font-weight:700}}@font-face{{font-family:Pretendard;src:url("{(FONTS/'Pretendard-Medium.otf').as_uri()}");font-weight:500}}
{CSS}</style><div class="stage {style}" data-page="{i+1}" style="--accent:{accent};--bg:{COLORS[i]}">
<img class="backdrop" src="{photo}" alt="AI로 생성한 가상 성인 인물 사진"><div class="wash"></div><div class="light"></div><div class="ribbon">{svg}</div><div class="orb"></div>
<div class="brand">{HEART}나만의 연애코치</div><header><h1><span>{first}</span><span>{second}</span></h1><p class="sub">{sub}</p></header>
<div class="photo-bubble"><img src="{photo}" alt="가상 성인 스튜디오 인물"></div>
{phone}<div class="heart-line">{HEART}</div><div class="sticker star">{STAR}</div><div class="sticker heart">{HEART}</div><div class="sticker chat">{CHAT}</div>{feature}
<div class="footer"><span>실제 앱 화면 · 코칭 예시</span><span class="page">{i+1:02d} / 06</span></div></div>
<script>const s=innerWidth/1290;document.querySelector('.stage').style.setProperty('--scale',s);document.querySelector('.stage').style.setProperty('--h',(innerHeight/s)+'px');</script></html>'''

def contact(paths, width, height, title):
    images=''.join(f'<img src="{p}" alt="{title}">' for p in paths)
    return f'<!doctype html><html lang="ko"><meta charset="utf-8"><title>{title}</title><style>*{{box-sizing:border-box}}html,body{{margin:0;background:#15121c;overflow:hidden}}body{{display:flex;gap:0}}img{{display:block;width:{width}px;height:{height}px;object-fit:contain}}</style>{images}</html>'

def main():
    (BASE/'html').mkdir(parents=True, exist_ok=True)
    (BASE/'_photos').mkdir(exist_ok=True)
    jobs=[]
    for style in 'PSN':
        (BASE/style).mkdir(exist_ok=True)
        for i in range(6):
            html = BASE/'html'/f'{style}-{i+1}.html'
            html.write_text(shot(style,i),encoding='utf-8')
            for prefix,w,h in [('',1290,2796),('play-',1242,2208)]:
                jobs.append((str(html),str(BASE/style/f'{prefix}{i+1}.png'),w,h))
    mainjobs=jobs[:]
    for style in 'PSN':
        for suffix,cellw,h,prefix in [('',415,900,''),('-230',230,499,''),('-play',506,900,'play-')]:
            html=BASE/'html'/f'contact-{style}{suffix}.html'
            html.write_text(contact([f'../{style}/{prefix}{i}.png' for i in range(1,7)],cellw,h,style+' 가로 비교'),encoding='utf-8')
            jobs.append((str(html),str(BASE/style/f'contact{suffix}.png'),cellw*6,h))
    for suffix,cellw,h,prefix in [('',415,900,''),('-play',506,900,'play-')]:
        html=BASE/'html'/f'overview{suffix}.html'
        html.write_text(contact([f'../{s}/{prefix}1.png' for s in 'PSN'],cellw,h,'첫 장 비교 P · S · N'),encoding='utf-8')
        jobs.append((str(html),str(BASE/f'overview{suffix}.png'),cellw*3,h))
    manifest={'sources':{n:hashlib.sha256((SRC/(n+'.png')).read_bytes()).hexdigest() for n in NAMES},'crops':CROPS,'copy':COPY,'jobs':jobs}
    (BASE/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    lines=["# Generated by build.py. Uses the user-specified renderer unchanged.","$ErrorActionPreference = 'Stop'"]
    for batch in [mainjobs,jobs[len(mainjobs):]]:
        args=' '.join("'"+str(x).replace("'","''")+"'" for job in batch for x in job)
        lines.append('node C:/Users/shsop/mylovecoach-codex-tools/render.mjs '+args)
        lines.append('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }')
    (BASE/'render-all.ps1').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    gallery=''.join(f'<section><h2>{s} · {name}</h2><p><a href="{s}/contact.png">iOS 전체</a> · <a href="{s}/contact-play.png">Play 전체</a> · <a href="{s}/contact-230.png">230px 가독성</a></p><div class="strip">'+''.join(f'<a href="{s}/{i}.png"><img src="{s}/{i}.png" loading="lazy" alt="{s} {i}"></a>' for i in range(1,7))+'</div></section>' for s,name in [('P','라이프스타일'),('S','스티커 팝'),('N','나이트 시네마')])
    (BASE/'index.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>나만의 연애코치 · 2차 시안</title><style>body{background:#17141d;color:#f9f5ff;font-family:system-ui;margin:40px}h1{font-size:36px}h2{margin-top:60px}a{color:#f6bcff}.strip{display:flex;gap:15px;overflow:auto}.strip img{width:230px;border-radius:10px}p{color:#c1b9c9}</style><h1>나만의 연애코치 · 2차 스토어 시안</h1><p>가상 성인 인물 사진 + 원본 앱 화면 · P / S / N · 2026.10.25</p>'+gallery,encoding='utf-8')
    print(f'Created 18 shot HTMLs, 11 comparison HTMLs, gallery, manifest and render-all.ps1 in {BASE}')

if __name__=='__main__': main()
