FROM python:3.12-slim-bookworm

# ffmpeg for audio extract; node for yt-dlp YouTube JS challenge solving
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && yt-dlp --version

COPY backend/alembic.ini .
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY extension ./extension

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
