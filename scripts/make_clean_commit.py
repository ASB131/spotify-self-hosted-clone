"""Create a single Git commit without Cursor's co-author hook. Run from repo root."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=ROOT, check=True, text=True, **kwargs)


def main() -> None:
    # Orphan branch avoids Windows file locks on .git/objects during rmtree.
    run(["git", "checkout", "--orphan", "clean-main"])
    run(["git", "add", "-A"])
    tree = subprocess.check_output(["git", "write-tree"], cwd=ROOT, text=True).strip()
    commit = subprocess.check_output(
        [
            "git",
            "commit-tree",
            tree,
            "-m",
            "Initial release: self-hosted music platform with Docker, FastAPI, Next.js, and Chrome extension.",
            "-m",
            "Includes deduplicated library storage, range streaming, Celery downloads, admin setup, and CI image builds.",
        ],
        cwd=ROOT,
        text=True,
    ).strip()
    run(["git", "reset", "--hard", commit])
    subprocess.run(["git", "branch", "-D", "main"], cwd=ROOT, capture_output=True)
    run(["git", "branch", "-M", "main"])
    tracked = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
    if ".cursor" in tracked:
        print("ERROR: .cursor still tracked", file=sys.stderr)
        sys.exit(1)
    msg = subprocess.check_output(["git", "log", "-1", "--format=full"], cwd=ROOT, text=True)
    if "Co-authored-by" in msg or "cursoragent" in msg.lower():
        print("ERROR: unwanted attribution in commit", file=sys.stderr)
        sys.exit(1)
    print("OK", commit)
    print(msg)


if __name__ == "__main__":
    main()
