import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';
import 'package:permission_handler/permission_handler.dart';

import 'api_client.dart';
import 'audio_handler.dart';
import 'models.dart';
import 'storage.dart';

MediaItem mediaItemFor(Track track, ApiClient api, OfflineStore offline) {
  // Prefer on-device art. Remote art URLs often need auth headers the system
  // notification loader cannot send — that breaks the shade media card on OEMs.
  Uri? artUri;
  final localArt = offline.artFile(track.id);
  if (localArt != null) {
    artUri = Uri.file(localArt.path);
  }

  return MediaItem(
    id: '${track.id}',
    album: track.album ?? 'Mix Player',
    title: track.title,
    artist: track.artist,
    duration: track.durationSeconds != null ? Duration(seconds: track.durationSeconds!) : null,
    artUri: artUri,
    playable: true,
    displayTitle: track.title,
    displaySubtitle: track.artist,
    extras: {
      'format': track.format,
      if (track.artUrl != null) 'artUrl': track.artUrl!,
    },
  );
}

class PlayerController {
  PlayerController(this.api, this.offline, this.handler);

  final ApiClient api;
  final OfflineStore offline;
  final MixAudioHandler handler;

  List<Track> queue = [];
  int index = -1;
  int? _playlistId;
  void Function()? onQueueChanged;

  AudioPlayer get player => handler.player;
  Track? get current => (index >= 0 && index < queue.length) ? queue[index] : null;

  Future<void> init() async {
    handler.player.currentIndexStream.listen((i) {
      if (i == null || i < 0 || i >= queue.length) return;
      if (index != i) {
        index = i;
        final t = current;
        if (t != null) api.recordPlay(t.id, playlistId: _playlistId);
        onQueueChanged?.call();
      }
    });
    handler.playbackState.listen((_) => onQueueChanged?.call());
  }

  Future<void> _ensureNotificationPermission() async {
    try {
      final status = await Permission.notification.status;
      if (!status.isGranted) await Permission.notification.request();
    } catch (_) {}
  }

  Future<void> _ensureLocalArt(Track track) async {
    if (offline.artFile(track.id) != null) return;
    final bytes = await api.fetchArtBytes(track.artUrl);
    if (bytes != null && bytes.isNotEmpty) {
      await offline.saveArtBytes(bytes: bytes, trackId: track.id, artUrl: track.artUrl);
    }
  }

  AudioSource _sourceFor(Track track) {
    final tag = mediaItemFor(track, api, offline);
    final local = offline.localPath(track.id);
    if (local != null) {
      return AudioSource.file(local, tag: tag);
    }
    if (!api.isConfigured) {
      throw ApiException('Track not downloaded and server is unavailable');
    }
    return AudioSource.uri(
      Uri.parse(api.streamUrl(track.id)),
      headers: Map<String, String>.from(api.authHeaders()),
      tag: tag,
    );
  }

  Future<void> playTracks(List<Track> tracks, {int startIndex = 0, int? playlistId}) async {
    if (tracks.isEmpty) return;
    await _ensureNotificationPermission();
    queue = List.of(tracks);
    index = startIndex.clamp(0, queue.length - 1);
    _playlistId = playlistId;

    // Cache art for the starting track (and a few neighbors) so the shade card
    // can show a local file:// thumbnail without auth.
    final warm = <int>{index, if (index + 1 < queue.length) index + 1, if (index > 0) index - 1};
    for (final i in warm) {
      await _ensureLocalArt(queue[i]);
    }

    final items = queue.map((t) => mediaItemFor(t, api, offline)).toList();
    final sources = queue.map(_sourceFor).toList();
    await handler.loadQueue(items: items, sources: sources, initialIndex: index);
    await handler.play();
    final t = current;
    if (t != null) api.recordPlay(t.id, playlistId: _playlistId);
    onQueueChanged?.call();
  }

  Future<void> addToQueue(Track track) async {
    await _ensureLocalArt(track);
    queue.add(track);
    if (current == null) {
      index = 0;
      await playTracks(queue, startIndex: 0, playlistId: _playlistId);
      return;
    }
    await handler.appendToQueue(mediaItemFor(track, api, offline), _sourceFor(track));
  }

  Future<void> toggle() async {
    if (player.playing) {
      await handler.pause();
    } else {
      await handler.play();
    }
    onQueueChanged?.call();
  }

  Future<void> next() async {
    await handler.skipToNext();
    onQueueChanged?.call();
  }

  Future<void> prev() async {
    await handler.skipToPrevious();
    onQueueChanged?.call();
  }

  Future<void> seek(Duration d) => handler.seek(d);

  Future<void> dispose() async {
    // AudioService owns the handler for the process lifetime.
  }
}
