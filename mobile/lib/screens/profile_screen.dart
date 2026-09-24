import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../models.dart';
import '../theme.dart';
import 'downloads_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().refreshProfile(silent: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final profile = state.profile;
    final stats = state.stats;
    final storage = state.storage;

    return RefreshIndicator(
      color: MixColors.green,
      onRefresh: () => state.refreshProfile(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
        children: [
          const Text('Profile', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: MixColors.card, borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: MixColors.green.withOpacity(0.2),
                  child: Text(
                    (profile?.displayName.isNotEmpty == true ? profile!.displayName[0] : '?').toUpperCase(),
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: MixColors.green),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profile?.displayName ?? (state.offlineMode ? 'Offline' : 'Loading…'),
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                      ),
                      Text(
                        profile?.email ?? state.api.baseUrl,
                        style: const TextStyle(color: MixColors.muted, fontSize: 13),
                      ),
                      if (state.offlineMode)
                        const Padding(
                          padding: EdgeInsets.only(top: 4),
                          child: Text('Offline mode — reconnecting…', style: TextStyle(color: MixColors.green, fontSize: 12)),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Text('Library', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          _StatTile(label: 'Songs on server', value: '${stats?.tracksCount ?? state.tracks.length}'),
          _StatTile(label: 'Playlists', value: '${stats?.playlistsCount ?? state.playlists.length}'),
          _StatTile(
            label: 'Server storage used',
            value: stats == null
                ? '—'
                : '${formatBytes(stats.storageUsedBytes)} / ${formatBytes(stats.storageQuotaBytes)}',
          ),
          const SizedBox(height: 20),
          const Text('On this phone', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Downloads', style: TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(
              '${state.offline.downloadedCount} songs',
              style: const TextStyle(color: MixColors.muted, fontSize: 13),
            ),
            trailing: const Icon(Icons.chevron_right, color: MixColors.muted),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const DownloadsScreen()),
            ),
          ),
          _StatTile(label: 'Media (audio)', value: formatBytes(storage.mediaBytes)),
          _StatTile(label: 'Thumbnails', value: formatBytes(storage.thumbnailBytes)),
          _StatTile(label: 'Cached metadata', value: formatBytes(storage.metadataBytes)),
          _StatTile(label: 'Total on device', value: formatBytes(storage.totalBytes)),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: state.offline.downloadedCount == 0
                ? null
                : () async {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Clear all downloads?'),
                        content: const Text('Removes offline audio from this phone. Server library is unchanged.'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Clear')),
                        ],
                      ),
                    );
                    if (ok == true) {
                      await state.clearOfflineDownloads();
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Offline downloads cleared')),
                        );
                      }
                    }
                  },
            icon: const Icon(Icons.delete_outline),
            label: const Text('Clear all downloads'),
            style: OutlinedButton.styleFrom(foregroundColor: MixColors.white),
          ),
          const SizedBox(height: 28),
          FilledButton.icon(
            onPressed: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Sign out?'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                    TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out')),
                  ],
                ),
              );
              if (ok == true) await state.logout();
            },
            style: FilledButton.styleFrom(
              backgroundColor: MixColors.card,
              foregroundColor: MixColors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            icon: const Icon(Icons.logout),
            label: const Text('Sign out', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
          const SizedBox(height: 12),
          Text(
            'Server: ${state.api.baseUrl}',
            style: const TextStyle(color: MixColors.muted, fontSize: 12),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => openAppSettings(),
            child: const Text(
              'Notification settings (needed for shade media controls)',
              style: TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(label, style: const TextStyle(color: MixColors.muted, fontSize: 14)),
      trailing: Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
    );
  }
}
