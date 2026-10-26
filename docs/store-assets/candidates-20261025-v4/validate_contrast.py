"""Measure backgrounds captured by validate.mjs; remove only those exact QA files."""
from pathlib import Path
import json
import re
import sys
from PIL import Image, ImageChops

BASE = Path(__file__).resolve().parent
REPORT = BASE / 'validation-contrast.json'
report = json.loads(REPORT.read_text(encoding='utf-8'))
linear = [(v / 255 / 12.92 if v / 255 <= .04045 else ((v / 255 + .055) / 1.055) ** 2.4) for v in range(256)]

def luminance(rgb):
    return .2126 * linear[rgb[0]] + .7152 * linear[rgb[1]] + .0722 * linear[rgb[2]]

for row in report['checks']:
    png = Path(row['png']).resolve()
    if png.parent != BASE / '_qa' or not png.name.startswith('contrast-P2-'):
        raise ValueError('Unexpected QA path: ' + str(png))
    rgb = tuple(round(float(v)) for v in re.findall(r'[\d.]+', row['color'])[:3])
    fg = luminance(rgb)
    worst, worst_rgb = 100, None
    with Image.open(png) as im:
        rgb_image=im.convert('RGB')
        if row.get('masked'):
            mask_files=[Path(p).resolve() for p in row['maskFiles']]
            if any(p.parent!=BASE/'_qa' or not p.name.startswith('contrast-P2-') for p in mask_files):
                raise ValueError('Unexpected mask image path')
            with Image.open(mask_files[0]) as black, Image.open(mask_files[1]) as white:
                difference=ImageChops.difference(black.convert('RGB'),white.convert('RGB')).convert('L')
                colors=set(pixel for pixel,mask in zip(rgb_image.get_flattened_data(),difference.get_flattened_data()) if mask>1)
            if not colors:raise ValueError('Empty rotated text mask')
            row['maskSamplePixels']=sum(v>1 for v in difference.get_flattened_data())
            for file in mask_files:file.unlink()
        else:
            colors={color for _,color in rgb_image.getcolors(im.width*im.height)}
        for bg_rgb in colors:
            bg = luminance(bg_rgb)
            ratio = (max(fg, bg) + .05) / (min(fg, bg) + .05)
            if ratio < worst:
                worst, worst_rgb = ratio, bg_rgb
    row.update(foregroundRGB=rgb, worstBackgroundRGB=worst_rgb, minimumContrast=round(worst,4), passed=worst>=4.5, qaScreenshotRemoved=True)
    png.unlink()
failed=[r for r in report['checks'] if not r['passed']]
report['summary']={'textRegions':len(report['checks']),'configurations':len({(r['file'],r['format']) for r in report['checks']}),'minimumContrast':min((r['minimumContrast'] for r in report['checks']),default=None),'failedRegions':len(failed),'allPassed':bool(report['checks']) and not failed and not report['errors']}
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Contrast',json.dumps(report['summary'],ensure_ascii=False))
for row in failed:
    print(row['file'],row['format'],row['text'],'ratio',row['minimumContrast'],'background',row['worstBackgroundRGB'])
for err in report['errors']:
    print(err)
sys.exit(0 if report['summary']['allPassed'] else 1)
