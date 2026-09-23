import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_state.dart';
import 'models.dart';
import 'theme.dart';

class TrackArt extends StatelessWidget {
  const TrackArt({super.key, required this.artUrl, this.size = 56, this.radius = 4});

  final String? artUrl;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final api = context.read<AppState>().api;
    final url = api.absoluteUrl(artUrl);
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(
        width: size,
        height: size,
        child: url.isEmpty
            ? Container(
                color: MixColors.card,
                child: const Icon(Icons.music_note, color: MixColors.muted),
              )
            : CachedNetworkImage(
                imageUrl: url,
                httpHeaders: api.authHeaders(),
                fit: BoxFit.cover,
                placeholder: (_, __) => Container(color: MixColors.card),
                errorWidget: (_, __, ___) => Container(
                  color: MixColors.card,
                  child: const Icon(Icons.music_note, color: MixColors.muted),
                ),
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
  });

  final Track track;
  final VoidCallback onTap;
  final Widget? trailing;
  final String? subtitleExtra;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final offline = state.isDownloaded(track.id);
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      leading: TrackArt(artUrl: track.artUrl),
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
