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


def _is_valid_root_path(path: str | None) -> bool:
    p = (path or "").strip()
    return bool(p) and "{" not in p and "}" not in p and p.startswith("/")


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
            if r.status_code >= 400:
                detail = (r.text or "")[:500]
                logger.warning("Lidarr POST %s -> %s: %s", path, r.status_code, detail)
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

    def list_artists(self) -> list[dict]:
        try:
            return self._get("/api/v1/artist") or []
        except Exception:
            return []

    def list_albums(self, *, artist_id: int | None = None) -> list[dict]:
        params: dict[str, Any] = {}
        if artist_id:
            params["artistId"] = artist_id
        try:
            return self._get("/api/v1/album", params) or []
        except Exception:
            return []

    def find_artist_by_foreign_id(self, foreign_artist_id: str | None) -> dict | None:
        if not foreign_artist_id:
            return None
        for a in self.list_artists():
            if a.get("foreignArtistId") == foreign_artist_id or str(a.get("id")) == str(foreign_artist_id):
                return a
        return None

    def find_album_by_foreign_id(self, foreign_album_id: str | None, artist_id: int | None = None) -> dict | None:
        if not foreign_album_id:
            return None
        for a in self.list_albums(artist_id=artist_id):
            if a.get("foreignAlbumId") == foreign_album_id:
                return a
        return None

    def trigger_album_search(self, album_ids: list[int]) -> bool:
        """
        Run AlbumSearch and wait briefly for the command to finish.
        Returns True if Lidarr likely queued a download (reports > 0 or queue non-empty).
        """
        try:
            cmd = self._post("/api/v1/command", {"name": "AlbumSearch", "albumIds": album_ids}) or {}
        except Exception:
            logger.exception("Lidarr AlbumSearch failed")
            return False
        cmd_id = cmd.get("id")
        message = ""
        if cmd_id:
            for _ in range(45):
                try:
                    st = self._get(f"/api/v1/command/{cmd_id}") or {}
                except Exception:
                    break
                status = (st.get("status") or "").lower()
                message = st.get("message") or ""
                if status in ("completed", "failed"):
                    break
                time.sleep(1)
        # Any active queue item for these albums?
        try:
            q = self._get("/api/v1/queue") or {}
            records = q.get("records") if isinstance(q, dict) else q
            for r in records or []:
                if r.get("albumId") in album_ids or r.get("album", {}).get("id") in album_ids:
                    return True
        except Exception:
            pass
        msg_l = message.lower()
        if "0 reports" in msg_l or "no results" in msg_l:
            logger.info("Lidarr AlbumSearch found nothing: %s", message)
            return False
        if "reports downloaded" in msg_l:
            return True
        # Unknown message — allow a short import wait
        return True

    def ensure_album(
        self,
        *,
        release_mbid: str | None,
        artist_name: str,
        album_name: str | None,
    ) -> dict[str, Any] | None:
        """
        Look up / add album in Lidarr and trigger search.
        Returns album dict with extra key `_search_queued` (bool) when search was run.
        """
        album = self._ensure_album_inner(
            release_mbid=release_mbid, artist_name=artist_name, album_name=album_name
        )
        return album

    def _ensure_album_inner(
        self,
        *,
        release_mbid: str | None,
        artist_name: str,
        album_name: str | None,
    ) -> dict[str, Any] | None:
        if not self.configured:
            return None
        roots = self.root_folders()
        profiles = self.quality_profiles()
        meta_profiles = self.metadata_profiles()
        if not roots or not profiles:
            logger.warning("Lidarr missing root folder or quality profile")
            return None
        root_path = roots[0].get("path") or "/music"
        if not _is_valid_root_path(root_path):
            logger.warning("Lidarr root path invalid: %r", root_path)
            return None
        qid = int(profiles[0]["id"])
        mid = int(meta_profiles[0]["id"]) if meta_profiles else 1

        term = f"lidarr:{release_mbid}" if release_mbid else f"{artist_name} {album_name or ''}".strip()
        results = self.lookup_album(term)
        if not results and release_mbid:
            results = self.lookup_album(f"{artist_name} {album_name or ''}".strip())
        if not results:
            return None

        album = results[0]
        # Already in library
        if album.get("id"):
            queued = self.trigger_album_search([int(album["id"])])
            album = dict(album)
            album["_search_queued"] = queued
            return album

        artist_stub = album.get("artist") or {}
        foreign_artist_id = artist_stub.get("foreignArtistId")
        artist = self.find_artist_by_foreign_id(foreign_artist_id)
        if not artist:
            artist_payload = {
                "foreignArtistId": foreign_artist_id,
                "artistName": artist_stub.get("artistName") or artist_stub.get("name") or artist_name,
                "qualityProfileId": qid,
                "metadataProfileId": mid,
                "rootFolderPath": root_path,
                "monitored": True,
                "monitorNewItems": "all",
                "addOptions": {
                    "searchForMissingAlbums": False,
                    "monitor": "all",
                },
            }
            # Keep useful metadata from lookup without bad path templates
            for key in ("overview", "artistType", "disambiguation", "links", "images", "genres"):
                if artist_stub.get(key) is not None:
                    artist_payload[key] = artist_stub[key]
            try:
                artist = self._post("/api/v1/artist", artist_payload) or {}
            except Exception:
                # Race / already exists
                artist = self.find_artist_by_foreign_id(foreign_artist_id) or {}
                if not artist.get("id"):
                    logger.exception("Lidarr add artist failed")
                    return None

        artist_id = artist.get("id") or album.get("artistId")
        foreign_album_id = album.get("foreignAlbumId")
        existing = self.find_album_by_foreign_id(foreign_album_id, artist_id=artist_id)
        if existing and existing.get("id"):
            queued = self.trigger_album_search([int(existing["id"])])
            existing = dict(existing)
            existing["_search_queued"] = queued
            return existing

        album_payload = {
            "title": album.get("title") or album_name or "Unknown",
            "foreignAlbumId": foreign_album_id,
            "artistId": artist_id,
            "monitored": True,
            "anyReleaseOk": True,
            "addOptions": {"searchForNewAlbum": True},
        }
        if album.get("releases"):
            album_payload["releases"] = album["releases"]
        if album.get("albumType"):
            album_payload["albumType"] = album["albumType"]
        if album.get("releaseDate"):
            album_payload["releaseDate"] = album["releaseDate"]

        try:
            added = self._post("/api/v1/album", album_payload) or album_payload
        except Exception:
            existing = self.find_album_by_foreign_id(foreign_album_id, artist_id=artist_id)
            if existing and existing.get("id"):
                queued = self.trigger_album_search([int(existing["id"])])
                existing = dict(existing)
                existing["_search_queued"] = queued
                return existing
            logger.exception("Lidarr add album failed")
            return None

        aid = added.get("id")
        added = dict(added)
        if aid:
            added["_search_queued"] = self.trigger_album_search([int(aid)])
        else:
            added["_search_queued"] = False
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
        for prefix in ("/music/", "/data/music/", str(root).replace("\\", "/") + "/"):
            if raw.lower().startswith(prefix.lower()):
                rel = raw[len(prefix) :].lstrip("/")
                full = (root / rel).resolve()
                if str(full).startswith(str(root)) and full.is_file():
                    return rel.replace("\\", "/")
        candidate = root / raw.lstrip("/")
        if candidate.is_file() and str(candidate.resolve()).startswith(str(root)):
            return str(candidate.resolve().relative_to(root)).replace("\\", "/")
        return None
