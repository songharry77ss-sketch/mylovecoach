"""아이폰 Ad Hoc(내부 테스트) 서명 준비 — App Store Connect API 없이.

애플 계약이 막혀(403) API 로 인증서·프로파일을 못 받을 때 쓴다(internal-test.yml).
- 개발자 사이트에서 만든 Ad Hoc 프로파일(IOS_ADHOC_PROFILE_BASE64) 안에 든 배포 인증서 가운데
  저장소의 개인키(IOS_CERT_PRIVATE_KEY_BASE64)와 짝인 것을 골라 .p12 로 묶는다.
- 프로파일을 Xcode 가 찾는 곳에 설치한다.
UDID·인증서 원문·비밀번호는 출력하지 않는다(기기 수·만료일만).
"""

import datetime
import os
import plistlib
import secrets
import shutil
import subprocess
import sys
from pathlib import Path


def run(args, **kw):
    return subprocess.run(args, check=True, capture_output=True, **kw).stdout


def main():
    signing = Path(os.environ["RUNNER_TEMP"]) / "signing"
    bundle_id = os.environ["BUNDLE_ID"]
    team_id = os.environ["APPLE_TEAM_ID"]
    profile_path = signing / "adhoc.mobileprovision"
    key_path = signing / "cert_key.pem"

    profile = plistlib.loads(run(["security", "cms", "-D", "-i", str(profile_path)]))
    ent = profile.get("Entitlements", {})
    expiry = profile.get("ExpirationDate")
    devices = profile.get("ProvisionedDevices") or []
    problems = []
    if team_id not in profile.get("TeamIdentifier", []):
        problems.append("팀이 다른 프로파일")
    if ent.get("application-identifier") != f"{team_id}.{bundle_id}":
        problems.append(f"앱 ID 가 {bundle_id} 가 아님")
    if ent.get("get-task-allow") is not False:
        problems.append("개발용(Development) 프로파일 — Ad Hoc 으로 만들어야 함")
    if not devices:
        problems.append("등록된 기기가 없음(Ad Hoc 프로파일이 아님)")
    if not isinstance(expiry, datetime.datetime) or expiry.replace(tzinfo=datetime.timezone.utc) <= datetime.datetime.now(datetime.timezone.utc):
        problems.append("만료된 프로파일")
    if problems:
        raise SystemExit("프로파일 문제: " + ", ".join(problems))

    # 개인키와 짝인 인증서 찾기 (공개키 비교)
    want = run(["openssl", "pkey", "-in", str(key_path), "-pubout"])
    cert_pem = None
    for i, der in enumerate(profile.get("DeveloperCertificates", [])):
        der_path = signing / f"c{i}.der"
        der_path.write_bytes(der)
        pub = run(["openssl", "x509", "-inform", "DER", "-in", str(der_path), "-pubkey", "-noout"])
        if pub == want:
            cert_pem = run(["openssl", "x509", "-inform", "DER", "-in", str(der_path), "-outform", "PEM"])
        der_path.unlink()
        if cert_pem:
            break
    if not cert_pem:
        raise SystemExit("프로파일에 저장소 개인키와 짝인 배포 인증서가 없음 — 개발자 사이트에서 프로파일을 만들 때 그 인증서를 골라야 함")
    (signing / "cert.pem").write_bytes(cert_pem)

    # .p12 — macOS 키체인이 읽는 옛 암호 방식(3DES·SHA1)으로
    password = secrets.token_urlsafe(24)
    (signing / "p12-password").write_text(password)
    os.chmod(signing / "p12-password", 0o600)
    run([
        "openssl", "pkcs12", "-export", "-inkey", str(key_path), "-in", str(signing / "cert.pem"),
        "-out", str(signing / "cert.p12"), "-passout", f"file:{signing / 'p12-password'}",
        "-certpbe", "PBE-SHA1-3DES", "-keypbe", "PBE-SHA1-3DES", "-macalg", "sha1",
    ])

    # Xcode 가 찾는 두 곳에 설치
    uuid = profile["UUID"]
    for folder in (Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles", Path.home() / "Library/MobileDevice/Provisioning Profiles"):
        folder.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(profile_path, folder / f"{uuid}.mobileprovision")

    print(f"Ad Hoc 프로파일 확인: 기기 {len(devices)}대, 만료 {expiry:%Y-%m-%d}, 인증서 짝 확인")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        print("서명 준비 실패:", " ".join(map(str, e.cmd[:2])), file=sys.stderr)
        sys.exit(1)
