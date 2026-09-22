"""Split and match multi-artist credit strings (comma-separated)."""

from __future__ import annotations


def split_artists(artist_field: str | None) -> list[str]:
    if not artist_field:
        return []
    parts = [p.strip() for p in artist_field.split(",")]
    return [p for p in parts if p]


def track_has_artist(artist_field: str | None, name: str) -> bool:
    needle = name.strip().lower()
    if not needle:
        return False
    return any(a.lower() == needle for a in split_artists(artist_field))
