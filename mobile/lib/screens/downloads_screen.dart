import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';

class DownloadsScreen extends StatelessWidget {
  const DownloadsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final items = state.downloadedTracks();
    final storage = state.storage;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Downloads'),
        backgroundColor: MixColors.bg,
        actions: [
          if (items.isNotEmpty)
            TextButton(
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Clear all downloads?'),
                    content: const Text('Removes offline audio from this phone. Server library is unchanged.'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                      TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Clear all')),
                    ],
                  ),
                );
                if (ok == true) {
                  await state.clearOfflineDownloads();
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('All offline downloads cleared')),
                    );
                  }
                }
              },
              child: const Text('Clear all'),
            ),
        ],
      ),
      body: items.isEmpty
          ? const Center(
              child: Text('No downloaded songs yet', style: TextStyle(color: MixColors.muted)),
            )
          : ListView.builder(
              padding: const EdgeInsets.only(bottom: 100),
              itemCount: items.length + 1,
              itemBuilder: (context, i) {
                if (i == 0) {
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: Text(
                      '${items.length} songs · ${formatBytes(storage.mediaBytes)} media',
                      style: const TextStyle(color: MixColors.muted, fontSize: 13),
                    ),
                  );
                }
                final t = items[i - 1];
                final size = state.offline.fileSizeOf(t.id);
                return TrackTile(
                  track: t,
                  subtitleExtra: size != null ? formatBytes(size) : null,
                  onTap: () => state.playTrackInContext(t, items),
                  trailing: IconButton(
                    tooltip: 'Remove download',
                    icon: const Icon(Icons.delete_outline, color: MixColors.muted),
                    onPressed: () async {
                      await state.removeDownload(t.id);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Removed ${t.title}')),
                        );
                      }
                    },
                  ),
                );
              },
            ),
    );
  }
}
