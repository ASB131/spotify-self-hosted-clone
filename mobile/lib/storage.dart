import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

/// Metadata-only cache (tracks, playlists, home). Media files are handled separately.
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
}

class OfflineStore {
  OfflineStore();

  Directory? _root;
  final Map<int, String> _index = {};

  Future<void> init() async {
    final docs = await getApplicationDocumentsDirectory();
    _root = Directory(p.join(docs.path, 'offline_tracks'));
    if (!await _root!.exists()) await _root!.create(recursive: true);
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('offline_index_v1');
    if (raw != null) {
      final map = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      map.forEach((k, v) => _index[int.parse(k)] = v as String);
    }
    // Drop index entries whose files vanished.
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

  Set<int> get downloadedIds => _index.keys.toSet();

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

  Future<String> saveDownload({
    required Track track,
    required List<int> bytes,
  }) async {
    return saveDownloadStream(track: track, stream: Stream.value(bytes));
  }

  Future<void> remove(int trackId) async {
    final path = _index.remove(trackId);
    await _persistIndex();
    if (path != null) {
      final f = File(path);
      if (await f.exists()) await f.delete();
    }
  }
}
