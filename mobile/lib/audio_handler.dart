import 'dart:async';

import 'package:audio_service/audio_service.dart';
import 'package:audio_session/audio_session.dart';
import 'package:just_audio/just_audio.dart';

/// Background audio + MediaStyle notification / Samsung shade media card.
///
/// just_audio_background was only half-wiring MediaSession on One UI (visible
/// under Media output, seek stuck at 0:00, play icon never toggling, no QS card).
/// This handler owns PlaybackState broadcasts explicitly.
class MixAudioHandler extends BaseAudioHandler with QueueHandler, SeekHandler {
  MixAudioHandler() {
    _init();
  }

  final AudioPlayer _player = AudioPlayer();
  final _subs = <StreamSubscription>[];

  AudioPlayer get player => _player;

  Future<void> _init() async {
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

    _subs.add(session.interruptionEventStream.listen((event) async {
      if (event.begin) {
        if (_player.playing) await _player.pause();
      }
    }));
    _subs.add(session.becomingNoisyEventStream.listen((_) async {
      if (_player.playing) await _player.pause();
    }));

    // Keep MediaSession PlaybackState in sync — this is what drives the seek
    // bar position and play/pause glyph on Samsung / Android 13+.
    _subs.add(_player.playbackEventStream.listen((_) => _broadcastState()));
    _subs.add(_player.playingStream.listen((_) => _broadcastState()));
    _subs.add(_player.processingStateStream.listen((state) {
      _broadcastState();
      if (state == ProcessingState.completed) {
        skipToNext();
      }
    }));
    _subs.add(
      _player.createPositionStream(
        steps: 800,
        minPeriod: const Duration(milliseconds: 500),
        maxPeriod: const Duration(seconds: 1),
      ).listen((_) => _broadcastState()),
    );

    _subs.add(_player.durationStream.listen((duration) {
      final item = mediaItem.value;
      if (item != null && duration != null && item.duration != duration) {
        mediaItem.add(item.copyWith(duration: duration));
      }
    }));

    _subs.add(_player.currentIndexStream.listen((index) {
      final items = queue.value;
      if (index == null || index < 0 || index >= items.length) return;
      mediaItem.add(items[index]);
      _broadcastState();
    }));

    _broadcastState();
  }

  void _broadcastState() {
    final playing = _player.playing;
    final processing = switch (_player.processingState) {
      ProcessingState.idle => AudioProcessingState.idle,
      ProcessingState.loading => AudioProcessingState.loading,
      ProcessingState.buffering => AudioProcessingState.buffering,
      ProcessingState.ready => AudioProcessingState.ready,
      ProcessingState.completed => AudioProcessingState.completed,
    };

    playbackState.add(
      PlaybackState(
        controls: [
          MediaControl.skipToPrevious,
          if (playing) MediaControl.pause else MediaControl.play,
          MediaControl.skipToNext,
        ],
        systemActions: const {
          MediaAction.seek,
          MediaAction.seekForward,
          MediaAction.seekBackward,
          MediaAction.skipToPrevious,
          MediaAction.skipToNext,
          MediaAction.play,
          MediaAction.pause,
          MediaAction.stop,
        },
        androidCompactActionIndices: const [0, 1, 2],
        processingState: processing,
        playing: playing,
        updatePosition: _player.position,
        bufferedPosition: _player.bufferedPosition,
        speed: _player.speed,
        queueIndex: _player.currentIndex,
        updateTime: DateTime.now(),
      ),
    );
  }

  Future<void> loadQueue({
    required List<MediaItem> items,
    required List<AudioSource> sources,
    int initialIndex = 0,
  }) async {
    if (items.isEmpty || sources.isEmpty) return;
    final idx = initialIndex.clamp(0, items.length - 1);
    queue.add(items);
    mediaItem.add(items[idx]);
    await _player.setAudioSource(
      ConcatenatingAudioSource(children: sources, useLazyPreparation: true),
      initialIndex: idx,
      initialPosition: Duration.zero,
    );
    _broadcastState();
  }

  Future<void> appendToQueue(MediaItem item, AudioSource source) async {
    final concat = _player.audioSource;
    final next = List<MediaItem>.of(queue.value)..add(item);
    queue.add(next);
    if (concat is ConcatenatingAudioSource) {
      await concat.add(source);
    }
    _broadcastState();
  }

  @override
  Future<void> play() async {
    await _player.play();
    _broadcastState();
  }

  @override
  Future<void> pause() async {
    await _player.pause();
    _broadcastState();
  }

  @override
  Future<void> stop() async {
    await _player.stop();
    await super.stop();
    _broadcastState();
  }

  @override
  Future<void> seek(Duration position) async {
    await _player.seek(position);
    _broadcastState();
  }

  @override
  Future<void> skipToNext() async {
    if (_player.hasNext) {
      await _player.seekToNext();
    } else if (queue.value.isNotEmpty) {
      await _player.seek(Duration.zero, index: 0);
    }
    await _player.play();
    _broadcastState();
  }

  @override
  Future<void> skipToPrevious() async {
    if (_player.position > const Duration(seconds: 3)) {
      await _player.seek(Duration.zero);
    } else if (_player.hasPrevious) {
      await _player.seekToPrevious();
    } else if (queue.value.isNotEmpty) {
      await _player.seek(Duration.zero, index: queue.value.length - 1);
    }
    await _player.play();
    _broadcastState();
  }

  @override
  Future<void> skipToQueueItem(int index) async {
    if (index < 0 || index >= queue.value.length) return;
    await _player.seek(Duration.zero, index: index);
    await _player.play();
    _broadcastState();
  }

  Future<void> disposePlayer() async {
    for (final s in _subs) {
      await s.cancel();
    }
    await _player.dispose();
  }
}

Future<MixAudioHandler> initMixAudioService() {
  return AudioService.init(
    builder: MixAudioHandler.new,
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'com.mixplayer.channel.audio',
      androidNotificationChannelName: 'Now playing',
      androidNotificationChannelDescription: 'Mix Player media controls',
      // audio_service asserts: ongoing requires stopForegroundOnPause=true.
      // Keep the FGS alive while paused so One UI keeps the shade media card.
      androidNotificationOngoing: false,
      androidStopForegroundOnPause: false,
      androidNotificationIcon: 'drawable/ic_stat_mix_player',
      androidShowNotificationBadge: false,
      androidNotificationClickStartsActivity: true,
      preloadArtwork: true,
      artDownscaleWidth: 200,
      artDownscaleHeight: 200,
      fastForwardInterval: Duration(seconds: 10),
      rewindInterval: Duration(seconds: 10),
    ),
  );
}
