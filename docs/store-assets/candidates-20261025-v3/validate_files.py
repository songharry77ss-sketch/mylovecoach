"""Read-only image/source checks; writes only the v3 validation report."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
from PIL import Image

BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[2]
manifest=json.loads((BASE/'manifest.json').read_text(encoding='utf-8'))
baseline=json.loads((BASE/'source-baseline.json').read_text(encoding='utf-8'))
errors=[]
sources=[]
for rel,expected in baseline.items():
    path=ROOT/rel
    actual=hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
    sources.append({'path':rel,'unchanged':actual==expected})
    if actual!=expected: errors.append('Protected file changed: '+rel)
expected={Path(out).resolve():(w,h) for _,out,w,h in manifest['jobs']}
files=[]
for path in sorted(BASE.rglob('*.png')):
    with Image.open(path) as im:
        im.load()
        size=im.size
        mode=im.mode
    record={'path':str(path.relative_to(BASE)),'width':size[0],'height':size[1],'mode':mode,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    files.append(record)
    if record['bytes']>3_000_000: errors.append('Over 3MB: '+str(path))
    if path.resolve() in expected and size!=expected[path.resolve()]: errors.append('Wrong dimensions: '+str(path))
for path in expected:
    if not path.is_file(): errors.append('Missing render: '+str(path))
required=['01-point-woman','02-heart-man','03-think-woman','04-laugh-man','05-friends','06-wink-man']
for name in required:
    if not (BASE/'_photos'/f'{name}.png').is_file(): errors.append('Missing generated photo: '+name)
report={'generated_at_utc':datetime.now(timezone.utc).isoformat(),'passed':not errors,'counts':{'ios':6,'play':6,'comparisons':4,'studio_originals':6,'transparent_cutouts':1,'png_total':len(files),'protected_files':len(sources)},'max_png_bytes':max(x['bytes'] for x in files),'max_store_png_bytes':max(x['bytes'] for x in files if x['path'].startswith('S2') and 'contact' not in x['path']),'sources':sources,'files':files,'errors':errors}
(BASE/'validation-files.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:report[k] for k in ['passed','counts','max_png_bytes','max_store_png_bytes','errors']},ensure_ascii=False,indent=2))
raise SystemExit(0 if report['passed'] else 1)
