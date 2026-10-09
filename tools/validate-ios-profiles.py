"""CI에서 기존 App Store 프로파일의 앱·팀·Apple 로그인 권한만 확인한다."""

import datetime
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import uuid


def eligible(profile, bundle_id, team_id, now):
    """프로파일 원문이나 식별자를 출력하지 않고 사용할 수 있는지 판정한다."""
    entitlements = profile.get("Entitlements", {})
    expiry = profile.get("ExpirationDate")
    return (
        isinstance(expiry, datetime.datetime)
        and expiry.replace(tzinfo=datetime.timezone.utc) > now
        and team_id in profile.get("TeamIdentifier", [])
        and entitlements.get("application-identifier") == f"{team_id}.{bundle_id}"
        and entitlements.get("com.apple.developer.applesignin") == ["Default"]
        and entitlements.get("get-task-allow") is False
        and not profile.get("ProvisionedDevices")
        and not profile.get("ProvisionsAllDevices", False)
    )


def main():
    signing = Path(os.environ["RUNNER_TEMP"]) / "signing"
    selected = signing / "verified-profiles"
    installed = Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles"
    bundle_id = os.environ["BUNDLE_ID"]
    team_id = os.environ["APPLE_TEAM_ID"]
    run_id = os.environ["GITHUB_RUN_ID"]
    if not run_id.isdigit() or not bundle_id or not team_id:
        raise ValueError("잘못된 검사 설정")
    now = datetime.datetime.now(datetime.timezone.utc)
    approved = []
    for path in sorted((signing / "profiles").glob("*.mobileprovision")):
        # 보안 도구의 원문 출력과 예외는 메모리에서만 다루고 로그에는 남기지 않는다.
        raw = subprocess.check_output(["security", "cms", "-D", "-i", str(path)], stderr=subprocess.DEVNULL)
        profile = plistlib.loads(raw)
        if eligible(profile, bundle_id, team_id, now):
            approved.append((path, str(uuid.UUID(profile["UUID"]))))
    if not approved:
        raise ValueError("기존 Apple 로그인 프로파일 없음")
    selected.mkdir(parents=True, exist_ok=True)
    installed.mkdir(parents=True, exist_ok=True)
    for path, profile_id in approved:
        name = f"mylovecoach-ci-{run_id}-{profile_id}.mobileprovision"
        # 이 실행의 사본만 만들고 cleanup에서도 같은 접두사만 지운다.
        shutil.copyfile(path, selected / name)
        with (installed / name).open("xb") as destination:
            destination.write(path.read_bytes())
    print("기존 App Store 프로파일의 Apple 로그인 권한을 확인했습니다.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("::error::기존 인증서와 앱·팀·Apple 로그인 권한이 맞는 유효한 프로파일이 필요합니다. 새 프로파일은 만들지 않았습니다.", file=sys.stderr)
        sys.exit(1)
