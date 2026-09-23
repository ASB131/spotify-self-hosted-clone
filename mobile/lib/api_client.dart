import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
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

  static const _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  String _baseUrl = '';
  String? _token;
  bool _allowBadCerts = false;
  http.Client _client = http.Client();

  String get baseUrl => _baseUrl;
  bool get allowBadCerts => _allowBadCerts;
  bool get isConfigured => _baseUrl.isNotEmpty && (_token?.isNotEmpty ?? false);

  Future<void> loadSaved() async {
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = prefs.getString('api_base') ?? '';
    _allowBadCerts = prefs.getBool('allow_bad_certs') ?? false;
    _rebuildClient();
    _token = prefs.getString('access_token');
    if (_token == null || _token!.isEmpty) {
      try {
        _token = await _secure.read(key: 'access_token');
      } catch (_) {}
    }
  }

  void _rebuildClient() {
    _client.close();
    final io = HttpClient();
    io.connectionTimeout = const Duration(seconds: 20);
    io.idleTimeout = const Duration(seconds: 30);
    if (_allowBadCerts) {
      io.badCertificateCallback = (cert, host, port) => true;
    }
    _client = IOClient(io);
  }

  static bool _isPrivateHost(String host) {
    final h = host.toLowerCase();
    return h == 'localhost' ||
        h == '127.0.0.1' ||
        RegExp(r'^10\.\d+\.\d+\.\d+$').hasMatch(h) ||
        RegExp(r'^192\.168\.\d+\.\d+$').hasMatch(h) ||
        RegExp(r'^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$').hasMatch(h);
  }

  /// Normalize user input into an absolute API/web origin.
  ///
  /// - Public hostnames always use https (even if the user typed http://).
  /// - Private LAN IPs default to http and, with no port, use :8010 (API).
  static String normalizeServerUrl(String raw) {
    var s = raw.trim();
    if (s.isEmpty) throw ApiException('Enter your Mix player server URL');

    // Strip common pasted suffixes.
    s = s.replaceAll(RegExp(r'/+$'), '');
    s = s.replaceAll(RegExp(r'/(login|setup|extension).*$', caseSensitive: false), '');
    s = s.replaceAll(RegExp(r'/api(/v1)?$', caseSensitive: false), '');

    if (!s.contains('://')) {
      final host = s.split('/').first.split(':').first;
      s = '${_isPrivateHost(host) ? 'http' : 'https'}://$s';
    }

    var uri = Uri.tryParse(s);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw ApiException('Invalid server URL. Example: https://music.example.com');
    }

    final private = _isPrivateHost(uri.host);

    // Public domains: never use plain http (port 80 is usually closed / wrong).
    if (!private && uri.scheme == 'http') {
      uri = uri.replace(scheme: 'https');
    }

    // LAN bare IP with no port → API publish port used by this stack.
    var port = uri.hasPort ? uri.port : null;
    if (private && port == null && (uri.scheme == 'http' || uri.scheme == 'https')) {
      port = 8010;
    }

    final portPart = port != null ? ':$port' : '';
    return '${uri.scheme}://${uri.host}$portPart';
  }

  Future<void> setServer(String url, {bool? allowBadCerts}) async {
    _baseUrl = normalizeServerUrl(url);
    if (allowBadCerts != null) {
      _allowBadCerts = allowBadCerts;
    }
    _rebuildClient();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('api_base', _baseUrl);
    await prefs.setBool('allow_bad_certs', _allowBadCerts);
  }

  Future<void> setAllowBadCerts(bool value) async {
    _allowBadCerts = value;
    _rebuildClient();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('allow_bad_certs', value);
  }

  Future<void> _persistToken(String token) async {
    _token = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('access_token', token);
    try {
      await _secure.write(key: 'access_token', value: token);
    } catch (_) {}
  }

  Future<void> login(String email, String password) async {
    if (_baseUrl.isEmpty) throw ApiException('Set your server URL first');

    Future<http.Response> doPost() => _client
        .post(
          Uri.parse('$_baseUrl/api/v1/auth/login'),
          headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
          body: jsonEncode({'email': email.trim(), 'password': password}),
        )
        .timeout(const Duration(seconds: 25));

    http.Response res;
    try {
      res = await doPost();
    } on HandshakeException catch (e) {
      if (!_allowBadCerts) {
        await setAllowBadCerts(true);
        try {
          res = await doPost();
        } on Exception catch (e2) {
          throw ApiException(_reachError(e2, sslHint: true));
        }
      } else {
        throw ApiException(_reachError(e, sslHint: true));
      }
    } on TlsException catch (e) {
      if (!_allowBadCerts) {
        await setAllowBadCerts(true);
        try {
          res = await doPost();
        } on Exception catch (e2) {
          throw ApiException(_reachError(e2, sslHint: true));
        }
      } else {
        throw ApiException(_reachError(e, sslHint: true));
      }
    } on SocketException catch (e) {
      // Android sometimes surfaces cert failures as SocketException.
      final msg = e.message.toLowerCase();
      final looksSsl = msg.contains('certificate') ||
          msg.contains('handshake') ||
          msg.contains('ssl') ||
          msg.contains('tls') ||
          msg.contains('cert_');
      if (looksSsl && !_allowBadCerts && _baseUrl.startsWith('https://')) {
        await setAllowBadCerts(true);
        try {
          res = await doPost();
        } on Exception catch (e2) {
          throw ApiException(_reachError(e2, sslHint: true));
        }
      } else {
        throw ApiException(_reachError(e));
      }
    } on TimeoutException {
      throw ApiException(
        'Timed out connecting to $_baseUrl. For LAN use http://192.168.x.x:8010 — for public use https://your-domain.',
      );
    } on http.ClientException catch (e) {
      throw ApiException(_reachError(e));
    } on Exception catch (e) {
      throw ApiException(_reachError(e));
    }

    if (res.statusCode >= 400) {
      throw ApiException(_errorMessage(res), res.statusCode);
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final token = data['access_token'] as String?;
    if (token == null || token.isEmpty) {
      throw ApiException('No access token returned');
    }
    await _persistToken(token);
  }

  String _reachError(Object e, {bool sslHint = false}) {
    final detail = e is SocketException
        ? e.message
        : e is http.ClientException
            ? e.message
            : e.toString();
    final lower = detail.toLowerCase();
    final ssl = sslHint ||
        lower.contains('certificate') ||
        lower.contains('handshake') ||
        lower.contains('ssl') ||
        lower.contains('tls');
    if (ssl) {
      return 'SSL problem talking to $_baseUrl ($detail). '
          '“Trust server certificate” was enabled — try Log in again. '
          'If it still fails, renew the HTTPS certificate on the server (Nginx Proxy Manager).';
    }
    final lanHint = _baseUrl.contains('192.168.') && !_baseUrl.contains(':8010')
        ? ' Tip: LAN API is usually http://IP:8010 (not port 80).'
        : '';
    return 'Cannot reach $_baseUrl ($detail). Check Wi‑Fi/VPN and the URL.$lanHint';
  }

  Future<void> logout() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('access_token');
    try {
      await _secure.delete(key: 'access_token');
    } catch (_) {}
  }

  Map<String, String> _headers({bool json = true}) {
    final h = <String, String>{'Accept': 'application/json'};
    if (json) h['Content-Type'] = 'application/json';
    if (_token != null && _token!.isNotEmpty) {
      h['Authorization'] = 'Bearer $_token';
    }
    return h;
  }

  Future<http.Response> _send(Future<http.Response> Function() run) async {
    try {
      return await run().timeout(const Duration(seconds: 30));
    } on SocketException catch (e) {
      throw ApiException('Cannot reach server: ${e.message}');
    } on HandshakeException catch (_) {
      throw ApiException(
        'SSL error. Enable “Trust server certificate” on the login screen, or fix HTTPS on the server.',
      );
    } on TlsException catch (_) {
      throw ApiException(
        'TLS error. Enable “Trust server certificate” on the login screen, or fix HTTPS on the server.',
      );
    } on http.ClientException catch (e) {
      throw ApiException('Network error: ${e.message}');
    } on TimeoutException {
      throw ApiException('Request timed out');
    }
  }

  Future<dynamic> _get(String path) async {
    final res = await _send(
      () => _client.get(Uri.parse('$_baseUrl$path'), headers: _headers()),
    );
    if (res.statusCode == 401) throw ApiException('Session expired', 401);
    if (res.statusCode >= 400) throw ApiException(_errorMessage(res), res.statusCode);
    if (res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }

  Future<dynamic> _post(String path, [Map<String, dynamic>? body]) async {
    final res = await _send(
      () => _client.post(
        Uri.parse('$_baseUrl$path'),
        headers: _headers(),
        body: body == null ? null : jsonEncode(body),
      ),
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

  http.Client get httpClient => _client;

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
