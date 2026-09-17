#!/bin/bash
# macOS 러너에서 Xcode 를 선택한다. XCODE_PREFER(예: "27", "26.6")가 있으면 그 버전 계열 중 최신, 없으면 26 이상 최신.
set -euo pipefail
echo "설치된 Xcode:"; ls -d /Applications/Xcode*.app
xcode_app="$(XCODE_PREFER="${XCODE_PREFER:-}" python3 - <<'PY'
import glob, os, re
apps = []
for path in glob.glob('/Applications/Xcode_*.app'):
    m = re.search(r'Xcode_(\d+(?:\.\d+)*)', os.path.basename(path))
    if m and int(m[1].split('.')[0]) >= 26:
        apps.append((tuple(map(int, m[1].split('.'))), path))
if not apps:
    raise SystemExit('러너에 Xcode 26 이상이 없습니다')
prefer = os.environ.get('XCODE_PREFER', '').strip()
if prefer:
    want = tuple(map(int, prefer.split('.')))
    hits = [a for a in apps if a[0][:len(want)] == want]
    if hits:
        print(max(hits)[1]); raise SystemExit
    print(f"warning: Xcode {prefer} 없음 → 최신 사용", file=__import__('sys').stderr)
print(max(apps)[1])
PY
)"
sudo xcode-select --switch "$xcode_app/Contents/Developer"
echo "선택된 Xcode: $xcode_app"
xcodebuild -version
