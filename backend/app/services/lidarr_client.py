"""Lidarr API client for on-demand album/track grabs (torrent via Lidarr's download client)."""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path
from typing import Any

import httpx

from app.services.integrations import LidarrSettings
from app.services.musicbrainz import USER_AGENT
from app.services.storage_paths import music_root

logger = logging.getLogger(__name__)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


class LidarrClient:
    def __init__(self, settings: LidarrSettings):
        self.base = settings.base_url.rstrip("/")
        self.api_key = settings.api_key
        self.configured = settings.configured

    def _headers(self) -> dict[str, str]:
        return {"X-Api-Key": self.api_key, "User-Agent": USER_AGENT}

    def health(self) -> bool:
        if not self.configured:
            return False
        try:
            with httpx.Client(timeout=10.0, headers=self._headers()) as client:
                r = client.get(f"{self.base}/api/v1/system/status")
                return r.status_code == 200
        except Exception:
            return False

    def status_detail(self) -> dict[str, Any]:
        """Health plus readiness hints for the setup UI."""
        out: dict[str, Any] = {
            "configured": self.configured,
            "reachable": False,
            "root_folders": 0,
            "quality_profiles": 0,
            "download_clients": 0,
            "base_url": self.base if self.configured else "",
            "hint": None,
        }
        if not self.configured:
            out["hint"] = "Set Lidarr URL + API key in Admin → Integrations, then start the arr profile."
            return out
        try:
            with httpx.Client(timeout=10.0, headers=self._headers()) as client:
                r = client.get(f"{self.base}/api/v1/system/status")
                out["reachable"] = r.status_code == 200
            if not out["reachable"]:
                out["hint"] = "Lidarr URL/API key saved but /api/v1/system/status failed."
                return out
            out["root_folders"] = len(self.root_folders())
            out["quality_profiles"] = len(self.quality_profiles())
            try:
                clients = self._get("/api/v1/downloadclient") or []
                out["download_clients"] = len([c for c in clients if c.get("enable")])
            except Exception:
                out["download_clients"] = 0
            if out["root_folders"] < 1:
                out["hint"] = "Add a root folder in Lidarr pointing at /music (shared with Resonance)."
            elif out["download_clients"] < 1:
                out["hint"] = "Add qBittorrent (or another torrent client) under Lidarr → Settings → Download Clients."
            else:
                out["hint"] = "Lidarr looks ready for torrent grabs."
        except Exception as exc:
            out["hint"] = f"Could not reach Lidarr: {exc}"
        return out

    def _get(self, path: str, params: dict | None = None) -> Any:
        with httpx.Client(timeout=30.0, headers=self._headers()) as client:
            r = client.get(f"{self.base}{path}", params=params)
            r.raise_for_status()
            return r.json()

    def _post(self, path: str, payload: dict) -> Any:
        with httpx.Client(timeout=45.0, headers=self._headers()) as client:
            r = client.post(f"{self.base}{path}", json=payload)
            r.raise_for_status()
            if r.content:
                return r.json()
            return None

    def root_folders(self) -> list[dict]:
        try:
            return self._get("/api/v1/rootFolder") or []
        except Exception:
            logger.exception("Lidarr rootFolder failed")
            return []

    def quality_profiles(self) -> list[dict]:
        try:
            return self._get("/api/v1/qualityprofile") or []
        except Exception:
            return []

    def metadata_profiles(self) -> list[dict]:
        try:
            return self._get("/api/v1/metadataprofile") or []
        except Exception:
            return []

    def lookup_album(self, term: str) -> list[dict]:
        try:
            return self._get("/api/v1/album/lookup", {"term": term}) or []
        except Exception:
            logger.exception("Lidarr album lookup failed")
            return []

    def trigger_album_search(self, album_ids: list[int]) -> bool:
        try:
            self._post("/api/v1/command", {"name": "AlbumSearch", "albumIds": album_ids})
            return True
        except Exception:
            logger.exception("Lidarr AlbumSearch failed")
            return False

    def ensure_album(
        self,
        *,
        release_mbid: str | None,
        artist_name: str,
        album_name: str | None,
    ) -> dict[str, Any] | None:
        """Look up and add album to Lidarr, then trigger search. Returns album info or None."""
        if not self.configured:
            return None
        roots = self.root_folders()
        profiles = self.quality_profiles()
        meta_profiles = self.metadata_profiles()
        if not roots or not profiles:
            logger.warning("Lidarr missing root folder or quality profile")
            return None
        root = roots[0]
        qid = profiles[0]["id"]
        mid = meta_profiles[0]["id"] if meta_profiles else 1

        term = f"lidarr:{release_mbid}" if release_mbid else f"{artist_name} {album_name or ''}".strip()
        results = self.lookup_album(term)
        if not results and release_mbid:
            results = self.lookup_album(f"{artist_name} {album_name or ''}".strip())
        if not results:
            return None

        album = results[0]
        if album.get("id") and album.get("monitored"):
            self.trigger_album_search([album["id"]])
            return album

        artist = album.get("artist") or {}
        if not artist.get("id"):
            artist_payload = {
                **artist,
                "qualityProfileId": qid,
                "metadataProfileId": mid,
                "rootFolderPath": root.get("path"),
                "monitored": True,
                "addOptions": {"searchForMissingAlbums": False},
            }
            try:
                artist = self._post("/api/v1/artist", artist_payload) or artist
            except Exception:
                logger.exception("Lidarr add artist failed")
                return None

        album_payload = {
            **album,
            "artistId": artist.get("id") or album.get("artistId"),
            "monitored": True,
            "qualityProfileId": qid,
            "addOptions": {"searchForNewAlbum": True},
        }
        try:
            added = self._post("/api/v1/album", album_payload) or album_payload
        except Exception:
            logger.exception("Lidarr add album failed")
            if album.get("id"):
                self.trigger_album_search([album["id"]])
                return album
            return None

        aid = added.get("id") or album.get("id")
        if aid:
            self.trigger_album_search([aid])
        return added

    def list_track_files(self, *, artist_id: int | None = None, album_id: int | None = None) -> list[dict]:
        params: dict[str, Any] = {}
        if artist_id:
            params["artistId"] = artist_id
        if album_id:
            params["albumId"] = album_id
        try:
            return self._get("/api/v1/trackFile", params) or []
        except Exception:
            logger.exception("Lidarr trackFile list failed")
            return []

    def find_matching_track_file(
        self,
        *,
        title: str,
        artist: str,
        album_id: int | None = None,
        artist_id: int | None = None,
    ) -> dict[str, Any] | None:
        files = self.list_track_files(artist_id=artist_id, album_id=album_id)
        if not files and not album_id and not artist_id:
            # Broad scan is expensive — try recent history only
            return None
        title_n = _norm(title)
        artist_n = _norm(artist.split(",")[0])
        best = None
        best_score = 0
        for f in files:
            path = f.get("path") or ""
            name = Path(path).stem
            name_n = _norm(name)
            score = 0
            if title_n and title_n in name_n:
                score += 3
            if artist_n and artist_n in _norm(path):
                score += 1
            # Prefer non-mix filenames
            if re.search(r"\b(mix|remix|mashup|bootleg|live)\b", name_n):
                score -= 2
            if score > best_score:
                best_score = score
                best = f
        return best if best_score >= 3 else None

    def wait_for_track_file(
        self,
        *,
        title: str,
        artist: str,
        album: dict[str, Any] | None,
        timeout_sec: int = 600,
        poll_sec: int = 20,
    ) -> dict[str, Any] | None:
        """Poll Lidarr until a matching track file appears (torrent finished + imported)."""
        album_id = (album or {}).get("id")
        artist_id = (album or {}).get("artistId") or ((album or {}).get("artist") or {}).get("id")
        deadline = time.time() + timeout_sec
        while time.time() < deadline:
            hit = self.find_matching_track_file(
                title=title, artist=artist, album_id=album_id, artist_id=artist_id
            )
            if hit and hit.get("path"):
                return hit
            time.sleep(poll_sec)
        return None

    def path_to_relative(self, lidarr_path: str) -> str | None:
        """
        Map a Lidarr absolute path under /music to a Resonance relative path.
        Requires Lidarr root folder = /music (same volume as MUSIC_ROOT).
        """
        raw = (lidarr_path or "").replace("\\", "/")
        root = music_root().resolve()
        # Common Lidarr container path
        for prefix in ("/music/", "/data/music/", str(root).replace("\\", "/") + "/"):
            if raw.lower().startswith(prefix.lower()):
                rel = raw[len(prefix) :].lstrip("/")
                full = (root / rel).resolve()
                if str(full).startswith(str(root)) and full.is_file():
                    return rel.replace("\\", "/")
        # Already relative under music root?
        candidate = root / raw.lstrip("/")
        if candidate.is_file() and str(candidate.resolve()).startswith(str(root)):
            return str(candidate.resolve().relative_to(root)).replace("\\", "/")
        return None
