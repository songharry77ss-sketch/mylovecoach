"""Validate v4 dimensions and original source hashes; optimize oversized v4 PNGs only.

Usage: python validate_files.py [--optimize] [--main-only]
--main-only is useful before rendering contact sheets from optimized store images.
"""
from pathlib import Path
import argparse
import hashlib
import io
import json
import sys
from datetime import datetime, timezone
from PIL import Image

BASE=Path(__file__).resolve().parent
LIMIT=3_000_000

def digest(data):
    return hashlib.sha256(data).hexdigest()

def png_bytes(im):
    out=io.BytesIO()
    im.save(out,format='PNG',optimize=True,compress_level=9)
    return out.getvalue()

def inspect(target,expected,optimize):
    target=target.resolve()
    if not target.is_relative_to(BASE) or target.suffix.lower()!='.png':
        raise ValueError('Unexpected output path: '+str(target))
    row={'path':target.relative_to(BASE).as_posix(),'expectedDimensions':list(expected) if expected else None,'passed':False}
    if not target.is_file():
        row['error']='Missing PNG'
        return row
    try:
        before=target.read_bytes()
        with Image.open(io.BytesIO(before)) as opened:
            if opened.format!='PNG':raise ValueError('Not a PNG')
            opened.load()
            im=opened.copy()
        row.update(dimensions=list(im.size),bytesBefore=len(before),sha256Before=digest(before),operation='unchanged')
        if expected and im.size!=expected:raise ValueError('Incorrect dimensions')
        chosen=before
        if optimize and len(chosen)>LIMIT:
            lossless=png_bytes(im)
            if len(lossless)<len(chosen):chosen=lossless;row['operation']='lossless PNG optimization'
            if len(chosen)>LIMIT:
                if 'A' in im.getbands() and im.getchannel('A').getextrema()!=(255,255):
                    raise ValueError('Refusing to discard alpha channel')
                smaller=png_bytes(im.convert('RGB').quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE))
                if len(smaller)<len(chosen):chosen=smaller;row['operation']='MEDIANCUT 256 colors, no dithering'
            if len(chosen)>LIMIT:raise ValueError('Still exceeds 3,000,000 bytes after PNG optimization')
            if chosen!=before:
                temporary=target.with_suffix('.png.optimize-tmp')
                temporary.write_bytes(chosen)
                temporary.replace(target)
        row.update(bytes=len(chosen),sha256=digest(chosen),within3MB=len(chosen)<=LIMIT,passed=len(chosen)<=LIMIT)
        if not row['passed']:row['error']='PNG exceeds 3,000,000 bytes; use --optimize'
    except Exception as error:
        row['error']=str(error)
    return row

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--optimize',action='store_true')
    parser.add_argument('--main-only',action='store_true')
    args=parser.parse_args()
    manifest=json.loads((BASE/'manifest.json').read_text(encoding='utf-8-sig'))
    report={'checkedAt':datetime.now(timezone.utc).isoformat(),'limitBytes':LIMIT,'mainOnly':args.main_only,'sources':[],'files':[],'errors':[]}
    for stem,expected in manifest['sources'].items():
        if Path(stem).name!=stem:raise ValueError('Unexpected source name')
        actual=digest((BASE.parent/'ios-6.7'/(stem+'.png')).read_bytes())
        report['sources'].append({'name':stem,'expected':expected,'actual':actual,'matches':expected==actual})
        if expected!=actual:report['errors'].append('Original screenshot hash changed: '+stem)
    expected_store={}
    for number in range(1,7):
        expected_store[(BASE/'P2'/f'{number}.png').resolve()]=(1290,2796)
        expected_store[(BASE/'P2'/f'play-{number}.png').resolve()]=(1242,2208)
    jobs={Path(output).resolve():(int(w),int(h)) for _,output,w,h in manifest['jobs']}
    for target,dimensions in expected_store.items():
        if jobs.get(target)!=dimensions:report['errors'].append('Missing/mismatched render job: '+target.name)
    expected=expected_store if args.main_only else jobs
    if not args.main_only:
        for name in ('contact.png','contact-play.png'):
            target=(BASE/'P2'/name).resolve()
            if target not in jobs or jobs[target][1]!=900:report['errors'].append('Missing contact sheet height 900: '+name)
        if (BASE/'compare.png').resolve() not in jobs:report['errors'].append('Missing compare.png job')
    if not report['errors']:
        for target,dimensions in expected.items():
            report['files'].append(inspect(target,dimensions,args.optimize))
        if not args.main_only:
            for target in sorted((BASE/'_photos').glob('*.png')):
                report['files'].append(inspect(target,None,args.optimize))
    for row in report['files']:
        if not row['passed']:report['errors'].append(row['path']+': '+row.get('error','Invalid PNG'))
    report['summary']={'files':len(report['files']),'storeFiles':sum(row['path'].startswith('P2/') and Path(row['path']).stem.replace('play-','').isdigit() for row in report['files']),'maxPNGBytes':max((row.get('bytes',0) for row in report['files']),default=0),'allPassed':not report['errors'] and len(report['files'])>=12}
    name='validation-files-main.json' if args.main_only else 'validation-files.json'
    (BASE/name).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'summary':report['summary'],'errors':report['errors']},ensure_ascii=False))
    return 0 if report['summary']['allPassed'] else 1

if __name__=='__main__':sys.exit(main())
