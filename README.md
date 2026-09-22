# Resonance — Self-Hosted Music Platform

Spotify-style web UI, FastAPI backend, Celery download workers, and a Chrome extension for saving YouTube tracks to your library. All storage paths and host ports are configurable via `.env`.

## Quick start (server — pull images only)

No git clone and no local build. Compose pulls from GitHub Container Registry.

```bash
mkdir -p /ssd1_system/docker/spotify_clone
cd /ssd1_system/docker/spotify_clone

curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/ASB131/spotify-self-hosted-clone/main/deploy/docker-compose.yml
curl -fsSL -o .env.example \
  https://raw.githubusercontent.com/ASB131/spotify-self-hosted-clone/main/deploy/.env.example

cp .env.example .env
# Edit .env: SECRET_KEY, POSTGRES_PASSWORD, YOUR_SERVER_IP, volume paths

mkdir -p /ssd2_cache/databases/spotify_clone_postgres \
         /ssd2_cache/caches/spotify_clone/{redis,app,lidarr} \
         /ssd2_cache/spotify_clone_media
touch cookies.txt

docker compose pull
docker compose up -d
# optional Lidarr (still uses your existing qBittorrent):
# docker compose --profile arr up -d
```

Open `http://YOUR_SERVER_IP:3000` → create admin → **Setup guide**.

If `docker compose pull` fails with unauthorized, make the GHCR packages **Public** (GitHub → Packages → each image → Package settings), or `docker login ghcr.io` with a PAT that can `read:packages`.

### Volume layout (example)

| Purpose | Host path |
|---------|-----------|
| Compose + `.env` | `/ssd1_system/docker/spotify_clone` |
| Postgres | `/ssd2_cache/databases/spotify_clone_postgres` |
| Redis + app + Lidarr config | `/ssd2_cache/caches/spotify_clone/...` |
| Audio files | `/ssd2_cache/spotify_clone_media` |

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

Server deploy files (no source, no build):

- [`deploy/docker-compose.yml`](deploy/docker-compose.yml)
- [`deploy/.env.example`](deploy/.env.example)

```bash
docker compose pull
docker compose up -d
```

After the first successful CI run, open **GitHub → Packages** for each image and set visibility to **Public** so hosts can pull without logging in.

Dev/build from a full clone: use the root `docker-compose.yml` (includes `build:`) and `docker compose up -d --build`.

If CI fails with `write_package`, ensure **Settings → Actions → General → Workflow permissions** is **Read and write permissions**.

## License

MIT
