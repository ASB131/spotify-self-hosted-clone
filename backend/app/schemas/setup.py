"""Setup and onboarding API responses."""

from pydantic import BaseModel


class ServerSetupPublic(BaseModel):
    needs_setup: bool
    youtube_cookies_ready: bool
    public_web_url: str


class UserSetupChecklist(BaseModel):
    youtube_cookies_ready: bool
    extension_cors_hint: str
