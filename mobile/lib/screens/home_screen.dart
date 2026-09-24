import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../theme.dart';
import '../widgets.dart';
import 'playlist_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final home = state.home;
    final hour = DateTime.now().hour;
    final greet = hour < 12
        ? 'Good morning'
        : hour < 18
            ? 'Good afternoon'
            : 'Good evening';

    return RefreshIndicator(
      color: MixColors.green,
      onRefresh: () => state.refreshLibrary(),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      greet,
                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
                    ),
                  ),
                  if (state.offlineMode)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: MixColors.card,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text('Offline', style: TextStyle(fontSize: 12, color: MixColors.muted)),
                    ),
                ],
              ),
            ),
          ),
          if (home?.allSongs != null)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: _QuickCard(
                  title: home!.allSongs!.name,
                  subtitle: '${home.allSongs!.trackCount} songs',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => PlaylistScreen(playlist: home.allSongs!),
                    ),
                  ),
                ),
              ),
            ),
          if (home != null && home.recentTracks.isNotEmpty) ...[
            const SliverToBoxAdapter(child: SectionHeader('Recently played')),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 180,
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  scrollDirection: Axis.horizontal,
                  itemCount: home.recentTracks.length.clamp(0, 20),
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (context, i) {
                    final t = home.recentTracks[i];
                    return GestureDetector(
                      onTap: () => state.playTrackInContext(t, home.recentTracks),
                      child: SizedBox(
                        width: 120,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            TrackArt(artUrl: t.artUrl, trackId: t.id, size: 120, radius: 6),
                            const SizedBox(height: 8),
                            Text(
                              t.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                            ),
                            Text(
                              t.artist,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: MixColors.muted, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ],
          if (state.playlists.isNotEmpty) ...[
            const SliverToBoxAdapter(child: SectionHeader('Your playlists')),
            SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, i) {
                  final p = state.playlists[i];
                  return ListTile(
                    leading: TrackArt(artUrl: p.coverUrl, size: 56),
                    title: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      '${p.trackCount} songs',
                      style: const TextStyle(color: MixColors.muted, fontSize: 13),
                    ),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => PlaylistScreen(playlist: p)),
                    ),
                  );
                },
                childCount: state.playlists.length,
              ),
            ),
          ],
          if ((home == null || home.recentTracks.isEmpty) && state.tracks.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Text(
                  'No music yet.\nAdd tracks from the web app or extension.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: MixColors.muted),
                ),
              ),
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }
}

class _QuickCard extends StatelessWidget {
  const _QuickCard({required this.title, required this.subtitle, required this.onTap});
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: MixColors.card,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: MixColors.green.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Icon(Icons.library_music, color: MixColors.green),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(subtitle, style: const TextStyle(color: MixColors.muted, fontSize: 13)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: MixColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}
