# Resonance — Self-Hosted Music Platform

Spotify-style web UI, FastAPI backend, Celery download workers, and a Chrome extension for saving YouTube tracks to your library. All storage paths and host ports are configurable via `.env`.

## Quick start

1. Copy `.env.example` to `.env` and set at least `SECRET_KEY` (32+ chars) and `POSTGRES_PASSWORD`.
2. Optionally set volume paths (`POSTGRES_DATA`, `REDIS_DATA`, `MUSIC_VOLUME`, `APP_DATA`) to different drives.
3. For YouTube reliability, export cookies to `cookies.txt` (see `cookies.txt.example`).
4. Run:

```bash
docker compose up -d --build
```

5. Open `http://localhost:3000` (or your `WEB_PORT`) and complete **Admin setup**.
6. Create invite codes in **Admin** for additional users.

## Services

| Service | Default port | Purpose |
|---------|--------------|---------|
| web | 3000 | Next.js UI |
| api | 8000 | FastAPI + WebSockets |
| postgres | 5432 | Database (`pg_trgm` search) |
| redis | 6379 | Celery broker |
| worker | — | yt-dlp / Spotify sync / FLAC upgrade |
| beat | — | Hourly Spotify sync schedule |

## Configuration

All bind ports and host directories are driven by environment variables in `.env` — nothing is hard-coded to specific drives.

- `MUSIC_VOLUME` — global deduplicated audio library (`/music` in containers)
- `CORS_ORIGINS` — include your web origin and `chrome-extension://<extension-id>`
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — optional Spotify liked-songs sync

## Extension

Load `extension/` as an unpacked extension in Chrome. Set API URL and JWT in extension options. Add your extension origin to `CORS_ORIGINS`.

## Security

- Bcrypt password hashing, JWT in HTTP-only cookies (web) + Bearer header (extension)
- Invite-only registration after bootstrap admin
- Rate limiting middleware (SlowAPI) on the API
- Per-user storage quotas enforced on download

## Pre-built images

GitHub Actions publishes:

- `ghcr.io/asb131/spotify-self-hosted-clone-api:main`
- `ghcr.io/asb131/spotify-self-hosted-clone-web:main`

`docker-compose.yml` uses these by default (`IMAGE_TAG`, `API_IMAGE`, `WEB_IMAGE` in `.env`). Run:

```bash
docker compose pull
docker compose up -d
```

After the first successful CI run, open **GitHub → Packages** for each image and set visibility to **Public** so hosts can pull without logging in.

To build locally instead of pulling, clear the image variables in `.env` (`API_IMAGE=` and `WEB_IMAGE=`) and run `docker compose up -d --build`.

If CI fails with `write_package`, ensure **Settings → Actions → General → Workflow permissions** is **Read and write permissions**.

## License

MIT
