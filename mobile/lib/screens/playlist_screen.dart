import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';

class PlaylistScreen extends StatefulWidget {
  const PlaylistScreen({super.key, required this.playlist});
  final Playlist playlist;

  @override
  State<PlaylistScreen> createState() => _PlaylistScreenState();
}

class _PlaylistScreenState extends State<PlaylistScreen> {
  List<Track> _tracks = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final list = await context.read<AppState>().loadPlaylistTracks(widget.playlist.id);
    if (!mounted) return;
    setState(() {
      _tracks = list;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(title: Text(widget.playlist.name)),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: MixColors.green))
          : RefreshIndicator(
              color: MixColors.green,
              onRefresh: _load,
              child: CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          TrackArt(artUrl: widget.playlist.coverUrl ?? (_tracks.isNotEmpty ? _tracks.first.artUrl : null), size: 120, radius: 8),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  widget.playlist.name,
                                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  '${_tracks.length} songs',
                                  style: const TextStyle(color: MixColors.muted),
                                ),
                                const SizedBox(height: 12),
                                FilledButton.icon(
                                  onPressed: _tracks.isEmpty
                                      ? null
                                      : () => state.playTrackInContext(
                                            _tracks.first,
                                            _tracks,
                                            playlistId: widget.playlist.id,
                                          ),
                                  style: FilledButton.styleFrom(
                                    backgroundColor: MixColors.green,
                                    foregroundColor: Colors.black,
                                    shape: const StadiumBorder(),
                                  ),
                                  icon: const Icon(Icons.play_arrow),
                                  label: const Text('Play', style: TextStyle(fontWeight: FontWeight.w800)),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, i) {
                        final t = _tracks[i];
                        return TrackTile(
                          track: t,
                          onTap: () => state.playTrackInContext(t, _tracks, playlistId: widget.playlist.id),
                          trailing: IconButton(
                            icon: Icon(
                              state.isDownloaded(t.id) ? Icons.download_done : Icons.download_outlined,
                              color: state.isDownloaded(t.id) ? MixColors.green : MixColors.muted,
                            ),
                            onPressed: () async {
                              try {
                                if (state.isDownloaded(t.id)) {
                                  await state.removeDownload(t.id);
                                } else {
                                  await state.downloadTrack(t);
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                                }
                              }
                            },
                          ),
                        );
                      },
                      childCount: _tracks.length,
                    ),
                  ),
                  const SliverToBoxAdapter(child: SizedBox(height: 100)),
                ],
              ),
            ),
    );
  }
}
