#!/bin/bash
# macOS 러너에서 Xcode 를 선택한다. React Native 0.86 은 Xcode 26 이상이 필요하고,
# Xcode 26.3 의 Swift 컴파일러는 expo-modules-jsi 57.1 헤더를 거부하므로(패치 적용 중) 26.2 → 26.1 → 26.0 → 그 외 26.x 순으로 선호한다.
set -euo pipefail
echo "설치된 Xcode:"; ls -d /Applications/Xcode*.app
xcode_app="$(python3 - <<'PY'
import glob, re
apps = []
for path in glob.glob('/Applications/Xcode*.app'):
    m = re.search(r'Xcode_(\d+(?:\.\d+)*)\.app$', path)
    if m and int(m[1].split('.')[0]) >= 26:
        apps.append((tuple(map(int, m[1].split('.'))), path))
if not apps:
    raise SystemExit('러너에 안정판 Xcode 26 이상이 없습니다')
prefer = [(26, 2), (26, 1), (26, 0)]
for want in prefer:
    hits = [a for a in apps if a[0][:2] == want]
    if hits:
        print(max(hits)[1]); break
else:
    print(max(apps)[1])
PY
)"
sudo xcode-select --switch "$xcode_app/Contents/Developer"
echo "선택된 Xcode: $xcode_app"
xcodebuild -version
