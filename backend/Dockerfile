FROM python:3.12-slim-bookworm

# ffmpeg for audio extract; deno for yt-dlp YouTube EJS challenge solving
# (Node from Debian is too old; yt-dlp requires Node >= 22 or Deno >= 2.3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    unzip \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
    && deno --version \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && yt-dlp --version \
    && python -c "import importlib.util; assert importlib.util.find_spec('yt_dlp_ejs'), 'yt-dlp-ejs missing'"

COPY backend/alembic.ini .
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY extension ./extension

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
# Ensure deno is on PATH for celery workers
ENV PATH="/usr/local/bin:${PATH}"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
