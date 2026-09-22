"""Setup and onboarding API responses."""

from pydantic import BaseModel


class ServerSetupPublic(BaseModel):
    needs_setup: bool
    spotify_server_configured: bool
    youtube_cookies_ready: bool
    spotify_redirect_uri: str
    public_web_url: str


class UserSetupChecklist(BaseModel):
    spotify_server_configured: bool
    spotify_account_linked: bool
    spotify_redirect_uri: str
    extension_cors_hint: str
