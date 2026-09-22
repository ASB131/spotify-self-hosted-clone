"""Split and match multi-artist credit strings.

Rules (hardstyle-friendly):
- Always split on: comma, feat./ft./featuring, vs, spaced X / ×
- Split on & only when the chunk is not a known single artist name
  (e.g. "Steve Aoki & Sub Zero Project" → two artists;
   "D-Block & S-te-Fan" / "W&W" stay one when known or short-token)
"""

from __future__ import annotations

import re

# Primary collaboration separators (applied before &).
# Spaced X/× only — never bare "x" inside words like Max.
_PRIMARY_SPLIT = re.compile(
    r"\s*,\s*"
    r"|\s+(?:feat\.|ft\.|featuring|vs\.?)\s+"
    r"|\s+[x×]\s+",
    re.IGNORECASE,
)

_HYPHEN_FIX = str.maketrans({"‐": "-", "‑": "-", "–": "-", "—": "-"})


def _norm(name: str) -> str:
    return re.sub(r"\s+", " ", name.translate(_HYPHEN_FIX).strip().lower())


def normalize_hyphens(name: str) -> str:
    return name.translate(_HYPHEN_FIX).strip()


# Built-in single-artist names that contain "&".
KNOWN_AMPERSAND_ARTISTS = {
    "d-block & s-te-fan",
    "d-block and s-te-fan",
    "w&w",
    "w & w",
}


def split_artists(
    artist_field: str | None,
    *,
    known_exact: set[str] | None = None,
) -> list[str]:
    """Split a credit string into individual artist names."""
    if not artist_field:
        return []
    text = normalize_hyphens(artist_field)
    if not text:
        return []

    keep = set(KNOWN_AMPERSAND_ARTISTS) | set(known_exact or ())
    if _norm(text) in keep:
        return [text]

    chunks = [c.strip() for c in _PRIMARY_SPLIT.split(text) if c and c.strip()]
    if not chunks:
        chunks = [text]
    # Comma / X / feat already fired — leftover "&" is usually a duo name.
    primary_split = len(chunks) > 1

    out: list[str] = []
    for chunk in chunks:
        has_amp = "&" in chunk or "＆" in chunk
        if _norm(chunk) in keep or not has_amp:
            out.append(chunk)
            continue
        if primary_split:
            # e.g. "D-Block & S-te-Fan X Phuture Noize"
            out.append(chunk)
            continue
        parts = [p.strip() for p in re.split(r"\s*[&＆]\s*", chunk) if p and p.strip()]
        if not parts:
            out.append(chunk)
            continue
        # W&W / R&B style: both sides are tiny tokens → one artist
        if _is_short_ampersand_act(parts):
            out.append(chunk)
            continue
        out.extend(_merge_known_ampersand_parts(parts, keep))
    return out


def _is_short_ampersand_act(parts: list[str]) -> bool:
    """True for acts like W&W where each side is 1–2 characters."""
    if len(parts) != 2:
        return False
    return all(len(re.sub(r"[^0-9A-Za-z]", "", p)) <= 2 for p in parts)


def _merge_known_ampersand_parts(parts: list[str], keep: set[str]) -> list[str]:
    """Re-join 'D-Block' + 'S-te-Fan' when that duo is a known single artist."""
    out: list[str] = []
    i = 0
    while i < len(parts):
        if i + 1 < len(parts):
            left, right = parts[i], parts[i + 1]
            if _is_short_ampersand_act([left, right]):
                out.append(f"{left}&{right}")
                i += 2
                continue
            duo = f"{left} & {right}"
            if _norm(duo) in keep:
                out.append(duo)
                i += 2
                continue
        out.append(parts[i])
        i += 1
    return out


def format_artists(names: list[str]) -> str:
    cleaned = [normalize_hyphens(n) for n in names if n and n.strip()]
    return ", ".join(cleaned)


def normalize_artist_credits(
    artist_field: str | None,
    *,
    known_exact: set[str] | None = None,
) -> str:
    """Split then rejoin with commas for consistent library storage."""
    parts = split_artists(artist_field, known_exact=known_exact)
    return format_artists(parts) if parts else (artist_field or "Unknown Artist")


def track_has_artist(artist_field: str | None, name: str) -> bool:
    needle = _norm(name)
    if not needle:
        return False
    return any(_norm(a) == needle for a in split_artists(artist_field))


def extract_ampersand_chunks(artist_field: str | None) -> list[str]:
    """Pull &-containing name chunks from a credit (candidates to keep as one)."""
    if not artist_field:
        return []
    text = normalize_hyphens(artist_field)
    chunks = [c.strip() for c in _PRIMARY_SPLIT.split(text) if c and c.strip()] or [text]
    return [c for c in chunks if "&" in c or "＆" in c]
