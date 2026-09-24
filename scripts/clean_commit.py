"""Create a git commit with commit-tree (no Cursor Co-authored-by hook).

Usage:
  python scripts/clean_commit.py "Commit subject" ["Optional body"]
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=ROOT, check=True, text=True, **kwargs)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/clean_commit.py \"subject\" [\"body\"]", file=sys.stderr)
        sys.exit(2)

    subject = sys.argv[1]
    body = sys.argv[2] if len(sys.argv) > 2 else None

    run(["git", "add", "-A"])
    # Never commit .cursor
    subprocess.run(["git", "reset", "-q", "--", ".cursor"], cwd=ROOT, check=False)

    status = subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True)
    if not status.strip():
        print("Nothing to commit")
        sys.exit(0)

    tree = subprocess.check_output(["git", "write-tree"], cwd=ROOT, text=True).strip()
    parent = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()

    cmd = ["git", "commit-tree", tree, "-p", parent, "-m", subject]
    if body:
        cmd.extend(["-m", body])
    commit = subprocess.check_output(cmd, cwd=ROOT, text=True).strip()
    run(["git", "reset", "--hard", commit])

    msg = subprocess.check_output(["git", "log", "-1", "--format=full"], cwd=ROOT, text=True)
    if "Co-authored-by" in msg or "cursoragent" in msg.lower():
        print("ERROR: unwanted attribution in commit", file=sys.stderr)
        sys.exit(1)
    print("OK", commit)
    print(msg)


if __name__ == "__main__":
    main()
