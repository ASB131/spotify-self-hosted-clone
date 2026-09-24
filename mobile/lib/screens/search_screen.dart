import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'artist_screen.dart';

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
  bool _ytSearching = false;
  String? _ytError;
  String _query = '';
  int _searchGen = 0;

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
    final gen = ++_searchGen;
    setState(() {
      _query = query;
      _searching = query.length >= 2;
      _ytError = null;
      if (query.length < 2) {
        _songs = [];
        _artists = [];
        _youtube = [];
        _searching = false;
        _ytSearching = false;
      }
    });
    if (query.length < 2) return;

    final state = context.read<AppState>();
    final songsFuture = state.search(query);
    final ytFuture = state.offlineMode
        ? Future<List<YoutubeResult>>.value(const [])
        : state.searchYoutube(query);

    setState(() => _ytSearching = !state.offlineMode);

    final songs = await songsFuture;
    if (!mounted || gen != _searchGen) return;
    setState(() {
      _songs = songs;
      _artists = state.artistsMatching(query);
    });

    try {
      final yt = await ytFuture;
      if (!mounted || gen != _searchGen) return;
      setState(() {
        _youtube = yt;
        _ytError = state.offlineMode ? 'Connect to your server to search YouTube' : null;
        _ytSearching = false;
        _searching = false;
      });
    } catch (e) {
      if (!mounted || gen != _searchGen) return;
      setState(() {
        _youtube = [];
        _ytError = e.toString();
        _ytSearching = false;
        _searching = false;
      });
    }
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
          tabs: const [
            Tab(text: 'Songs'),
            Tab(text: 'Artists'),
            Tab(text: 'YouTube'),
          ],
        ),
        if (_searching || _ytSearching) const LinearProgressIndicator(minHeight: 2, color: MixColors.green),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: [
              _SongsTab(songs: _songs, emptyHint: 'Search songs in your library'),
              _ArtistsTab(artists: _artists),
              _YoutubeTab(
                results: _youtube,
                query: _query,
                error: _ytError,
                searching: _ytSearching,
              ),
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
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => ArtistScreen(artist: a)),
            );
          },
        );
      },
    );
  }
}

class _YoutubeTab extends StatelessWidget {
  const _YoutubeTab({
    required this.results,
    required this.query,
    required this.error,
    required this.searching,
  });
  final List<YoutubeResult> results;
  final String query;
  final String? error;
  final bool searching;

  @override
  Widget build(BuildContext context) {
    if (query.length < 2) {
      return const Center(
        child: Text('Search YouTube to add songs to your server', style: TextStyle(color: MixColors.muted)),
      );
    }
    if (searching && results.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: MixColors.green));
    }
    if (error != null && results.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(error!, textAlign: TextAlign.center, style: const TextStyle(color: MixColors.muted)),
        ),
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
        final busyMp3 = state.youtubeQueueing.contains('${y.id}:mp3') || state.youtubeQueueing.contains(y.id);
        final busyFlac = state.youtubeQueueing.contains('${y.id}:flac');
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
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
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      y.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    Text(
                      [
                        y.artist,
                        if (y.durationSeconds != null) formatDuration(y.durationSeconds),
                      ].join(' · '),
                      style: const TextStyle(color: MixColors.muted, fontSize: 12),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        _FormatDownloadChip(
                          label: busyMp3 ? '…' : 'MP3',
                          busy: busyMp3,
                          onTap: busyMp3 || busyFlac
                              ? null
                              : () => _queue(context, state, y, 'mp3'),
                        ),
                        const SizedBox(width: 8),
                        _FormatDownloadChip(
                          label: busyFlac ? '…' : 'FLAC',
                          busy: busyFlac,
                          accent: true,
                          onTap: busyMp3 || busyFlac
                              ? null
                              : () => _queue(context, state, y, 'flac'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _queue(BuildContext context, AppState state, YoutubeResult y, String format) async {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Queuing ${y.title} as ${format.toUpperCase()}…')),
    );
    try {
      await state.addYoutubeToServer(y, format: format);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Queued ${y.title} (${format.toUpperCase()}) on the server')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }
}

class _FormatDownloadChip extends StatelessWidget {
  const _FormatDownloadChip({
    required this.label,
    required this.onTap,
    this.busy = false,
    this.accent = false,
  });
  final String label;
  final VoidCallback? onTap;
  final bool busy;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: accent ? MixColors.green.withOpacity(0.2) : Colors.white12,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: accent ? MixColors.green : MixColors.white,
            ),
          ),
        ),
      ),
    );
  }
}
