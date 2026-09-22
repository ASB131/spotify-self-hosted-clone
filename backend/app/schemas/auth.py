"""Pydantic request/response models."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class SetupStatus(BaseModel):
    needs_setup: bool


class BootstrapAdminRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=12, max_length=128)


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=12, max_length=128)
    invite_code: str = Field(min_length=4, max_length=64)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    display_name: str
    role: str
    storage_quota_bytes: int
    storage_used_bytes: int

    model_config = {"from_attributes": True}


class BootstrapResponse(UserPublic):
    access_token: str


class UserStats(BaseModel):
    tracks_count: int
    playlists_count: int
    storage_used_bytes: int
    storage_quota_bytes: int
    media_disk_total_bytes: int = 0
    media_disk_used_bytes: int = 0
    media_disk_free_bytes: int = 0


class TrackPublic(BaseModel):
    id: int
    title: str
    artist: str
    album: Optional[str]
    duration_seconds: Optional[int]
    format: str
    file_size_bytes: int
    source: str = "upload"
    added_via: Optional[str] = None
    art_url: Optional[str] = None
    added_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PlaylistPublic(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_liked_songs: bool
    track_count: int = 0
    cover_url: Optional[str] = None

    model_config = {"from_attributes": True}


class TrackUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=512)
    artist: Optional[str] = Field(default=None, min_length=1, max_length=512)


class PlaylistUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=256)
    description: Optional[str] = None


class DownloadRequest(BaseModel):
    url: str
    title: Optional[str] = None
    artist: Optional[str] = None
    format: str = "mp3"
    playlist_id: Optional[int] = None
    add_to_liked: bool = True
    added_via: Optional[str] = None


class UpgradeQualityRequest(BaseModel):
    track_id: int


class InviteCodeCreate(BaseModel):
    max_uses: int = Field(default=1, ge=1, le=100)
    expires_in_days: Optional[int] = Field(default=30, ge=1, le=365)


class InviteCodePublic(BaseModel):
    code: str
    max_uses: int
    uses: int
    expires_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AdminUserSummary(BaseModel):
    id: int
    email: EmailStr
    display_name: str
    role: str
    storage_used_bytes: int
    storage_quota_bytes: int
    is_active: bool

    model_config = {"from_attributes": True}


class AdminSetQuota(BaseModel):
    storage_quota_bytes: int = Field(ge=0)


class SearchResults(BaseModel):
    tracks: List[TrackPublic]
    playlists: List[PlaylistPublic]
