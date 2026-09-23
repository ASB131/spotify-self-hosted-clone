import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> with SingleTickerProviderStateMixin {
  final _controller = TextEditingController();
  late final TabController _tabs;
  List<Track> _songs = [];
  List<ArtistHit> _artists = [];
  List<YoutubeResult> _youtube = [];
  bool _searching = false;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _controller.dispose();
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _run(String q) async {
    final query = q.trim();
    setState(() {
      _query = query;
      _searching = query.length >= 2;
    });
    if (query.length < 2) {
      setState(() {
        _songs = [];
        _artists = [];
        _youtube = [];
        _searching = false;
      });
      return;
    }

    final state = context.read<AppState>();
    final songs = await state.search(query);
    final artists = state.artistsMatching(query);
    if (!mounted) return;
    setState(() {
      _songs = songs;
      _artists = artists;
    });

    // YouTube can be slower — load after library results.
    if (_tabs.index == 2 || _youtube.isEmpty) {
      try {
        final yt = await state.searchYoutube(query);
        if (!mounted || _query != query) return;
        setState(() => _youtube = yt);
      } catch (_) {
        if (mounted && _query == query) setState(() => _youtube = []);
      }
    }
    if (mounted && _query == query) setState(() => _searching = false);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            controller: _controller,
            onChanged: _run,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search, color: MixColors.muted),
              hintText: 'What do you want to listen to?',
            ),
          ),
        ),
        TabBar(
          controller: _tabs,
          indicatorColor: MixColors.green,
          labelColor: MixColors.white,
          unselectedLabelColor: MixColors.muted,
          onTap: (_) {
            if (_query.length >= 2 && _tabs.index == 2 && _youtube.isEmpty) {
              _run(_query);
            }
          },
          tabs: const [
            Tab(text: 'Songs'),
            Tab(text: 'Artists'),
            Tab(text: 'YouTube'),
          ],
        ),
        if (_searching) const LinearProgressIndicator(minHeight: 2, color: MixColors.green),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: [
              _SongsTab(songs: _songs, emptyHint: 'Search songs in your library'),
              _ArtistsTab(artists: _artists),
              _YoutubeTab(results: _youtube, query: _query),
            ],
          ),
        ),
      ],
    );
  }
}

class _SongsTab extends StatelessWidget {
  const _SongsTab({required this.songs, required this.emptyHint});
  final List<Track> songs;
  final String emptyHint;

  @override
  Widget build(BuildContext context) {
    if (songs.isEmpty) {
      return Center(child: Text(emptyHint, style: const TextStyle(color: MixColors.muted)));
    }
    return ListView.builder(
      itemCount: songs.length,
      padding: const EdgeInsets.only(bottom: 100),
      itemBuilder: (context, i) {
        final t = songs[i];
        return TrackTile(
          track: t,
          onTap: () => context.read<AppState>().playTrackInContext(t, songs),
          trailing: OfflineDownloadButton(track: t),
        );
      },
    );
  }
}

class _ArtistsTab extends StatelessWidget {
  const _ArtistsTab({required this.artists});
  final List<ArtistHit> artists;

  @override
  Widget build(BuildContext context) {
    if (artists.isEmpty) {
      return const Center(child: Text('Search artists in your library', style: TextStyle(color: MixColors.muted)));
    }
    return ListView.builder(
      itemCount: artists.length,
      padding: const EdgeInsets.only(bottom: 100),
      itemBuilder: (context, i) {
        final a = artists[i];
        return ListTile(
          leading: TrackArt(artUrl: a.artUrl, size: 56, radius: 28),
          title: Text(a.name, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text('${a.trackCount} songs', style: const TextStyle(color: MixColors.muted, fontSize: 13)),
          onTap: () {
            final tracks = context.read<AppState>().tracksByArtist(a.name);
            if (tracks.isEmpty) return;
            context.read<AppState>().playTrackInContext(tracks.first, tracks);
          },
        );
      },
    );
  }
}

class _YoutubeTab extends StatelessWidget {
  const _YoutubeTab({required this.results, required this.query});
  final List<YoutubeResult> results;
  final String query;

  @override
  Widget build(BuildContext context) {
    if (query.length < 2) {
      return const Center(
        child: Text('Search YouTube to add songs to your server', style: TextStyle(color: MixColors.muted)),
      );
    }
    if (results.isEmpty) {
      return const Center(child: Text('No YouTube results', style: TextStyle(color: MixColors.muted)));
    }
    final state = context.watch<AppState>();
    return ListView.builder(
      itemCount: results.length,
      padding: const EdgeInsets.only(bottom: 100),
      itemBuilder: (context, i) {
        final y = results[i];
        final busy = state.youtubeQueueing.contains(y.id);
        return ListTile(
          leading: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: SizedBox(
              width: 64,
              height: 40,
              child: y.thumbnailUrl == null
                  ? Container(color: MixColors.card, child: const Icon(Icons.play_arrow, color: MixColors.muted))
                  : Image.network(
                      y.thumbnailUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: MixColors.card,
                        child: const Icon(Icons.play_arrow, color: MixColors.muted),
                      ),
                    ),
            ),
          ),
          title: Text(y.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(
            [
              y.artist,
              if (y.durationSeconds != null) formatDuration(y.durationSeconds),
            ].join(' · '),
            style: const TextStyle(color: MixColors.muted, fontSize: 13),
          ),
          trailing: busy
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2, color: MixColors.green),
                )
              : IconButton(
                  tooltip: 'Add to Mix player server',
                  icon: const Icon(Icons.add_circle_outline, color: MixColors.green),
                  onPressed: () async {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Queuing ${y.title}…')),
                    );
                    try {
                      await state.addYoutubeToServer(y);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Queued ${y.title} for download on the server')),
                        );
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
    );
  }
}
