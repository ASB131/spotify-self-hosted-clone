"""Application settings loaded from environment variables."""

from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = Field(..., min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    extension_token_expire_days: int = 30
    refresh_token_expire_days: int = 14
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    music_root: str = "/music"
    app_data: str = "/app/data"
    ytdlp_cookies_path: str = "/app/cookies.txt"
    ffmpeg_path: str = "ffmpeg"
    default_audio_format: str = "mp3"

    cors_origins: str = "http://localhost:3000"

    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_redirect_uri: str = "http://localhost:8000/api/v1/spotify/callback"
    public_web_url: str = "http://localhost:3000"

    default_storage_quota_bytes: int = 10 * 1024 * 1024 * 1024
    extension_dir: str = "/app/extension"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str | List[str]) -> str:
        if isinstance(v, list):
            return ",".join(v)
        return v

    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
