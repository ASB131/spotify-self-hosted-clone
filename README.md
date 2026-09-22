# Mix player

Self-hosted music library with a Spotify-style web UI, FastAPI backend, Celery download workers, and a Chrome extension for saving YouTube tracks.

**v2.0.0**

## Quick start (server: pull images only)

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
         /ssd2_cache/caches/spotify_clone/{redis,app} \
         /ssd2_cache/spotify_clone_media
touch cookies.txt

docker compose pull
docker compose up -d
```

Open `http://YOUR_SERVER_IP:3000` (or your mapped `WEB_PORT`) → create admin → **Setup guide**.

If `docker compose pull` fails with unauthorized, make the GHCR packages **Public** (GitHub → Packages → each image → Package settings), or `docker login ghcr.io` with a PAT that can `read:packages`.

### Volume layout (example)

| Purpose | Host path |
|---------|-----------|
| Compose + `.env` | `/ssd1_system/docker/spotify_clone` |
| Postgres | `/ssd2_cache/databases/spotify_clone_postgres` |
| Redis + app data | `/ssd2_cache/caches/spotify_clone/...` |
| Audio files | `/ssd2_cache/spotify_clone_media` |

## How music gets in

1. Install the Chrome extension (Profile → Download extension)
2. Extension connect → send API URL + token
3. On YouTube, click **Save to Mix player**
4. Watch progress under Downloads

Optional: admin can upload YouTube `cookies.txt` for age-restricted videos.

## Services

| Service | Default port | Purpose |
|---------|--------------|---------|
| web | 3000 | Next.js UI |
| api | 8000 | FastAPI + WebSockets |
| postgres | 5432 | Database |
| redis | 6379 | Celery / pub-sub |
| worker | (internal) | yt-dlp downloads |
| beat | (internal) | Celery beat |

## Local development

See `docker-compose.yml` at the repo root (build from source). Copy `.env.example` → `.env`, then `docker compose up --build`.

## License

See repository license file if present.
