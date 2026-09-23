import 'package:audio_session/audio_session.dart';
import 'package:http/http.dart' as http;
import 'package:just_audio/just_audio.dart';

import 'api_client.dart';
import 'models.dart';
import 'storage.dart';

/// Streams through Dart's HttpClient so "Trust server certificate" applies to playback too.
class AuthedRemoteSource extends StreamAudioSource {
  AuthedRemoteSource(this.api, this.trackId) : super(tag: 'track-$trackId');

  final ApiClient api;
  final int trackId;

  @override
  Future<StreamAudioResponse> request([int? start, int? end]) async {
    final headers = Map<String, String>.from(api.authHeaders());
    if (start != null || end != null) {
      headers['range'] = 'bytes=${start ?? 0}-${end ?? ''}';
    }
    final req = http.Request('GET', Uri.parse(api.streamUrl(trackId)));
    req.headers.addAll(headers);
    final res = await api.httpClient.send(req);
    if (res.statusCode >= 400) {
      throw ApiException('Stream failed (${res.statusCode})', res.statusCode);
    }

    final contentLength = res.contentLength;
    int? sourceLength = contentLength;
    int offset = start ?? 0;

    final cr = res.headers['content-range'];
    if (cr != null) {
      // bytes start-end/total
      final m = RegExp(r'bytes\s+(\d+)-(\d+)/(\d+|\*)').firstMatch(cr);
      if (m != null) {
        offset = int.parse(m.group(1)!);
        if (m.group(3) != '*') sourceLength = int.parse(m.group(3)!);
      }
    }

    return StreamAudioResponse(
      sourceLength: sourceLength,
      contentLength: contentLength,
      offset: offset,
      stream: res.stream,
      contentType: res.headers['content-type'] ?? 'audio/mpeg',
    );
  }
}

class PlayerController {
  PlayerController(this.api, this.offline);

  final ApiClient api;
  final OfflineStore offline;
  final AudioPlayer player = AudioPlayer();

  List<Track> queue = [];
  int index = -1;
  Track? get current => (index >= 0 && index < queue.length) ? queue[index] : null;

  Future<void> init() async {
    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration.music());
    player.processingStateStream.listen((state) {
      if (state == ProcessingState.completed) {
        next();
      }
    });
  }

  Future<void> playTracks(List<Track> tracks, {int startIndex = 0, int? playlistId}) async {
    if (tracks.isEmpty) return;
    queue = List.of(tracks);
    index = startIndex.clamp(0, queue.length - 1);
    await _loadCurrent(playlistId: playlistId);
    await player.play();
  }

  Future<void> _loadCurrent({int? playlistId}) async {
    final track = current;
    if (track == null) return;
    final local = offline.localPath(track.id);
    if (local != null) {
      await player.setAudioSource(AudioSource.file(local));
    } else {
      if (!api.isConfigured) {
        throw ApiException('Track not downloaded and server is unavailable');
      }
      // Always use Dart HTTP path so public HTTPS + trust-cert works for everyone.
      await player.setAudioSource(AuthedRemoteSource(api, track.id));
    }
    api.recordPlay(track.id, playlistId: playlistId);
  }

  Future<void> toggle() async {
    if (player.playing) {
      await player.pause();
    } else {
      await player.play();
    }
  }

  Future<void> next() async {
    if (queue.isEmpty) return;
    if (index >= queue.length - 1) {
      index = 0;
    } else {
      index += 1;
    }
    await _loadCurrent();
    await player.play();
  }

  Future<void> prev() async {
    if (queue.isEmpty) return;
    if (player.position.inSeconds > 3) {
      await player.seek(Duration.zero);
      return;
    }
    if (index <= 0) {
      index = queue.length - 1;
    } else {
      index -= 1;
    }
    await _loadCurrent();
    await player.play();
  }

  Future<void> seek(Duration d) => player.seek(d);

  Future<void> dispose() async {
    await player.dispose();
  }
}
