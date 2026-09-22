"""Build Discover Weekly and Release Radar slates from library + MB/LB."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.discovery import (
    ArtistMbid,
    DiscoveryItem,
    DiscoveryItemStatus,
    DiscoveryKind,
    DiscoveryPlaylist,
    PlayEvent,
)
from app.models.track import Track
from app.models.user import User
from app.models.user_track import UserTrack
from app.services import listenbrainz as lb
from app.services import musicbrainz as mb

logger = logging.getLogger(__name__)

WEEKLY_SIZE = 40
RADAR_SIZE = 30
MAX_PER_ARTIST_RADAR = 6


def week_key(dt: datetime | None = None) -> str:
    d = dt or datetime.now(timezone.utc)
    iso = d.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def _norm(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def _split_artists(artist: str) -> list[str]:
    parts = re.split(r"\s*(?:,|&| feat\.| ft\.| featuring )\s*", artist, flags=re.I)
    return [p.strip() for p in parts if p and p.strip()]


def resolve_library_artists(db: Session, user_id: int) -> list[ArtistMbid]:
    tracks = db.scalars(
        select(Track)
        .join(UserTrack, UserTrack.track_id == Track.id)
        .where(UserTrack.user_id == user_id)
    ).all()
    names: dict[str, str] = {}
    for t in tracks:
        for n in _split_artists(t.artist or ""):
            names.setdefault(_norm(n), n)

    # Weight by plays
    play_counts = dict(
        db.execute(
            select(Track.artist, func.count(PlayEvent.id))
            .join(PlayEvent, PlayEvent.track_id == Track.id)
            .where(PlayEvent.user_id == user_id)
            .group_by(Track.artist)
        ).all()
    )

    resolved: list[ArtistMbid] = []
    for key, display in sorted(names.items(), key=lambda kv: -_artist_weight(kv[1], play_counts)):
        row = db.scalar(select(ArtistMbid).where(ArtistMbid.normalized_name == key))
        if not row:
            hit = mb.search_artist(display)
            tags: list[str] = []
            mbid = None
            if hit:
                mbid = hit.get("id")
                if mbid:
                    tags = mb.artist_tags(mbid)
            row = ArtistMbid(
                normalized_name=key,
                display_name=display,
                mbid=mbid,
                tags_json=mb.tags_json(tags) if tags else None,
            )
            db.add(row)
            db.flush()
        elif row.mbid and not row.tags_json:
            tags = mb.artist_tags(row.mbid)
            row.tags_json = mb.tags_json(tags) if tags else "[]"
            db.add(row)
            db.flush()
        resolved.append(row)
        if len(resolved) >= 40:
            break
    db.commit()
    return resolved


def _artist_weight(display: str, play_counts: dict) -> int:
    w = 1
    for artist, c in play_counts.items():
        if display.lower() in (artist or "").lower():
            w += int(c)
    return w


def _library_keys(db: Session, user_id: int) -> set[str]:
    rows = db.execute(
        select(Track.title, Track.artist)
        .join(UserTrack, UserTrack.track_id == Track.id)
        .where(UserTrack.user_id == user_id)
    ).all()
    return {_norm(f"{t}::{a}") for t, a in rows}


def _parse_tags(row: ArtistMbid) -> list[str]:
    if not row.tags_json:
        return []
    try:
        return list(json.loads(row.tags_json))
    except Exception:
        return []


def _candidate_key(title: str, artist: str) -> str:
    return _norm(f"{title}::{artist}")


def _enrich_art(c: dict) -> dict:
    if c.get("art_url"):
        return c
    art = mb.cover_art_url(release_mbid=c.get("release_mbid"))
    if art:
        c["art_url"] = art
    return c


def build_discover_weekly_candidates(db: Session, user_id: int) -> list[dict]:
    artists = resolve_library_artists(db, user_id)
    have = _library_keys(db, user_id)
    tags: list[str] = []
    for a in artists:
        tags.extend(_parse_tags(a))
    # unique preserve order
    seen_tag: set[str] = set()
    tag_list: list[str] = []
    for t in tags:
        tl = t.lower()
        if tl not in seen_tag:
            seen_tag.add(tl)
            tag_list.append(t)
    tag_list = tag_list[:6] or ["pop", "rock", "electronic"]

    candidates: list[dict] = []
    seen: set[str] = set()

    def add(c: dict) -> None:
        title = (c.get("title") or "").strip()
        artist = (c.get("artist") or "").strip()
        if not title or not artist:
            return
        k = _candidate_key(title, artist)
        if k in have or k in seen:
            return
        seen.add(k)
        c = _enrich_art(dict(c))
        candidates.append(
            {
                "title": title[:512],
                "artist": artist[:512],
                "album": (c.get("album") or None),
                "recording_mbid": c.get("recording_mbid"),
                "release_mbid": c.get("release_mbid"),
                "artist_mbid": c.get("artist_mbid"),
                "duration_ms": c.get("duration_ms"),
                "art_url": c.get("art_url"),
            }
        )

    # Genre / popular mix via ListenBrainz tag radio
    for tag in tag_list[:4]:
        for rec in lb.popular_recordings_for_tag(tag, count=20):
            add(rec)
            if len(candidates) >= WEEKLY_SIZE:
                return candidates[:WEEKLY_SIZE]

    # MusicBrainz tag search for older + newer mix
    for tag in tag_list[:3]:
        for rec in mb.search_recordings_by_tag(tag, limit=20):
            add(rec)
            if len(candidates) >= WEEKLY_SIZE:
                return candidates[:WEEKLY_SIZE]

    # Similar artists → expand recent releases to real tracks
    for a in artists[:8]:
        if not a.mbid:
            continue
        for sim in lb.similar_artists(a.mbid)[:3]:
            smbid = sim.get("artist_mbid") or sim.get("mbid")
            sname = sim.get("name") or a.display_name
            if not smbid:
                continue
            for rg in mb.browse_artist_releases(smbid, limit=3)[:2]:
                rgid = rg.get("id")
                rel_mbid = mb.release_group_first_release_mbid(rgid) if rgid else None
                if rel_mbid:
                    for t in mb.release_tracklist(rel_mbid)[:2]:
                        t = dict(t)
                        t.setdefault("artist", sname)
                        t["artist_mbid"] = smbid
                        add(t)
                        if len(candidates) >= WEEKLY_SIZE:
                            return candidates[:WEEKLY_SIZE]
                else:
                    add(
                        {
                            "title": rg.get("title") or "Unknown",
                            "artist": sname,
                            "album": rg.get("title"),
                            "artist_mbid": smbid,
                        }
                    )
                    if len(candidates) >= WEEKLY_SIZE:
                        return candidates[:WEEKLY_SIZE]

    return candidates[:WEEKLY_SIZE]


def build_release_radar_candidates(db: Session, user_id: int) -> list[dict]:
    """~30 recent tracks from artists already in the user's library."""
    artists = resolve_library_artists(db, user_id)
    have = _library_keys(db, user_id)
    candidates: list[dict] = []
    seen: set[str] = set()
    per_artist: dict[str, int] = {}
    MAX_PER = 6  # tracks per library artist

    def add(c: dict, artist_key: str) -> None:
        if per_artist.get(artist_key, 0) >= MAX_PER:
            return
        title = (c.get("title") or "").strip()
        artist = (c.get("artist") or "").strip()
        if not title or not artist:
            return
        k = _candidate_key(title, artist)
        if k in have or k in seen:
            return
        seen.add(k)
        per_artist[artist_key] = per_artist.get(artist_key, 0) + 1
        c = _enrich_art(dict(c))
        candidates.append(
            {
                "title": title[:512],
                "artist": artist[:512],
                "album": c.get("album"),
                "recording_mbid": c.get("recording_mbid"),
                "release_mbid": c.get("release_mbid"),
                "artist_mbid": c.get("artist_mbid")
                if c.get("artist_mbid")
                else (artist_key if len(str(artist_key)) == 36 else None),
                "duration_ms": c.get("duration_ms"),
                "art_url": c.get("art_url"),
            }
        )

    # Primary: MusicBrainz recent releases for each library artist
    for a in artists:
        if not a.mbid:
            continue
        if len(candidates) >= RADAR_SIZE:
            break
        for rg in mb.browse_artist_releases(a.mbid, limit=8):
            first = (rg.get("first-release-date") or "")[:10]
            # Prefer last ~3 years; still allow undated
            if first and first < "2023-01-01":
                continue
            rgid = rg.get("id")
            rel_mbid = mb.release_group_first_release_mbid(rgid) if rgid else None
            if not rel_mbid:
                continue
            tracks = mb.release_tracklist(rel_mbid)
            # Take a few tracks from each recent release
            for t in tracks[:3]:
                t = dict(t)
                t.setdefault("artist", a.display_name)
                t["artist_mbid"] = a.mbid
                add(t, a.mbid)
                if len(candidates) >= RADAR_SIZE:
                    return candidates[:RADAR_SIZE]
            if per_artist.get(a.mbid, 0) >= MAX_PER:
                break

    # Supplement: ListenBrainz fresh releases filtered to library artists
    mbid_set = {a.mbid for a in artists if a.mbid}
    name_by_mbid = {a.mbid: a.display_name for a in artists if a.mbid}
    if len(candidates) < RADAR_SIZE:
        for rel in lb.fresh_releases(days=90):
            artist_mbids = list(rel.get("artist_mbids") or [])
            if isinstance(rel.get("artist_mbid"), str):
                artist_mbids.append(rel["artist_mbid"])
            match = next((amid for amid in artist_mbids if amid in mbid_set), None)
            credit = (rel.get("artist_credit_name") or rel.get("artist_name") or "").strip()
            if not match and credit:
                for a in artists:
                    if _norm(a.display_name) == _norm(credit):
                        match = a.mbid or a.normalized_name
                        break
            if not match:
                continue
            release_mbid = rel.get("release_mbid") or rel.get("mbid")
            artist_name = credit or name_by_mbid.get(match) or "Unknown Artist"
            if release_mbid:
                for t in mb.release_tracklist(release_mbid)[:4]:
                    t = dict(t)
                    t.setdefault("artist", artist_name)
                    add(t, match or artist_name)
                    if len(candidates) >= RADAR_SIZE:
                        return candidates[:RADAR_SIZE]

    return candidates[:RADAR_SIZE]


def get_or_create_discovery_playlist(db: Session, user_id: int, kind: DiscoveryKind) -> DiscoveryPlaylist:
    pl = db.scalar(
        select(DiscoveryPlaylist).where(DiscoveryPlaylist.user_id == user_id, DiscoveryPlaylist.kind == kind)
    )
    if pl:
        return pl
    pl = DiscoveryPlaylist(user_id=user_id, kind=kind, week_key="")
    db.add(pl)
    db.commit()
    db.refresh(pl)
    return pl


def replace_week_items(db: Session, playlist: DiscoveryPlaylist, candidates: Iterable[dict], wk: str) -> None:
    # Keep ready items that still match this week? Plan: replace week's batch but preserve ready downloads.
    old = list(
        db.scalars(
            select(DiscoveryItem).where(
                DiscoveryItem.playlist_id == playlist.id,
                DiscoveryItem.week_key == wk,
            )
        ).all()
    )
    ready_by_key = {
        _candidate_key(i.title, i.artist): i
        for i in old
        if i.status == DiscoveryItemStatus.READY and i.track_id
    }
    for i in old:
        if i.status == DiscoveryItemStatus.READY and i.track_id:
            continue
        db.delete(i)
    db.flush()

    pos = 0
    used = set(ready_by_key.keys())
    for c in candidates:
        k = _candidate_key(c["title"], c["artist"])
        if k in used:
            continue
        if k in ready_by_key:
            continue
        db.add(
            DiscoveryItem(
                playlist_id=playlist.id,
                week_key=wk,
                position=pos,
                title=c["title"],
                artist=c["artist"],
                album=c.get("album"),
                duration_ms=c.get("duration_ms"),
                recording_mbid=c.get("recording_mbid"),
                release_mbid=c.get("release_mbid"),
                artist_mbid=c.get("artist_mbid"),
                status=DiscoveryItemStatus.AVAILABLE,
                art_url=c.get("art_url"),
            )
        )
        used.add(k)
        pos += 1

    # Reposition ready items at top
    for i, item in enumerate(ready_by_key.values()):
        item.week_key = wk
        item.position = i
        db.add(item)

    playlist.week_key = wk
    db.add(playlist)
    db.commit()


def refresh_user_discovery(db: Session, user_id: int) -> dict:
    wk = week_key()
    weekly = get_or_create_discovery_playlist(db, user_id, DiscoveryKind.DISCOVER_WEEKLY)
    radar = get_or_create_discovery_playlist(db, user_id, DiscoveryKind.RELEASE_RADAR)
    w_cands = build_discover_weekly_candidates(db, user_id)
    replace_week_items(db, weekly, w_cands, wk)
    r_cands = build_release_radar_candidates(db, user_id)
    replace_week_items(db, radar, r_cands, wk)
    return {"week_key": wk, "discover_weekly": len(w_cands), "release_radar": len(r_cands)}


def refresh_all_users_discovery() -> None:
    db = None
    try:
        from app.database import SessionLocal

        db = SessionLocal()
        users = db.scalars(select(User.id)).all()
        for uid in users:
            try:
                refresh_user_discovery(db, uid)
            except Exception:
                logger.exception("discovery refresh failed for user %s", uid)
                db.rollback()
    finally:
        if db:
            db.close()
