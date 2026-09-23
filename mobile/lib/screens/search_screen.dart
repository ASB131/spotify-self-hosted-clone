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

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  List<Track> _results = [];
  bool _searching = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _run(String q) async {
    setState(() => _searching = true);
    final results = await context.read<AppState>().search(q);
    if (!mounted) return;
    setState(() {
      _results = results;
      _searching = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            controller: _controller,
            onChanged: (v) {
              if (v.trim().length >= 2) {
                _run(v);
              } else {
                setState(() => _results = []);
              }
            },
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search, color: MixColors.muted),
              hintText: 'What do you want to listen to?',
            ),
          ),
        ),
        if (_searching) const LinearProgressIndicator(minHeight: 2, color: MixColors.green),
        Expanded(
          child: _results.isEmpty
              ? const Center(
                  child: Text(
                    'Search your library',
                    style: TextStyle(color: MixColors.muted),
                  ),
                )
              : ListView.builder(
                  itemCount: _results.length,
                  padding: const EdgeInsets.only(bottom: 100),
                  itemBuilder: (context, i) {
                    final t = _results[i];
                    return TrackTile(
                      track: t,
                      onTap: () => context.read<AppState>().playTrackInContext(t, _results),
                      trailing: _DownloadButton(track: t),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _DownloadButton extends StatelessWidget {
  const _DownloadButton({required this.track});
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
