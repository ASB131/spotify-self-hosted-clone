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

### Admin setup vs login

- **First visit:** If no user exists in the database, you are sent to **`/setup`** to create the admin account.
- **Already configured:** If you ran setup before (Postgres data still on disk), you will see **Login** instead. Use the admin email/password you created earlier.
- **Run setup again:** Stop the stack and remove the database volume, then start fresh:

```bash
docker compose down
# Remove Postgres data (Windows example path from .env)
rm -rf ./data/postgres
docker compose up -d
```

## Do I need Lidarr / qBittorrent?

**Optional, but recommended for Discover Weekly / Release Radar / catalog downloads.**

Lidarr is a **separate .NET application** ([Lidarr/Lidarr](https://github.com/Lidarr/Lidarr)) — it cannot be compiled into Resonance. Resonance talks to it over HTTP (API key).

**qBittorrent is not packaged here.** Use the BitTorrent client you already run. Wire it in Lidarr → Settings → Download Clients.

Optional Lidarr container (same compose project):

```bash
docker compose --profile arr up -d
```

Then:

1. Open Lidarr (`http://<host>:8686`) → root folder **`/music`** (same volume as `MUSIC_VOLUME`)
2. Download Clients → your existing **qBittorrent** (host IP or `host.docker.internal`, WebUI port, category `lidarr`)
3. Add torrent indexers
4. Admin → Integrations → Lidarr URL (`http://lidarr:8686` from other containers) + API key

When Lidarr is healthy, discovery/catalog downloads use **Lidarr only** (no YouTube mixes). YouTube remains for the extension and when Lidarr is off.

### Linux multi-drive layout (example)

Clone compose into the SSD1 docker tree, point volumes at cache/media drives in `.env`:

```bash
# /ssd1_system/docker/spotify_clone/.env (excerpt)
POSTGRES_DATA=/ssd2_cache/databases/spotify_clone_postgres
REDIS_DATA=/ssd2_cache/caches/spotify_clone/redis
APP_DATA=/ssd2_cache/caches/spotify_clone/app
MUSIC_VOLUME=/ssd2_cache/spotify_clone_media
LIDARR_CONFIG=/ssd2_cache/caches/spotify_clone/lidarr
```

Then `docker compose up -d --build` (or pull `IMAGE_TAG=main` images) and open the web UI — first visit runs **Admin setup**, then use **Setup guide** for Lidarr / cookies / Spotify.

Catalog search uses **MusicBrainz**. **ListenBrainz** powers discovery recommendations (fresh releases / tags).

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

Use **Profile → Add Chrome extension** in the web app to download a zip and open install steps. Chrome requires a one-time **Load unpacked** in `chrome://extensions` (Developer mode)—websites cannot install extensions silently without the Chrome Web Store.

Set API URL and JWT in extension options. Add your extension origin to `CORS_ORIGINS`.

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
