import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../theme.dart';
import '../widgets.dart';
import 'playlist_screen.dart';

class LibraryScreen extends StatelessWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return DefaultTabController(
      length: 2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Text('Your Library', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
          ),
          const TabBar(
            indicatorColor: MixColors.green,
            labelColor: MixColors.white,
            unselectedLabelColor: MixColors.muted,
            tabs: [
              Tab(text: 'Playlists'),
              Tab(text: 'Songs'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                RefreshIndicator(
                  color: MixColors.green,
                  onRefresh: () => state.refreshLibrary(),
                  child: ListView.builder(
                    padding: const EdgeInsets.only(bottom: 100),
                    itemCount: state.playlists.length,
                    itemBuilder: (context, i) {
                      final p = state.playlists[i];
                      return ListTile(
                        leading: TrackArt(artUrl: p.coverUrl),
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
                  ),
                ),
                RefreshIndicator(
                  color: MixColors.green,
                  onRefresh: () => state.refreshLibrary(),
                  child: ListView.builder(
                    padding: const EdgeInsets.only(bottom: 100),
                    itemCount: state.tracks.length,
                    itemBuilder: (context, i) {
                      final t = state.tracks[i];
                      return TrackTile(
                        track: t,
                        onTap: () => state.playTrackInContext(t, state.tracks),
                        trailing: OfflineDownloadButton(track: t),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
