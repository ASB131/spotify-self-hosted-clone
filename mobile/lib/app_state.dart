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
  UserProfile? profile;
  UserStats? stats;
  int offlineBytes = 0;
  final Set<int> downloading = {};
  final Set<String> youtubeQueueing = {};

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

    tracks = await cache.loadTracks();
    playlists = await cache.loadPlaylists();
    home = await cache.loadHome();
    offlineBytes = await offline.offlineBytesUsed();
    booting = false;
    notifyListeners();

    if (api.isConfigured && online) {
      await refreshLibrary(silent: true);
      await refreshProfile(silent: true);
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
      await refreshProfile();
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
    profile = null;
    stats = null;
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
      tracks = await cache.loadTracks();
      playlists = await cache.loadPlaylists();
      home = await cache.loadHome();
      if (!silent) error = e.toString();
    } finally {
      busy = false;
      offlineBytes = await offline.offlineBytesUsed();
      notifyListeners();
    }
  }

  Future<void> refreshProfile({bool silent = false}) async {
    if (!online || !api.isConfigured) return;
    try {
      profile = await api.me();
      stats = await api.myStats();
      offlineBytes = await offline.offlineBytesUsed();
      error = null;
      notifyListeners();
    } catch (e) {
      if (!silent) {
        error = e.toString();
        notifyListeners();
      }
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

  List<ArtistHit> artistsMatching(String q) {
    final needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    final map = <String, ArtistHit>{};
    for (final t in tracks) {
      for (final part in t.artist.split(RegExp(r'\s*[,&]\s*|\s+feat\.?\s+|\s+ft\.?\s+', caseSensitive: false))) {
        final name = part.trim();
        if (name.isEmpty) continue;
        if (!name.toLowerCase().contains(needle)) continue;
        final key = name.toLowerCase();
        final prev = map[key];
        if (prev == null) {
          map[key] = ArtistHit(name: name, trackCount: 1, artUrl: t.artUrl);
        } else {
          map[key] = ArtistHit(
            name: prev.name,
            trackCount: prev.trackCount + 1,
            artUrl: prev.artUrl ?? t.artUrl,
          );
        }
      }
    }
    final list = map.values.toList()
      ..sort((a, b) => b.trackCount.compareTo(a.trackCount));
    return list;
  }

  List<Track> tracksByArtist(String name) {
    final needle = name.toLowerCase();
    return tracks.where((t) => t.artist.toLowerCase().contains(needle)).toList();
  }

  Future<List<YoutubeResult>> searchYoutube(String q) async {
    if (q.trim().length < 2) return [];
    return api.searchYoutube(q.trim());
  }

  Future<void> addYoutubeToServer(YoutubeResult item) async {
    if (youtubeQueueing.contains(item.id)) return;
    youtubeQueueing.add(item.id);
    notifyListeners();
    try {
      await api.queueYoutubeDownload(item, format: profile?.defaultAudioFormat);
    } finally {
      youtubeQueueing.remove(item.id);
      notifyListeners();
    }
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
      final art = await api.fetchArtBytes(track.artUrl);
      if (art != null && art.isNotEmpty) {
        await offline.saveArtBytes(track.id, art);
      }
      offlineBytes = await offline.offlineBytesUsed();
    } finally {
      downloading.remove(track.id);
      notifyListeners();
    }
  }

  Future<void> removeDownload(int trackId) async {
    await offline.remove(trackId);
    offlineBytes = await offline.offlineBytesUsed();
    notifyListeners();
  }

  Future<void> clearOfflineDownloads() async {
    await offline.clearAllDownloads();
    offlineBytes = 0;
    notifyListeners();
  }

  Future<void> playTrackInContext(Track track, List<Track> context, {int? playlistId}) async {
    final idx = context.indexWhere((t) => t.id == track.id);
    await player.playTracks(context, startIndex: idx >= 0 ? idx : 0, playlistId: playlistId);
    notifyListeners();
  }

  Future<void> addToQueue(Track track) async {
    await player.addToQueue(track);
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
