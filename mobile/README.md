# Mix player — Android app

Native Android client for Mix player. Spotify-style mobile layout, streams when online, and can download MP3/FLAC for offline playback. Library metadata is cached so browsing still works without signal.

## Features

- Sign in with your Mix player server URL + account (public HTTPS domain or LAN)
- Optional “Trust server certificate” for self-hosted TLS quirks
- Home, Search (Songs / Artists / YouTube), Library, Profile
- Lock-screen and notification media controls
- Stream audio when online; download tracks for offline play
- Swipe a song right to add it to the queue
- Profile: server stats, offline storage, clear downloads, sign out
- App icon uses the site favicon; launcher name is **Mix Player**

## Build (CI)

GitHub Actions builds a release APK on `v*` tags and `workflow_dispatch`.

Release APKs **must** include `android.permission.INTERNET` (Flutter’s template only adds it for debug/profile). CI patches the main manifest and fails the job if the permission is missing from the built APK.

## Local build

```bash
cd mobile
flutter pub get
dart run flutter_launcher_icons
flutter create --platforms=android --org=com.mixplayer --project-name=mix_player .
# allow cleartext HTTP for LAN servers (already patched in CI):
# android/app/src/main/AndroidManifest.xml → android:usesCleartextTraffic="true"
flutter build apk --release
```

APK output: `build/app/outputs/flutter-apk/app-release.apk`
