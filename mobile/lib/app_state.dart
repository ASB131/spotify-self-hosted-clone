import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'api_client.dart';
import 'models.dart';
import 'player_controller.dart';
import 'storage.dart';

class AppState extends ChangeNotifier {
  AppState() {
    _bootstrap();
  }

  final api = ApiClient();
  final cache = MetadataCache();
  final offline = OfflineStore();
  late final PlayerController player = PlayerController(api, offline);

  bool booting = true;
  bool online = true;
  bool busy = false;
  String? error;

  List<Track> tracks = [];
  List<Playlist> playlists = [];
  HomeFeed? home;
  final Set<int> downloading = {};

  StreamSubscription? _connSub;

  Future<void> _bootstrap() async {
    await api.loadSaved();
    await offline.init();
    await player.init();
    _connSub = Connectivity().onConnectivityChanged.listen((results) {
      final offlineNow = results.every((r) => r == ConnectivityResult.none);
      online = !offlineNow;
      notifyListeners();
    });
    final initial = await Connectivity().checkConnectivity();
    online = !initial.every((r) => r == ConnectivityResult.none);

    // Always hydrate from cache first for instant UI / offline.
    tracks = await cache.loadTracks();
    playlists = await cache.loadPlaylists();
    home = await cache.loadHome();
    booting = false;
    notifyListeners();

    if (api.isConfigured && online) {
      await refreshLibrary(silent: true);
    }
  }

  bool get isLoggedIn => api.isConfigured;

  Future<void> login({
    required String serverUrl,
    required String email,
    required String password,
    bool allowBadCerts = false,
  }) async {
    error = null;
    busy = true;
    notifyListeners();
    try {
      await api.setServer(serverUrl, allowBadCerts: allowBadCerts);
      await api.login(email, password);
      await refreshLibrary();
    } catch (e) {
      error = e.toString();
      rethrow;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await api.logout();
    notifyListeners();
  }

  Future<void> refreshLibrary({bool silent = false}) async {
    if (!silent) {
      busy = true;
      notifyListeners();
    }
    try {
      if (!online) {
        tracks = await cache.loadTracks();
        playlists = await cache.loadPlaylists();
        home = await cache.loadHome();
        return;
      }
      final t = await api.listTracks();
      final p = await api.listPlaylists();
      final h = await api.home();
      tracks = t;
      playlists = p;
      home = h;
      await cache.saveTracks(t);
      await cache.savePlaylists(p);
      await cache.saveHome(h);
      error = null;
    } catch (e) {
      // Fall back to cache.
      tracks = await cache.loadTracks();
      playlists = await cache.loadPlaylists();
      home = await cache.loadHome();
      if (!silent) error = e.toString();
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<List<Track>> loadPlaylistTracks(int playlistId) async {
    try {
      if (online && api.isConfigured) {
        final list = await api.playlistTracks(playlistId);
        await cache.savePlaylistTracks(playlistId, list);
        return list;
      }
    } catch (_) {}
    return cache.loadPlaylistTracks(playlistId);
  }

  Future<List<Track>> search(String q) async {
    if (q.trim().length < 2) return [];
    if (online && api.isConfigured) {
      try {
        return await api.searchTracks(q.trim());
      } catch (_) {}
    }
    final needle = q.trim().toLowerCase();
    return tracks
        .where(
          (t) =>
              t.title.toLowerCase().contains(needle) ||
              t.artist.toLowerCase().contains(needle) ||
              (t.album?.toLowerCase().contains(needle) ?? false),
        )
        .toList();
  }

  bool isDownloaded(int trackId) => offline.isDownloaded(trackId);

  Future<void> downloadTrack(Track track) async {
    if (downloading.contains(track.id) || offline.isDownloaded(track.id)) return;
    if (!online || !api.isConfigured) {
      throw ApiException('Need a network connection to download');
    }
    downloading.add(track.id);
    notifyListeners();
    try {
      final req = http.Request('GET', Uri.parse(api.downloadUrl(track.id)));
      req.headers.addAll(api.authHeaders());
      final streamed = await api.httpClient.send(req).timeout(const Duration(minutes: 30));
      if (streamed.statusCode >= 400) {
        throw ApiException('Download failed (${streamed.statusCode})');
      }
      await offline.saveDownloadStream(track: track, stream: streamed.stream);
    } finally {
      downloading.remove(track.id);
      notifyListeners();
    }
  }

  Future<void> removeDownload(int trackId) async {
    await offline.remove(trackId);
    notifyListeners();
  }

  Future<void> playTrackInContext(Track track, List<Track> context, {int? playlistId}) async {
    final idx = context.indexWhere((t) => t.id == track.id);
    await player.playTracks(context, startIndex: idx >= 0 ? idx : 0, playlistId: playlistId);
    notifyListeners();
  }

  void refreshUi() => notifyListeners();

  @override
  void dispose() {
    _connSub?.cancel();
    player.dispose();
    super.dispose();
  }
}
