"""Conservative contrast check over every text line's full bounding rectangle."""
import json, math, re
from pathlib import Path
from PIL import Image
import numpy as np

root=Path(__file__).resolve().parent
report=json.loads((root/'qa/layout-report.json').read_text(encoding='utf-8'))
def luminance(c):
    c=np.asarray(c,dtype=float)/255
    return np.dot(np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4),[.2126,.7152,.0722])
output=[]
for screen in report['results']:
    img=np.array(Image.open(root/'qa'/f"{screen['name']}-background.png").convert('RGB'))
    bg=luminance(img)
    checks=[]
    for t in screen['text']:
        color=[int(x) for x in re.findall(r'[\d.]+',t['color'])[:3]]
        fg=luminance(color)
        vals=[]
        for r in t['rects']:
            x0=max(0,math.ceil(r['x'])); x1=min(screen['width'],math.floor(r['right']))
            y0=max(0,math.ceil(r['y'])); y1=min(screen['height'],math.floor(r['bottom']))
            if x1<=x0 or y1<=y0: continue
            region=bg[y0:y1,x0:x1]
            vals.append(float(np.min((np.maximum(region,fg)+.05)/(np.minimum(region,fg)+.05))))
        if vals: checks.append({'text':t['text'],'minRatio':round(min(vals),2),'fontPx':t['fontPx']})
    output.append({'name':screen['name'],'minimum':min(c['minRatio'] for c in checks),'below4_5':[c for c in checks if c['minRatio']<4.5],'checks':checks})
(root/'qa/contrast-report.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{k:s[k] for k in ['name','minimum','below4_5']} for s in output],ensure_ascii=False,indent=2))
