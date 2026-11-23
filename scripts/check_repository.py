"""Check the tracked project setup without installing third-party packages."""

from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parent.parent
REQUIRED = (
    "README.md",
    "AGENTS.md",
    ".gitignore",
    ".gitattributes",
    ".env.example",
    "docs/PROJECT_BRIEF.md",
    "docs/DEVELOPMENT.md",
    "docs/ENVIRONMENT.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/workflows/repository-check.yml",
    "scripts/check_repository.py",
)
SECRET_PATTERNS = (
    re.compile(r"\bgsk_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b"),
    re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{40,}\b"),
    re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b"),
    re.compile(r"-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----"),
)


def git(*args):
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, check=False
    )


def main():
    failures = []
    for name in REQUIRED:
        if not (ROOT / name).is_file():
            failures.append(f"Required file missing: {name}")

    result = git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
    if result.returncode:
        print("FAIL: Run this check inside an initialized Git repository.")
        return 1

    names = sorted(set(result.stdout.decode("utf-8").rstrip("\0").split("\0")))
    for name in filter(None, names):
        path = ROOT / name
        if path.name.startswith(".env") and path.name != ".env.example":
            failures.append(f"Local environment file would be committed: {name}")
        if not path.is_file():
            continue
        data = path.read_bytes()
        if b"\0" in data:
            continue
        try:
            content = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            continue
        for line_number, line in enumerate(content.splitlines(), start=1):
            if any(pattern.search(line) for pattern in SECRET_PATTERNS):
                failures.append(f"Possible credential detected: {name}:{line_number}")

    for name in names:
        example = ROOT / name
        if example.name != ".env.example" or not example.is_file():
            continue
        for line_number, line in enumerate(example.read_text(encoding="utf-8").splitlines(), start=1):
            text = line.strip()
            if not text or text.startswith("#"):
                continue
            if "=" not in text or text.split("=", 1)[1].strip() not in ("", '""', "''"):
                failures.append(f"Environment example must have empty values: {name}:{line_number}")

    for name in (".env", ".env.local", ".secrets/key.txt", "node_modules/example.js", "data/private/example.csv"):
        if git("check-ignore", "--no-index", "--quiet", "--", name).returncode:
            failures.append(f"Local/generated path is not ignored: {name}")
    if git("check-ignore", "--no-index", "--quiet", "--", ".env.example").returncode == 0:
        failures.append("The environment example must not be ignored.")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 1
    print(f"PASS: Repository setup and common credential patterns checked across {len(names)} files.")
    print("No application build, model evaluation or device test is claimed by this check.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
