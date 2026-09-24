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
    player = PlayerController(api, offline);
    player.onQueueChanged = refreshUi;
    _bootstrap();
  }

  final api = ApiClient();
  final cache = MetadataCache();
  final offline = OfflineStore();
  late final PlayerController player;

  bool booting = true;
  /// Device has some network interface (Wi‑Fi/cellular).
  bool online = true;
  /// Mix player server answered a lightweight ping.
  bool serverReachable = false;
  /// UI shows only downloaded media (launch without server, or lost connection).
  bool offlineMode = false;
  bool busy = false;
  String? error;

  List<Track> _allTracks = [];
  List<Playlist> _allPlaylists = [];
  HomeFeed? _home;
  Set<int> playlistsWithDownloads = {};
  UserProfile? profile;
  UserStats? stats;
  StorageBreakdown storage = StorageBreakdown(mediaBytes: 0, thumbnailBytes: 0, metadataBytes: 0);
  final Set<int> downloading = {};
  final Set<String> youtubeQueueing = {};

  StreamSubscription? _connSub;
  Timer? _reconnectTimer;
  bool _preloadingArt = false;

  List<Track> get tracks => offlineMode ? downloadedTracks() : _allTracks;

  List<Playlist> get playlists {
    if (!offlineMode) return _allPlaylists;
    return _allPlaylists.where((p) => playlistsWithDownloads.contains(p.id)).toList();
  }

  HomeFeed? get home {
    final h = _home;
    if (h == null || !offlineMode) return h;
    final recent = h.recentTracks.where((t) => offline.isDownloaded(t.id)).toList();
    final pls = h.recentPlaylists.where((p) => playlistsWithDownloads.contains(p.id)).toList();
    Playlist? allSongs = h.allSongs;
    if (allSongs != null && !playlistsWithDownloads.contains(allSongs.id)) {
      // Synthesize an "Downloaded" entry when we have offline tracks but no cached membership.
      if (offline.downloadedCount > 0) {
        allSongs = Playlist(
          id: allSongs.id,
          name: '${allSongs.name} (offline)',
          isLikedSongs: allSongs.isLikedSongs,
          trackCount: offline.downloadedCount,
          coverUrl: allSongs.coverUrl,
        );
      } else {
        allSongs = null;
      }
    }
    return HomeFeed(allSongs: allSongs, recentTracks: recent, recentPlaylists: pls);
  }

  int get offlineBytes => storage.totalBytes;

  Future<void> _bootstrap() async {
    await api.loadSaved();
    await offline.init();
    await player.init();

    _allTracks = await cache.loadTracks();
    _allPlaylists = await cache.loadPlaylists();
    _home = await cache.loadHome();
    await _refreshStorage();
    await _recomputePlaylistsWithDownloads();

    _connSub = Connectivity().onConnectivityChanged.listen((results) {
      final hasNet = !results.every((r) => r == ConnectivityResult.none);
      online = hasNet;
      notifyListeners();
      if (hasNet) {
        unawaited(_probeAndMaybeGoOnline());
      } else {
        _enterOfflineMode();
      }
    });
    final initial = await Connectivity().checkConnectivity();
    online = !initial.every((r) => r == ConnectivityResult.none);

    booting = false;
    notifyListeners();

    if (!api.isConfigured) return;

    if (!online) {
      _enterOfflineMode();
      _startReconnectLoop();
      return;
    }

    final reachable = await api.ping();
    serverReachable = reachable;
    if (!reachable) {
      _enterOfflineMode();
      _startReconnectLoop();
      return;
    }

    offlineMode = false;
    await refreshLibrary(silent: true);
    await refreshProfile(silent: true);
    _startReconnectLoop();
  }

  void _enterOfflineMode() {
    if (offlineMode && !serverReachable) return;
    offlineMode = true;
    serverReachable = false;
    notifyListeners();
  }

  void _startReconnectLoop() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer.periodic(const Duration(seconds: 12), (_) {
      unawaited(_probeAndMaybeGoOnline());
    });
  }

  Future<void> _probeAndMaybeGoOnline() async {
    if (!api.isConfigured) return;
    final ok = await api.ping();
    if (!ok) {
      if (!offlineMode) {
        serverReachable = false;
        offlineMode = true;
        notifyListeners();
      }
      return;
    }
    final wasOffline = offlineMode || !serverReachable;
    serverReachable = true;
    online = true;
    if (wasOffline) {
      offlineMode = false;
      notifyListeners();
      await refreshLibrary(silent: true);
      await refreshProfile(silent: true);
    }
  }

  Future<void> _refreshStorage() async {
    final meta = await cache.metadataBytesUsed();
    storage = await offline.storageBreakdown(metadataBytes: meta);
  }

  Future<void> _recomputePlaylistsWithDownloads() async {
    final ids = <int>{};
    for (final p in _allPlaylists) {
      final list = await cache.loadPlaylistTracks(p.id);
      if (list.any((t) => offline.isDownloaded(t.id))) {
        ids.add(p.id);
      }
    }
    final homeAll = _home?.allSongs;
    if (homeAll != null && offline.downloadedCount > 0) {
      // All-songs always useful offline when we have downloads.
      ids.add(homeAll.id);
    }
    playlistsWithDownloads = ids;
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
      serverReachable = true;
      offlineMode = false;
      online = true;
      await refreshLibrary();
      await refreshProfile();
      _startReconnectLoop();
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
      if (offlineMode || !online || !serverReachable) {
        _allTracks = await cache.loadTracks();
        _allPlaylists = await cache.loadPlaylists();
        _home = await cache.loadHome();
        await _recomputePlaylistsWithDownloads();
        return;
      }
      final t = await api.listTracks();
      final p = await api.listPlaylists();
      final h = await api.home();
      _allTracks = t;
      _allPlaylists = p;
      _home = h;
      await cache.saveTracks(t);
      await cache.savePlaylists(p);
      await cache.saveHome(h);
      // Warm playlist membership for offline filtering (bounded).
      unawaited(_warmPlaylistCaches(p.take(40).toList()));
      error = null;
      unawaited(_preloadArt());
    } catch (e) {
      _allTracks = await cache.loadTracks();
      _allPlaylists = await cache.loadPlaylists();
      _home = await cache.loadHome();
      await _recomputePlaylistsWithDownloads();
      _enterOfflineMode();
      if (!silent) error = e.toString();
    } finally {
      busy = false;
      await _refreshStorage();
      notifyListeners();
    }
  }

  Future<void> _warmPlaylistCaches(List<Playlist> list) async {
    for (final p in list) {
      try {
        final tracks = await api.playlistTracks(p.id);
        await cache.savePlaylistTracks(p.id, tracks);
      } catch (_) {}
    }
    await _recomputePlaylistsWithDownloads();
    notifyListeners();
  }

  Future<void> _preloadArt() async {
    if (_preloadingArt) return;
    _preloadingArt = true;
    try {
      final targets = <Track>[
        ..._allTracks.take(80),
        ...?_home?.recentTracks.take(20),
      ];
      final seen = <int>{};
      for (final t in targets) {
        if (!seen.add(t.id)) continue;
        if (offline.artBytesSync(trackId: t.id, artUrl: t.artUrl) != null) continue;
        final bytes = await api.fetchArtBytes(t.artUrl);
        if (bytes != null && bytes.isNotEmpty) {
          await offline.saveArtBytes(bytes: bytes, trackId: t.id, artUrl: t.artUrl);
        }
      }
      for (final p in _allPlaylists.take(30)) {
        final url = p.coverUrl;
        if (url == null || url.isEmpty) continue;
        if (offline.artBytesSync(artUrl: url) != null) continue;
        final bytes = await api.fetchArtBytes(url);
        if (bytes != null && bytes.isNotEmpty) {
          await offline.saveArtBytes(bytes: bytes, artUrl: url);
        }
      }
      await _refreshStorage();
      notifyListeners();
    } finally {
      _preloadingArt = false;
    }
  }

  Future<void> refreshProfile({bool silent = false}) async {
    if (offlineMode || !online || !api.isConfigured) {
      await _refreshStorage();
      notifyListeners();
      return;
    }
    try {
      profile = await api.me();
      stats = await api.myStats();
      await _refreshStorage();
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
      if (!offlineMode && online && api.isConfigured && serverReachable) {
        final list = await api.playlistTracks(playlistId);
        await cache.savePlaylistTracks(playlistId, list);
        await _recomputePlaylistsWithDownloads();
        if (offlineMode) {
          return list.where((t) => offline.isDownloaded(t.id)).toList();
        }
        return list;
      }
    } catch (_) {}
    final cached = await cache.loadPlaylistTracks(playlistId);
    if (offlineMode) {
      return cached.where((t) => offline.isDownloaded(t.id)).toList();
    }
    return cached;
  }

  Future<List<Track>> search(String q) async {
    if (q.trim().length < 2) return [];
    if (!offlineMode && online && api.isConfigured && serverReachable) {
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
    if (offlineMode || !api.isConfigured) {
      throw ApiException('YouTube search needs a server connection');
    }
    return api.searchYoutube(q.trim());
  }

  Future<void> addYoutubeToServer(YoutubeResult item, {required String format}) async {
    final key = '${item.id}:$format';
    if (youtubeQueueing.contains(key) || youtubeQueueing.contains(item.id)) return;
    youtubeQueueing.add(key);
    youtubeQueueing.add(item.id);
    notifyListeners();
    try {
      await api.queueYoutubeDownload(item, format: format);
    } finally {
      youtubeQueueing.remove(key);
      youtubeQueueing.remove(item.id);
      notifyListeners();
    }
  }

  bool isDownloaded(int trackId) => offline.isDownloaded(trackId);

  List<Track> downloadedTracks() {
    final ids = offline.downloadedIds;
    final byId = {for (final t in _allTracks) t.id: t};
    final out = <Track>[];
    for (final id in ids) {
      final t = byId[id];
      if (t != null) {
        out.add(t);
      } else {
        out.add(
          Track(
            id: id,
            title: 'Track $id',
            artist: 'Downloaded',
            format: (offline.localPath(id) ?? '').endsWith('.flac') ? 'flac' : 'mp3',
            fileSizeBytes: offline.fileSizeOf(id) ?? 0,
          ),
        );
      }
    }
    out.sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
    return out;
  }

  Future<void> downloadTrack(Track track) async {
    if (downloading.contains(track.id) || offline.isDownloaded(track.id)) return;
    if (offlineMode || !online || !api.isConfigured) {
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
        await offline.saveArtBytes(bytes: art, trackId: track.id, artUrl: track.artUrl);
      }
      await _recomputePlaylistsWithDownloads();
      await _refreshStorage();
    } finally {
      downloading.remove(track.id);
      notifyListeners();
    }
  }

  Future<void> removeDownload(int trackId) async {
    await offline.remove(trackId);
    await _recomputePlaylistsWithDownloads();
    await _refreshStorage();
    notifyListeners();
  }

  Future<void> clearOfflineDownloads() async {
    await offline.clearAllDownloads();
    playlistsWithDownloads = {};
    await _refreshStorage();
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
    _reconnectTimer?.cancel();
    player.dispose();
    super.dispose();
  }
}
