import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

class ApiException implements Exception {
  ApiException(this.message, [this.statusCode]);
  final String message;
  final int? statusCode;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient();

  static const _secure = FlutterSecureStorage();
  String _baseUrl = '';
  String? _token;

  String get baseUrl => _baseUrl;
  bool get isConfigured => _baseUrl.isNotEmpty && (_token?.isNotEmpty ?? false);

  Future<void> loadSaved() async {
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = (prefs.getString('api_base') ?? '').replaceAll(RegExp(r'/$'), '');
    _token = await _secure.read(key: 'access_token');
  }

  Future<void> setServer(String url) async {
    _baseUrl = url.trim().replaceAll(RegExp(r'/$'), '');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('api_base', _baseUrl);
  }

  Future<void> login(String email, String password) async {
    if (_baseUrl.isEmpty) throw ApiException('Set your server URL first');
    final res = await http.post(
      Uri.parse('$_baseUrl/api/v1/auth/login'),
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: jsonEncode({'email': email.trim(), 'password': password}),
    );
    if (res.statusCode >= 400) {
      throw ApiException(_errorMessage(res), res.statusCode);
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    _token = data['access_token'] as String?;
    if (_token == null || _token!.isEmpty) {
      throw ApiException('No access token returned');
    }
    await _secure.write(key: 'access_token', value: _token);
  }

  Future<void> logout() async {
    _token = null;
    await _secure.delete(key: 'access_token');
  }

  Map<String, String> _headers({bool json = true}) {
    final h = <String, String>{'Accept': 'application/json'};
    if (json) h['Content-Type'] = 'application/json';
    if (_token != null && _token!.isNotEmpty) {
      h['Authorization'] = 'Bearer $_token';
    }
    return h;
  }

  Future<dynamic> _get(String path) async {
    final res = await http.get(Uri.parse('$_baseUrl$path'), headers: _headers());
    if (res.statusCode == 401) throw ApiException('Session expired', 401);
    if (res.statusCode >= 400) throw ApiException(_errorMessage(res), res.statusCode);
    if (res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }

  Future<dynamic> _post(String path, [Map<String, dynamic>? body]) async {
    final res = await http.post(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(),
      body: body == null ? null : jsonEncode(body),
    );
    if (res.statusCode == 401) throw ApiException('Session expired', 401);
    if (res.statusCode >= 400) throw ApiException(_errorMessage(res), res.statusCode);
    if (res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }

  static String _errorMessage(http.Response res) {
    try {
      final err = jsonDecode(res.body);
      final detail = err is Map ? err['detail'] : null;
      if (detail is String) return detail;
      if (detail is List && detail.isNotEmpty) {
        final first = detail.first;
        if (first is Map && first['msg'] != null) return first['msg'].toString();
      }
    } catch (_) {}
    return res.reasonPhrase ?? 'Request failed (${res.statusCode})';
  }

  String absoluteUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http')) return path;
    return '$_baseUrl$path';
  }

  Map<String, String> authHeaders() => _headers(json: false);

  String streamUrl(int trackId) => '$_baseUrl/api/v1/tracks/$trackId/stream';

  String downloadUrl(int trackId) => '$_baseUrl/api/v1/tracks/$trackId/stream?download=1';

  Future<List<Track>> listTracks() async {
    final data = await _get('/api/v1/tracks') as List<dynamic>;
    return data.map((e) => Track.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<List<Playlist>> listPlaylists() async {
    final data = await _get('/api/v1/playlists') as List<dynamic>;
    return data.map((e) => Playlist.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<List<Track>> playlistTracks(int playlistId) async {
    final data = await _get('/api/v1/playlists/$playlistId/tracks') as List<dynamic>;
    return data.map((e) => Track.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<HomeFeed> home() async {
    final data = await _get('/api/v1/home') as Map<String, dynamic>;
    return HomeFeed.fromJson(data);
  }

  Future<List<Track>> searchTracks(String q) async {
    final data = await _get('/api/v1/tracks/search?q=${Uri.encodeQueryComponent(q)}') as Map<String, dynamic>;
    final tracks = data['tracks'] as List? ?? const [];
    return tracks.map((e) => Track.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<void> recordPlay(int trackId, {int? playlistId}) async {
    try {
      await _post('/api/v1/me/plays', {
        'track_id': trackId,
        if (playlistId != null) 'playlist_id': playlistId,
      });
    } catch (_) {}
  }
}
