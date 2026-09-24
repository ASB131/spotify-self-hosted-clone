import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';

class ArtistScreen extends StatelessWidget {
  const ArtistScreen({super.key, required this.artist});
  final ArtistHit artist;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final tracks = state.tracksByArtist(artist.name);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Artist'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Row(
                children: [
                  TrackArt(
                    artUrl: artist.artUrl ?? (tracks.isNotEmpty ? tracks.first.artUrl : null),
                    trackId: tracks.isNotEmpty ? tracks.first.id : null,
                    size: 120,
                    radius: 60,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          artist.name,
                          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${tracks.length} songs',
                          style: const TextStyle(color: MixColors.muted),
                        ),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          onPressed: tracks.isEmpty
                              ? null
                              : () => state.playTrackInContext(tracks.first, tracks),
                          style: FilledButton.styleFrom(
                            backgroundColor: MixColors.green,
                            foregroundColor: Colors.black,
                          ),
                          icon: const Icon(Icons.play_arrow_rounded),
                          label: const Text('Play', style: TextStyle(fontWeight: FontWeight.w800)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (tracks.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Text('No songs for this artist', style: TextStyle(color: MixColors.muted)),
              ),
            )
          else
            SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, i) {
                  final t = tracks[i];
                  return TrackTile(
                    track: t,
                    onTap: () => state.playTrackInContext(t, tracks),
                    trailing: OfflineDownloadButton(track: t),
                  );
                },
                childCount: tracks.length,
              ),
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }
}
