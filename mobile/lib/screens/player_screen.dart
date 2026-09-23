import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../theme.dart';
import '../widgets.dart';

class MiniPlayerBar extends StatelessWidget {
  const MiniPlayerBar({super.key, required this.onOpen});
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final track = state.player.current;
    if (track == null) return const SizedBox.shrink();

    return Material(
      color: MixColors.card,
      child: SafeArea(
        top: false,
        child: InkWell(
          onTap: onOpen,
          child: SizedBox(
            height: 64,
            child: Row(
              children: [
                const SizedBox(width: 8),
                TrackArt(artUrl: track.artUrl, size: 48),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        track.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                      ),
                      Text(
                        track.artist,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: MixColors.muted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                StreamBuilder<bool>(
                  stream: state.player.player.playingStream,
                  builder: (context, snap) {
                    final playing = snap.data ?? false;
                    return IconButton(
                      icon: Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded, size: 32),
                      onPressed: () => state.player.toggle(),
                    );
                  },
                ),
                const SizedBox(width: 4),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class NowPlayingScreen extends StatelessWidget {
  const NowPlayingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final track = state.player.current;
    if (track == null) {
      return const Scaffold(body: Center(child: Text('Nothing playing')));
    }
    final player = state.player.player;
    final offline = state.isDownloaded(track.id);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.keyboard_arrow_down),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text('Now playing', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        centerTitle: true,
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
        child: Column(
          children: [
            const Spacer(),
            TrackArt(artUrl: track.artUrl, size: MediaQuery.of(context).size.width - 48, radius: 12),
            const Spacer(),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                track.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${track.artist}${offline ? ' · Downloaded' : ' · Streaming'}',
                style: const TextStyle(color: MixColors.muted, fontSize: 15),
              ),
            ),
            const SizedBox(height: 16),
            StreamBuilder<Duration>(
              stream: player.positionStream,
              builder: (context, snap) {
                final pos = snap.data ?? Duration.zero;
                final total = player.duration ?? Duration(seconds: track.durationSeconds ?? 0);
                final maxMs = total.inMilliseconds <= 0 ? 1 : total.inMilliseconds.toDouble();
                return Column(
                  children: [
                    SliderTheme(
                      data: SliderTheme.of(context).copyWith(
                        activeTrackColor: MixColors.white,
                        inactiveTrackColor: MixColors.card,
                        thumbColor: MixColors.white,
                        overlayShape: SliderComponentShape.noOverlay,
                        trackHeight: 3,
                      ),
                      child: Slider(
                        value: pos.inMilliseconds.clamp(0, maxMs.toInt()).toDouble(),
                        max: maxMs,
                        onChanged: (v) => state.player.seek(Duration(milliseconds: v.round())),
                      ),
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(formatDuration(pos.inSeconds), style: const TextStyle(color: MixColors.muted, fontSize: 12)),
                        Text(formatDuration(total.inSeconds), style: const TextStyle(color: MixColors.muted, fontSize: 12)),
                      ],
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                IconButton(
                  iconSize: 36,
                  onPressed: () async {
                    await state.player.prev();
                    state.refreshUi();
                  },
                  icon: const Icon(Icons.skip_previous_rounded),
                ),
                StreamBuilder<bool>(
                  stream: player.playingStream,
                  builder: (context, snap) {
                    final playing = snap.data ?? false;
                    return IconButton(
                      iconSize: 72,
                      color: MixColors.white,
                      onPressed: () async {
                        await state.player.toggle();
                        state.refreshUi();
                      },
                      icon: Icon(playing ? Icons.pause_circle_filled : Icons.play_circle_filled),
                    );
                  },
                ),
                IconButton(
                  iconSize: 36,
                  onPressed: () async {
                    await state.player.next();
                    state.refreshUi();
                  },
                  icon: const Icon(Icons.skip_next_rounded),
                ),
              ],
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                TextButton.icon(
                  onPressed: () async {
                    try {
                      if (offline) {
                        await state.removeDownload(track.id);
                      } else {
                        await state.downloadTrack(track);
                      }
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                      }
                    }
                  },
                  icon: Icon(offline ? Icons.download_done : Icons.download_outlined, color: MixColors.green),
                  label: Text(offline ? 'Downloaded' : 'Download ${track.formatLabel}'),
                ),
              ],
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}
