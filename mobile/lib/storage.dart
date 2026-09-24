import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

String _stableUrlKey(String url) {
  // FNV-1a 64-bit — stable across launches, no extra package.
  var h = 0xcbf29ce484222325;
  for (final c in url.codeUnits) {
    h ^= c;
    h = (h * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF;
  }
  return 'url_${h.toRadixString(16)}';
}

/// Metadata-only cache (tracks, playlists, home).
class MetadataCache {
  static const _kTracks = 'cache_tracks_v1';
  static const _kPlaylists = 'cache_playlists_v1';
  static const _kHome = 'cache_home_v1';
  static const _kPlaylistTracksPrefix = 'cache_playlist_tracks_';

  Future<void> saveTracks(List<Track> tracks) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kTracks, jsonEncode(tracks.map((t) => t.toJson()).toList()));
  }

  Future<List<Track>> loadTracks() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kTracks);
    if (raw == null) return [];
    final list = jsonDecode(raw) as List;
    return list.map((e) => Track.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<void> savePlaylists(List<Playlist> playlists) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kPlaylists, jsonEncode(playlists.map((p) => p.toJson()).toList()));
  }

  Future<List<Playlist>> loadPlaylists() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kPlaylists);
    if (raw == null) return [];
    final list = jsonDecode(raw) as List;
    return list.map((e) => Playlist.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<void> saveHome(HomeFeed home) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kHome, jsonEncode(home.toJson()));
  }

  Future<HomeFeed?> loadHome() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kHome);
    if (raw == null) return null;
    return HomeFeed.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
  }

  Future<void> savePlaylistTracks(int playlistId, List<Track> tracks) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$_kPlaylistTracksPrefix$playlistId',
      jsonEncode(tracks.map((t) => t.toJson()).toList()),
    );
  }

  Future<List<Track>> loadPlaylistTracks(int playlistId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_kPlaylistTracksPrefix$playlistId');
    if (raw == null) return [];
    final list = jsonDecode(raw) as List;
    return list.map((e) => Track.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  /// Rough size of metadata keys we own in SharedPreferences.
  Future<int> metadataBytesUsed() async {
    final prefs = await SharedPreferences.getInstance();
    var total = 0;
    for (final key in prefs.getKeys()) {
      if (key.startsWith('cache_') || key.startsWith(_kPlaylistTracksPrefix)) {
        final v = prefs.get(key);
        if (v is String) total += v.length;
      }
    }
    return total;
  }
}

class StorageBreakdown {
  StorageBreakdown({
    required this.mediaBytes,
    required this.thumbnailBytes,
    required this.metadataBytes,
  });

  final int mediaBytes;
  final int thumbnailBytes;
  final int metadataBytes;

  int get totalBytes => mediaBytes + thumbnailBytes + metadataBytes;
}

class OfflineStore {
  OfflineStore();

  Directory? _root;
  Directory? _artRoot;
  final Map<int, String> _index = {};
  final Map<String, Uint8List> _artMem = {};

  Future<void> init() async {
    final docs = await getApplicationDocumentsDirectory();
    _root = Directory(p.join(docs.path, 'offline_tracks'));
    _artRoot = Directory(p.join(docs.path, 'offline_art'));
    if (!await _root!.exists()) await _root!.create(recursive: true);
    if (!await _artRoot!.exists()) await _artRoot!.create(recursive: true);
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('offline_index_v1');
    if (raw != null) {
      final map = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      map.forEach((k, v) => _index[int.parse(k)] = v as String);
    }
    final missing = <int>[];
    _index.forEach((id, path) {
      if (!File(path).existsSync()) missing.add(id);
    });
    for (final id in missing) {
      _index.remove(id);
    }
    if (missing.isNotEmpty) await _persistIndex();
  }

  Future<void> _persistIndex() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'offline_index_v1',
      jsonEncode(_index.map((k, v) => MapEntry(k.toString(), v))),
    );
  }

  bool isDownloaded(int trackId) => _index.containsKey(trackId) && File(_index[trackId]!).existsSync();

  String? localPath(int trackId) {
    final path = _index[trackId];
    if (path == null) return null;
    return File(path).existsSync() ? path : null;
  }

  Set<int> get downloadedIds => {
        for (final e in _index.entries)
          if (File(e.value).existsSync()) e.key,
      };

  int get downloadedCount => downloadedIds.length;

  List<int> get downloadedIdList {
    final ids = downloadedIds.toList()..sort();
    return ids;
  }

  int? fileSizeOf(int trackId) {
    final path = localPath(trackId);
    if (path == null) return null;
    return File(path).lengthSync();
  }

  String _artKey({int? trackId, String? artUrl}) {
    if (trackId != null) return 'track_$trackId';
    if (artUrl != null && artUrl.isNotEmpty) return _stableUrlKey(artUrl);
    return '';
  }

  File? _artDiskFile(String key) {
    if (_artRoot == null || key.isEmpty) return null;
    final f = File(p.join(_artRoot!.path, '$key.jpg'));
    return f.existsSync() ? f : null;
  }

  /// Sync memory hit, then disk. Returns null if not cached yet.
  Uint8List? artBytesSync({int? trackId, String? artUrl}) {
    final key = _artKey(trackId: trackId, artUrl: artUrl);
    if (key.isEmpty) return null;
    final mem = _artMem[key];
    if (mem != null) return mem;
    final disk = _artDiskFile(key);
    if (disk == null) return null;
    try {
      final bytes = disk.readAsBytesSync();
      _artMem[key] = bytes;
      return bytes;
    } catch (_) {
      return null;
    }
  }

  Future<Uint8List?> loadArtBytes({int? trackId, String? artUrl}) async {
    final cached = artBytesSync(trackId: trackId, artUrl: artUrl);
    if (cached != null) return cached;
    return null;
  }

  Future<void> saveArtBytes({
    required Uint8List bytes,
    int? trackId,
    String? artUrl,
  }) async {
    await init();
    final key = _artKey(trackId: trackId, artUrl: artUrl);
    if (key.isEmpty) return;
    _artMem[key] = bytes;
    final f = File(p.join(_artRoot!.path, '$key.jpg'));
    await f.writeAsBytes(bytes, flush: true);
    // Also mirror track id cache when both provided.
    if (trackId != null && artUrl != null) {
      final urlKey = _artKey(artUrl: artUrl);
      if (urlKey.isNotEmpty && urlKey != key) {
        _artMem[urlKey] = bytes;
        await File(p.join(_artRoot!.path, '$urlKey.jpg')).writeAsBytes(bytes, flush: true);
      }
    }
  }

  File? artFile(int trackId) => _artDiskFile(_artKey(trackId: trackId));

  Future<int> _dirBytes(Directory? dir) async {
    if (dir == null || !await dir.exists()) return 0;
    var total = 0;
    await for (final ent in dir.list(recursive: true)) {
      if (ent is File) total += await ent.length();
    }
    return total;
  }

  Future<int> offlineBytesUsed() async {
    final b = await storageBreakdown(metadataBytes: 0);
    return b.mediaBytes + b.thumbnailBytes;
  }

  Future<StorageBreakdown> storageBreakdown({required int metadataBytes}) async {
    await init();
    return StorageBreakdown(
      mediaBytes: await _dirBytes(_root),
      thumbnailBytes: await _dirBytes(_artRoot),
      metadataBytes: metadataBytes,
    );
  }

  Future<String> saveDownloadStream({
    required Track track,
    required Stream<List<int>> stream,
  }) async {
    await init();
    final ext = track.format.toLowerCase() == 'flac' ? 'flac' : 'mp3';
    final safe = track.title.replaceAll(RegExp(r'[<>:"/\\|?*]'), '_').trim();
    final file = File(p.join(_root!.path, '${track.id}_$safe.$ext'));
    final sink = file.openWrite();
    try {
      await sink.addStream(stream);
    } finally {
      await sink.close();
    }
    _index[track.id] = file.path;
    await _persistIndex();
    return file.path;
  }

  Future<void> remove(int trackId) async {
    final path = _index.remove(trackId);
    await _persistIndex();
    if (path != null) {
      final f = File(path);
      if (await f.exists()) await f.delete();
    }
    final art = artFile(trackId);
    if (art != null && await art.exists()) await art.delete();
    _artMem.remove(_artKey(trackId: trackId));
  }

  Future<void> clearAllDownloads() async {
    await init();
    final ids = _index.keys.toList();
    for (final id in ids) {
      await remove(id);
    }
  }
}
