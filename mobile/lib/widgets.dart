import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_state.dart';
import 'models.dart';
import 'theme.dart';

class TrackArt extends StatefulWidget {
  const TrackArt({
    super.key,
    this.artUrl,
    this.trackId,
    this.size = 56,
    this.radius = 4,
  });

  final String? artUrl;
  final int? trackId;
  final double size;
  final double radius;

  @override
  State<TrackArt> createState() => _TrackArtState();
}

class _TrackArtState extends State<TrackArt> {
  Uint8List? _bytes;
  bool _loading = false;
  String? _triedUrl;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _maybeLoad();
  }

  @override
  void didUpdateWidget(covariant TrackArt oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.artUrl != widget.artUrl || oldWidget.trackId != widget.trackId) {
      _bytes = null;
      _triedUrl = null;
      _maybeLoad();
    }
  }

  Future<void> _maybeLoad() async {
    final state = context.read<AppState>();
    final tid = widget.trackId;
    if (tid != null) {
      final local = state.offline.artFile(tid);
      if (local != null) {
        final bytes = await local.readAsBytes();
        if (!mounted) return;
        setState(() => _bytes = bytes);
        return;
      }
    }

    final url = widget.artUrl;
    if (url == null || url.isEmpty) return;
    if (_loading || _triedUrl == url) return;
    _loading = true;
    _triedUrl = url;
    final bytes = await state.api.fetchArtBytes(url);
    if (!mounted) return;
    if (bytes != null && bytes.isNotEmpty) {
      if (tid != null) {
        await state.offline.saveArtBytes(tid, bytes);
      }
      setState(() {
        _bytes = bytes;
        _loading = false;
      });
    } else {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.radius),
      child: SizedBox(
        width: widget.size,
        height: widget.size,
        child: _bytes != null
            ? Image.memory(_bytes!, fit: BoxFit.cover, gaplessPlayback: true)
            : Container(
                color: MixColors.card,
                child: _loading
                    ? const Padding(
                        padding: EdgeInsets.all(16),
                        child: CircularProgressIndicator(strokeWidth: 2, color: MixColors.muted),
                      )
                    : const Icon(Icons.music_note, color: MixColors.muted),
              ),
      ),
    );
  }
}

class TrackTile extends StatelessWidget {
  const TrackTile({
    super.key,
    required this.track,
    required this.onTap,
    this.trailing,
    this.subtitleExtra,
    this.enableQueueSwipe = true,
  });

  final Track track;
  final VoidCallback onTap;
  final Widget? trailing;
  final String? subtitleExtra;
  final bool enableQueueSwipe;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final offline = state.isDownloaded(track.id);
    final tile = ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      leading: TrackArt(artUrl: track.artUrl, trackId: track.id),
      title: Text(
        track.title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w600, color: MixColors.white),
      ),
      subtitle: Text(
        [
          if (offline) 'Downloaded',
          track.artist,
          track.formatLabel,
          if (subtitleExtra != null) subtitleExtra!,
        ].where((e) => e.isNotEmpty).join(' · '),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: offline ? MixColors.green : MixColors.muted,
          fontSize: 13,
        ),
      ),
      trailing: trailing,
    );

    if (!enableQueueSwipe) return tile;

    return Dismissible(
      key: ValueKey('queue-${track.id}-${track.title}'),
      direction: DismissDirection.startToEnd,
      confirmDismiss: (_) async {
        await state.addToQueue(track);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Queued ${track.title}'),
              duration: const Duration(seconds: 1),
            ),
          );
        }
        return false; // keep row; just use swipe as an action
      },
      background: Container(
        alignment: Alignment.centerLeft,
        color: MixColors.green.withOpacity(0.25),
        padding: const EdgeInsets.only(left: 20),
        child: const Row(
          children: [
            Icon(Icons.queue_music, color: MixColors.green),
            SizedBox(width: 8),
            Text('Add to queue', style: TextStyle(color: MixColors.green, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
      child: tile,
    );
  }
}

class OfflineDownloadButton extends StatelessWidget {
  const OfflineDownloadButton({super.key, required this.track});
  final Track track;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.isDownloaded(track.id)) {
      return IconButton(
        tooltip: 'Remove download',
        icon: const Icon(Icons.download_done, color: MixColors.green),
        onPressed: () => state.removeDownload(track.id),
      );
    }
    if (state.downloading.contains(track.id)) {
      return const Padding(
        padding: EdgeInsets.all(12),
        child: SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2, color: MixColors.green),
        ),
      );
    }
    return IconButton(
      tooltip: 'Download for offline',
      icon: const Icon(Icons.download_outlined, color: MixColors.muted),
      onPressed: () async {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Downloading ${track.title}…')),
        );
        try {
          await state.downloadTrack(track);
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Downloaded ${track.title}')),
            );
          }
        } catch (e) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
          }
        }
      },
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 10),
      child: Text(
        title,
        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: MixColors.white),
      ),
    );
  }
}
