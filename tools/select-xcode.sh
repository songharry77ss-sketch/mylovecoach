#!/bin/bash
# macOS 러너에서 안정판 Xcode 26 이상을 선택한다 (React Native 0.86 요구). 러너 기본값은 바뀔 수 있어 명시 선택.
set -euo pipefail
xcode_app="$(python3 - <<'PY'
import glob, re
apps = []
for path in glob.glob('/Applications/Xcode*.app'):
    m = re.search(r'Xcode_(\d+(?:\.\d+)*)\.app$', path)
    if m and int(m[1].split('.')[0]) >= 26:
        apps.append((tuple(map(int, m[1].split('.'))), path))
if not apps:
    raise SystemExit('러너에 안정판 Xcode 26 이상이 없습니다')
print(max(apps)[1])
PY
)"
sudo xcode-select --switch "$xcode_app/Contents/Developer"
echo "선택된 Xcode: $xcode_app"
xcodebuild -version
