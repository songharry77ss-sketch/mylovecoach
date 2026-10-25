"""Optimize generated PNGs above 3 MB and validate this candidate set only.

Run after render-all.ps1: python docs/store-assets/candidates-20261025/optimize_validate.py
Only this candidate directory's PNGs and validation-files.json may be written.
Original app captures and the first candidate set are read-only inputs.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, __version__ as pillow_version


BASE = Path(__file__).resolve().parent
LIMIT = 3_000_000
PHOTO_NAMES = (
    "01-cafe-woman.png", "02-neon-man.png", "03-lamplight-woman.png",
    "04-studio-man.png", "05-studio-woman.png", "06-riverside-couple.png",
    "07-friends.png", "08-sofa-man.png",
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encode_png(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True, compress_level=9)
    return output.getvalue()


def candidate_path(path: Path) -> Path:
    resolved = path.resolve()
    if not resolved.is_relative_to(BASE) or resolved.suffix.lower() != ".png":
        raise ValueError(f"Not an allowed candidate PNG: {path}")
    return resolved


def inspect_png(path: Path, size: tuple[int, int], category: str) -> dict:
    path = candidate_path(path)
    record = {"path": path.relative_to(BASE).as_posix(), "category": category,
              "expected_dimensions": list(size), "exists": path.is_file()}
    if not path.is_file():
        record["error"] = "Missing required file"
        return record
    before = path.read_bytes()
    record.update({"bytes_before": len(before), "sha256_before": sha256(before)})
    try:
        with Image.open(io.BytesIO(before)) as opened:
            if opened.format != "PNG":
                raise ValueError(f"Expected PNG, found {opened.format}")
            opened.load()
            image = opened.copy()
        record.update({"dimensions": list(image.size), "mode_before": image.mode})
        if image.size != size:
            raise ValueError(f"Expected dimensions {size}, found {image.size}")
        chosen = before
        operation = "unchanged_under_limit"
        quantization = None
        if len(before) > LIMIT:
            lossless = encode_png(image)
            record["lossless_optimized_bytes"] = len(lossless)
            if len(lossless) < len(chosen):
                chosen = lossless
                operation = "lossless_png_optimization"
            if len(chosen) > LIMIT:
                if "A" in image.getbands() and image.getchannel("A").getextrema() != (255, 255):
                    raise ValueError("Refusing to flatten nonopaque alpha for MEDIANCUT quantization")
                rgb = image.convert("RGB")
                palette = rgb.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
                quantized = rgb.quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG)
                smaller = encode_png(quantized)
                record["quantized_bytes"] = len(smaller)
                if len(smaller) < len(chosen):
                    chosen = smaller
                    operation = "median_cut_256_floyd_steinberg_png_optimization"
                    quantization = {"colors_max": 256, "method": "MEDIANCUT",
                                    "dither": "FLOYDSTEINBERG"}
            if len(chosen) > LIMIT:
                raise ValueError(f"PNG remains over {LIMIT} bytes after optimization: {len(chosen)}")
            if chosen != before:
                temporary = path.with_name(path.name + ".optimize-tmp")
                temporary.write_bytes(chosen)
                temporary.replace(path)
        with Image.open(io.BytesIO(chosen)) as final_image:
            final_image.load()
            final_mode = final_image.mode
            color_count = len(final_image.getcolors(maxcolors=256) or []) or None
        record.update({"bytes": len(chosen), "sha256": sha256(chosen),
                       "mode": final_mode, "operation": operation,
                       "quantization": quantization, "palette_color_count": color_count,
                       "within_3mb": len(chosen) <= LIMIT, "valid": True})
    except Exception as error:
        record.update({"valid": False, "error": f"{type(error).__name__}: {error}"})
    return record


def main() -> int:
    manifest_path = BASE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    report = {"generated_at_utc": datetime.now(timezone.utc).isoformat(),
              "pillow_version": pillow_version, "limit_bytes": LIMIT,
              "manifest_sha256": sha256(manifest_path.read_bytes()),
              "notes": ["Files already at or below 3,000,000 bytes are left byte-for-byte unchanged.",
                        "Only oversize PNGs are losslessly optimized; MEDIANCUT 256-color Floyd-Steinberg quantization is the fallback.",
                        "Pixel dimensions and source SHA-256 checks do not replace visual layout review."],
              "sources": [], "files": [], "errors": [], "warnings": []}

    # Verify original captures before changing any generated output.
    for stem, expected_hash in manifest["sources"].items():
        if Path(stem).name != stem:
            raise ValueError(f"Unexpected source filename in manifest: {stem}")
        source = BASE.parent / "ios-6.7" / (stem + ".png")
        actual = sha256(source.read_bytes()) if source.is_file() else None
        matches = actual == expected_hash
        report["sources"].append({"path": str(source), "manifest_sha256": expected_hash,
                                  "actual_sha256": actual, "matches": matches})
        if not matches:
            report["errors"].append(f"Original source hash mismatch: {stem}")
    if not report["errors"]:
        expected_photos = set(PHOTO_NAMES)
        actual_photos = {p.name for p in (BASE / "_photos").glob("*.png")}
        if actual_photos != expected_photos:
            report["errors"].append(f"Expected exactly eight named photos; missing={sorted(expected_photos - actual_photos)}, extra={sorted(actual_photos - expected_photos)}")
        expected_store: dict[Path, tuple[int, int]] = {}
        for style in ("P", "S", "N"):
            for number in range(1, 7):
                expected_store[(BASE / style / f"{number}.png").resolve()] = (1290, 2796)
                expected_store[(BASE / style / f"play-{number}.png").resolve()] = (1242, 2208)
        manifest_jobs = {}
        for _html, output, width, height in manifest["jobs"]:
            target = candidate_path(Path(output))
            if target in manifest_jobs:
                report["errors"].append(f"Duplicate manifest output: {target}")
            manifest_jobs[target] = (int(width), int(height))
        for target, dimensions in expected_store.items():
            if manifest_jobs.get(target) != dimensions:
                report["errors"].append(f"Missing or mismatched store render job: {target}")
        for name in PHOTO_NAMES:
            report["files"].append(inspect_png(BASE / "_photos" / name, (1024, 1536), "photo"))
        for target, dimensions in expected_store.items():
            category = "play" if target.stem.startswith("play-") else "ios"
            report["files"].append(inspect_png(target, dimensions, category))
        for target, dimensions in manifest_jobs.items():
            if target not in expected_store:
                if target.is_file():
                    report["files"].append(inspect_png(target, dimensions, "comparison"))
                else:
                    report["warnings"].append(f"Comparison not yet rendered: {target.relative_to(BASE).as_posix()}")

    for entry in report["files"]:
        if not entry.get("valid"):
            report["errors"].append(f"{entry['path']}: {entry.get('error', 'Invalid PNG')}")
    report["counts"] = {category: sum(entry.get("valid", False) and entry["category"] == category
                                     for entry in report["files"])
                        for category in ("photo", "ios", "play", "comparison")}
    for category, count in (("photo", 8), ("ios", 18), ("play", 18)):
        if report["counts"][category] != count:
            report["errors"].append(f"Expected {count} valid {category} PNGs, found {report['counts'][category]}")
    report["max_png_bytes"] = max((entry.get("bytes", 0) for entry in report["files"]), default=0)
    report["passed"] = not report["errors"]
    (BASE / "validation-files.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("passed", "counts", "max_png_bytes", "errors", "warnings")}, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
