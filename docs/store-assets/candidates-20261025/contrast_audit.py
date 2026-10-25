"""Measure actual background pixels from contrast_audit.mjs, then remove its exact QA PNGs."""
from pathlib import Path
import json
import re
import sys
from PIL import Image

base = Path(__file__).resolve().parent
report_path = Path(sys.argv[1]).resolve()
if report_path.parent != base:
    raise ValueError('Report must be inside this candidate directory')
report = json.loads(report_path.read_text(encoding='utf-8'))
linear = [(v / 255 / 12.92 if v / 255 <= .04045 else ((v / 255 + .055) / 1.055) ** 2.4) for v in range(256)]
def luminance(rgb):
    return .2126 * linear[rgb[0]] + .7152 * linear[rgb[1]] + .0722 * linear[rgb[2]]

for row in report['checks']:
    png = Path(row['png']).resolve()
    if png.parent != base or not png.name.startswith('_qa-contrast-') or str(png) not in report['temporaryFiles']:
        raise ValueError('Unexpected QA path: ' + str(png))
    rgb = tuple(round(float(v)) for v in re.findall(r'[\d.]+', row['color'])[:3])
    fg = luminance(rgb)
    worst = 100
    worst_rgb = None
    with Image.open(png) as im:
        colors = im.convert('RGB').getcolors(im.width * im.height)
        for _, bg_rgb in colors:
            bg = luminance(bg_rgb)
            ratio = (max(fg, bg) + .05) / (min(fg, bg) + .05)
            if ratio < worst:
                worst, worst_rgb = ratio, bg_rgb
    row['foregroundRGB'] = rgb
    row['worstBackgroundRGB'] = worst_rgb
    row['minimumContrast'] = round(worst, 4)
    row['passed'] = worst >= 4.5
    row['qaScreenshotRemoved'] = True
    png.unlink()

failed = [row for row in report['checks'] if not row['passed']]
report['summary'] = {'textRegions':len(report['checks']), 'configurations':len({(r['file'],r['format']) for r in report['checks']}), 'minimumContrast':min(r['minimumContrast'] for r in report['checks']), 'failedRegions':len(failed), 'allPassed':not failed}
report.pop('temporaryFiles')
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report['summary'],ensure_ascii=False))
for row in failed:
    print(row['file'],row['format'],row['selector'],row['text'],'ratio',row['minimumContrast'],'background',row['worstBackgroundRGB'])
sys.exit(1 if failed else 0)
