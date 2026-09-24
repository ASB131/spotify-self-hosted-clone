import 'dart:async';

import 'package:audio_service/audio_service.dart';
import 'package:audio_session/audio_session.dart';
import 'package:just_audio/just_audio.dart';
import 'package:permission_handler/permission_handler.dart';

import 'api_client.dart';
import 'models.dart';
import 'storage.dart';

MediaItem mediaItemFor(Track track, ApiClient api, [OfflineStore? offline]) {
  Uri? artUri;
  final localArt = offline?.artFile(track.id);
  if (localArt != null) {
    artUri = Uri.file(localArt.path);
  } else {
    final art = api.absoluteUrl(track.artUrl);
    if (art.isNotEmpty) artUri = Uri.tryParse(art);
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
    displayDescription: track.formatLabel,
  );
}

class PlayerController {
  PlayerController(this.api, this.offline);

  final ApiClient api;
  final OfflineStore offline;
  final AudioPlayer player = AudioPlayer();

  List<Track> queue = [];
  int index = -1;
  int? _playlistId;
  StreamSubscription<int?>? _indexSub;
  StreamSubscription? _interruptionSub;
  StreamSubscription? _noisySub;
  bool _resumeAfterInterruption = false;
  void Function()? onQueueChanged;
  Track? get current => (index >= 0 && index < queue.length) ? queue[index] : null;

  Future<void> init() async {
    final session = await AudioSession.instance;
    await session.configure(
      const AudioSessionConfiguration(
        avAudioSessionCategory: AVAudioSessionCategory.playback,
        avAudioSessionMode: AVAudioSessionMode.defaultMode,
        androidAudioAttributes: AndroidAudioAttributes(
          contentType: AndroidAudioContentType.music,
          usage: AndroidAudioUsage.media,
        ),
        androidAudioFocusGainType: AndroidAudioFocusGainType.gain,
        androidWillPauseWhenDucked: true,
      ),
    );

    // Pause (don't duck) when Spotify / YouTube / calls take audio focus.
    _interruptionSub = session.interruptionEventStream.listen((event) async {
      if (event.begin) {
        switch (event.type) {
          case AudioInterruptionType.duck:
          case AudioInterruptionType.pause:
          case AudioInterruptionType.unknown:
            _resumeAfterInterruption = player.playing;
            if (player.playing) await player.pause();
            onQueueChanged?.call();
            break;
        }
      } else {
        if (_resumeAfterInterruption) {
          _resumeAfterInterruption = false;
        }
      }
    });

    _noisySub = session.becomingNoisyEventStream.listen((_) async {
      if (player.playing) await player.pause();
      onQueueChanged?.call();
    });

    _indexSub = player.currentIndexStream.listen((i) {
      if (i == null || i < 0 || i >= queue.length) return;
      if (index != i) {
        index = i;
        final t = current;
        if (t != null) {
          api.recordPlay(t.id, playlistId: _playlistId);
        }
        onQueueChanged?.call();
      }
    });
  }

  Future<void> _ensureNotificationPermission() async {
    try {
      final status = await Permission.notification.status;
      if (!status.isGranted) {
        await Permission.notification.request();
      }
    } catch (_) {}
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

    // ExoPlayer URI sources are required for a working Samsung/One UI media card
    // (live seek position + play/pause icon). Custom Dart StreamAudioSource only
    // half-registers a MediaSession (shows under Media output, seek stuck at 0).
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
    final sources = queue.map(_sourceFor).toList();
    await player.setAudioSource(
      ConcatenatingAudioSource(
        children: sources,
        useLazyPreparation: true,
      ),
      initialIndex: index,
      initialPosition: Duration.zero,
    );
    await player.play();
    final t = current;
    if (t != null) api.recordPlay(t.id, playlistId: _playlistId);
    onQueueChanged?.call();
  }

  Future<void> addToQueue(Track track) async {
    queue.add(track);
    if (current == null) {
      index = 0;
      await playTracks(queue, startIndex: 0, playlistId: _playlistId);
      return;
    }
    final concat = player.audioSource;
    if (concat is ConcatenatingAudioSource) {
      await concat.add(_sourceFor(track));
    }
  }

  Future<void> toggle() async {
    if (player.playing) {
      await player.pause();
    } else {
      await player.play();
    }
    onQueueChanged?.call();
  }

  Future<void> next() async {
    if (queue.isEmpty) return;
    if (player.hasNext) {
      await player.seekToNext();
    } else {
      await player.seek(Duration.zero, index: 0);
    }
    await player.play();
    onQueueChanged?.call();
  }

  Future<void> prev() async {
    if (queue.isEmpty) return;
    if (player.position.inSeconds > 3) {
      await player.seek(Duration.zero);
      return;
    }
    if (player.hasPrevious) {
      await player.seekToPrevious();
    } else {
      await player.seek(Duration.zero, index: queue.length - 1);
    }
    await player.play();
    onQueueChanged?.call();
  }

  Future<void> seek(Duration d) => player.seek(d);

  Future<void> dispose() async {
    await _indexSub?.cancel();
    await _interruptionSub?.cancel();
    await _noisySub?.cancel();
    await player.dispose();
  }
}
