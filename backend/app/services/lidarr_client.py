"""Lidarr API client for on-demand album grabs."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.services.integrations import LidarrSettings
from app.services.musicbrainz import USER_AGENT

logger = logging.getLogger(__name__)


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
        # Already monitored?
        if album.get("id") and album.get("monitored"):
            self.trigger_album_search([album["id"]])
            return album

        artist = album.get("artist") or {}
        foreign_artist = artist.get("foreignArtistId") or artist.get("artistType")
        # Add artist if needed
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
            # May already exist — try search by existing id
            logger.exception("Lidarr add album failed")
            if album.get("id"):
                self.trigger_album_search([album["id"]])
                return album
            return None

        aid = added.get("id") or album.get("id")
        if aid:
            self.trigger_album_search([aid])
        return added

    def find_local_track_path(self, artist: str, title: str) -> str | None:
        """Best-effort: search Lidarr track files for a matching title."""
        try:
            # Lidarr has /api/v1/track?artistId=… — without id, try wanted or history
            history = self._get("/api/v1/history", {"page": 1, "pageSize": 50, "sortKey": "date", "sortDirection": "descending"})
            records = (history or {}).get("records") or []
            title_l = title.lower()
            artist_l = artist.lower()
            for rec in records:
                src = (rec.get("sourceTitle") or "").lower()
                if title_l in src or (artist_l in src and title_l.split()[0] in src):
                    # No direct path here; caller may still fall back
                    return None
        except Exception:
            pass
        return None
