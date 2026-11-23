"""Import a reviewed GROAD checkout and verify its supplied research archive."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {".git", "node_modules", "dist", "build", ".next", ".vinext", ".wrangler", ".sites-runtime", ".openai", "__pycache__", ".venv", "venv", "secrets"}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", type=Path, required=True)
    parser.add_argument("--api", type=Path, required=True)
    parser.add_argument("--research-archive", type=Path, required=True)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location("repository_checks", ROOT / "scripts/check_repository.py")
    checks = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checks)

    # Only compare known values in memory; never include them in a report.
    secrets = set()
    for source in (args.web, args.api):
        for env_name in (".env", ".env.local"):
            env_path = source / env_name
            if env_path.exists():
                for line in env_path.read_text(encoding="utf-8-sig").splitlines():
                    if "=" not in line or line.lstrip().startswith("#"):
                        continue
                    key, value = line.split("=", 1)
                    value = value.strip().strip("\"'")
                    if any(word in key.upper() for word in ("KEY", "TOKEN", "PASSWORD", "SECRET")) and len(value) >= 16:
                        secrets.add(value)

    sources = (("web", args.web.resolve(), ROOT / "apps/web"), ("api", args.api.resolve(), ROOT / "services/api"))
    if any(destination.exists() for _, _, destination in sources):
        raise SystemExit("Import destinations already exist; refusing to overwrite development work.")
    candidates = []
    for label, source, destination in sources:
        if not (source / "package.json").is_file():
            raise SystemExit(f"Missing package manifest in {label} source.")
        for directory, dirs, names in os.walk(source, followlinks=False):
            dirs[:] = [name for name in dirs if name not in SKIP_DIRS and not (Path(directory) / name).is_symlink()]
            if label == "api" and Path(directory) == source:
                dirs[:] = [name for name in dirs if name != "data"]
            for name in sorted(names):
                path = Path(directory) / name
                if name.startswith(".env") or name == ".npmrc" or name.endswith((".tsbuildinfo", ".log", ".pem", ".key", ".p12", ".pfx")) or path.is_symlink():
                    continue
                data = path.read_bytes()
                try:
                    text = data.decode("utf-8-sig")
                except UnicodeDecodeError:
                    text = ""
                if any(value in text for value in secrets) or any(pattern.search(text) for pattern in checks.SECRET_PATTERNS):
                    raise SystemExit(f"Credential review required before importing {label}/{path.relative_to(source).as_posix()}")
                candidates.append((label, source, destination, path, data))

    research_destination = ROOT / ".local/groad-research"
    if research_destination.exists():
        raise SystemExit("Research destination already exists; refusing to overwrite it.")
    with zipfile.ZipFile(args.research_archive) as archive:
        manifest = json.loads(archive.read("MANIFEST.json").decode("utf-8-sig"))
        expected = {item["relative_path"]: item for item in manifest["files"]}
        infos = archive.infolist()
        if sum(item.file_size for item in infos) > 250_000_000:
            raise SystemExit("Research archive is unexpectedly large.")
        verified = []
        for info in infos:
            relative = PurePosixPath(info.filename.replace("\\", "/"))
            if relative.is_absolute() or ".." in relative.parts or any(":" in part for part in relative.parts) or ((info.external_attr >> 16) & 0o170000) == 0o120000:
                raise SystemExit("Unsafe archive path encountered.")
            if info.is_dir():
                continue
            data = archive.read(info)
            entry = expected.get(info.filename)
            if entry and (entry["bytes"] != len(data) or entry["sha256"] != digest(data)):
                raise SystemExit(f"Research manifest mismatch: {info.filename}")
            verified.append((relative, data, entry is not None))

    # All source and archive checks pass before any application files are written.
    records = []
    for label, source, destination, path, data in candidates:
        relative = path.relative_to(source)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        records.append({"source": label, "source_path": relative.as_posix(), "destination": target.relative_to(ROOT).as_posix(), "bytes": len(data), "sha256": digest(data)})
    for relative, data, _ in verified:
        target = research_destination.joinpath(*relative.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    evidence = ROOT / "research/evidence"
    evidence.mkdir(parents=True, exist_ok=True)
    for name in ("analysis_results/강원_교통사고_가설검증_최종판정.md", "analysis_results/강원고속도로_완전격자_민감도검증.json", "EXCLUDED_LARGE_FILES.csv"):
        shutil.copyfile(research_destination / name, evidence / Path(name).name)
    report = {
        "imported_on": "2026-11-23",
        "source_files": records,
        "research_archive": {"name": args.research_archive.name, "sha256": digest(args.research_archive.read_bytes()), "files": len(verified), "matched_original_manifest": sum(matched for _, _, matched in verified), "manifest_note": "The original manifest lists the larger original package. Only present archive entries were verified; absent entries were not claimed as verified."},
        "excluded": ["credentials and environment files", "Git and hosted Site identity", "installed dependencies and build outputs", "runtime databases and map data", "the ten large research panels absent from the provided archive"],
    }
    (ROOT / "docs/GROAD_IMPORT_MANIFEST.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / ".local/import-source-paths.json").write_text(json.dumps({label: str(source) for label, source, _ in sources}), encoding="utf-8")
    print(json.dumps({"source_files_copied": len(records), "research_files": len(verified), "research_hashes_matched": sum(matched for _, _, matched in verified)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
