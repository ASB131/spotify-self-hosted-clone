"""Patch android/app/build.gradle.kts for Mix Player release builds."""
from pathlib import Path


def main() -> None:
    p = Path("android/app/build.gradle.kts")
    if not p.exists():
        return
    t = p.read_text(encoding="utf-8")
    if "shrinkResources" not in t:
        t = t.replace("release {", "release {\n            shrinkResources = false", 1)
        p.write_text(t, encoding="utf-8")
    print(p.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
