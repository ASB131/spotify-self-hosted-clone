# Mix player — Android app

Native Android client for Mix player. Spotify-style mobile layout, streams when online, and can download MP3/FLAC for offline playback. Library metadata is cached so browsing still works without signal.

## Features

- Sign in with your Mix player server URL + account
- Home, Search, Library, and full-screen player
- Stream audio when online (same API as the web client)
- Download tracks to the device for offline play
- Cache playlists/tracks/home metadata locally (not media files)

## Build (CI)

GitHub Actions builds a release APK on `v*` tags and `workflow_dispatch`. Artifacts are uploaded to the release (and as a workflow artifact).

## Local build

```bash
cd mobile
flutter pub get
flutter create --platforms=android --org=com.mixplayer --project-name=mix_player .
# allow cleartext HTTP for LAN servers (already patched in CI):
# android/app/src/main/AndroidManifest.xml → android:usesCleartextTraffic="true"
flutter build apk --release
```

APK output: `build/app/outputs/flutter-apk/app-release.apk`
