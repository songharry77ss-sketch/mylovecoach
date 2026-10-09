"""실제 서명 자료 없이 Apple 로그인 프로파일의 실패 경로를 검사한다."""

from contextlib import redirect_stdout
from copy import deepcopy
import datetime
import importlib.util
import io
import os
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("profile_guard", Path(__file__).with_name("validate-ios-profiles.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

NOW = datetime.datetime(2026, 10, 9, tzinfo=datetime.timezone.utc)
BUNDLE = "app.synthetic.example"
TEAM = "SYNTHETIC1"


def valid_profile():
    return {
        "UUID": "2a3b37a7-352e-42c3-a8c4-c7fa249b1e15",
        "TeamIdentifier": [TEAM],
        "ExpirationDate": datetime.datetime(2099, 10, 9),
        "Entitlements": {
            "application-identifier": f"{TEAM}.{BUNDLE}",
            "com.apple.developer.applesignin": ["Default"],
            "get-task-allow": False,
        },
    }


class ProfileGuardTests(unittest.TestCase):
    def test_existing_apple_app_store_profile_is_accepted(self):
        self.assertTrue(guard.eligible(valid_profile(), BUNDLE, TEAM, NOW))

    def test_missing_apple_permission_is_rejected(self):
        profile = valid_profile()
        del profile["Entitlements"]["com.apple.developer.applesignin"]
        self.assertFalse(guard.eligible(profile, BUNDLE, TEAM, NOW))

    def test_other_app_or_team_is_rejected(self):
        for field, value in (("application-identifier", "OTHER.app.synthetic.example"),):
            profile = valid_profile()
            profile["Entitlements"][field] = value
            self.assertFalse(guard.eligible(profile, BUNDLE, TEAM, NOW))
        self.assertFalse(guard.eligible(valid_profile(), BUNDLE, "OTHER", NOW))

    def test_expired_or_missing_expiry_is_rejected(self):
        for value in (None, datetime.datetime(2026, 10, 9), datetime.datetime(2025, 1, 1)):
            profile = valid_profile()
            profile["ExpirationDate"] = value
            self.assertFalse(guard.eligible(profile, BUNDLE, TEAM, NOW))

    def test_debug_ad_hoc_or_enterprise_profile_is_rejected(self):
        cases = []
        profile = valid_profile()
        profile["Entitlements"]["get-task-allow"] = True
        cases.append(profile)
        profile = valid_profile()
        profile["ProvisionedDevices"] = ["synthetic-device"]
        cases.append(profile)
        profile = valid_profile()
        profile["ProvisionsAllDevices"] = True
        cases.append(profile)
        for profile in cases:
            self.assertFalse(guard.eligible(profile, BUNDLE, TEAM, NOW))

    def run_main(self, profiles, action):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            incoming = root / "signing/profiles"
            incoming.mkdir(parents=True)
            for index, profile in enumerate(profiles):
                (incoming / f"synthetic-{index}.mobileprovision").write_bytes(plistlib.dumps(profile))
            output = io.StringIO()
            with patch.dict(os.environ, {
                "RUNNER_TEMP": str(root), "BUNDLE_ID": BUNDLE,
                "APPLE_TEAM_ID": TEAM, "GITHUB_RUN_ID": "123456",
            }), patch.object(Path, "home", return_value=root / "home"), patch.object(
                guard.subprocess, "check_output", side_effect=lambda args, **kwargs: Path(args[-1]).read_bytes(),
            ), redirect_stdout(output):
                action(root)
            self.assertNotIn(TEAM, output.getvalue())
            self.assertNotIn(BUNDLE, output.getvalue())

    def test_no_profiles_fails_without_installing(self):
        def action(root):
            with self.assertRaises(ValueError):
                guard.main()
            self.assertFalse((root / "home").exists())
        self.run_main([], action)

    def test_only_profile_without_apple_fails_without_installing(self):
        profile = valid_profile()
        profile["Entitlements"].pop("com.apple.developer.applesignin")
        def action(root):
            with self.assertRaises(ValueError):
                guard.main()
            self.assertFalse((root / "home").exists())
        self.run_main([profile], action)

    def test_only_eligible_profile_is_copied_to_run_scoped_paths(self):
        invalid = deepcopy(valid_profile())
        invalid["Entitlements"].pop("com.apple.developer.applesignin")
        def action(root):
            guard.main()
            selected = list((root / "signing/verified-profiles").glob("*.mobileprovision"))
            installed = list((root / "home/Library/Developer/Xcode/UserData/Provisioning Profiles").glob("*.mobileprovision"))
            self.assertEqual(len(selected), 1)
            self.assertEqual([p.name for p in selected], [p.name for p in installed])
            self.assertTrue(selected[0].name.startswith("mylovecoach-ci-123456-"))
        self.run_main([invalid, valid_profile()], action)


if __name__ == "__main__":
    unittest.main()
