class Track {
  Track({
    required this.id,
    required this.title,
    required this.artist,
    this.album,
    this.durationSeconds,
    required this.format,
    required this.fileSizeBytes,
    this.artUrl,
    this.addedAt,
    this.isLiked = false,
  });

  final int id;
  final String title;
  final String artist;
  final String? album;
  final int? durationSeconds;
  final String format;
  final int fileSizeBytes;
  final String? artUrl;
  final String? addedAt;
  final bool isLiked;

  factory Track.fromJson(Map<String, dynamic> j) => Track(
        id: j['id'] as int,
        title: (j['title'] as String?) ?? 'Unknown',
        artist: (j['artist'] as String?) ?? 'Unknown Artist',
        album: j['album'] as String?,
        durationSeconds: j['duration_seconds'] as int?,
        format: (j['format'] as String?) ?? 'mp3',
        fileSizeBytes: (j['file_size_bytes'] as num?)?.toInt() ?? 0,
        artUrl: j['art_url'] as String?,
        addedAt: j['added_at'] as String?,
        isLiked: j['is_liked'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'artist': artist,
        'album': album,
        'duration_seconds': durationSeconds,
        'format': format,
        'file_size_bytes': fileSizeBytes,
        'art_url': artUrl,
        'added_at': addedAt,
        'is_liked': isLiked,
      };

  String get formatLabel => format.toUpperCase();
}

class Playlist {
  Playlist({
    required this.id,
    required this.name,
    this.description,
    required this.isLikedSongs,
    this.isLikedPlaylist = false,
    this.trackCount = 0,
    this.coverUrl,
  });

  final int id;
  final String name;
  final String? description;
  final bool isLikedSongs;
  final bool isLikedPlaylist;
  final int trackCount;
  final String? coverUrl;

  factory Playlist.fromJson(Map<String, dynamic> j) => Playlist(
        id: j['id'] as int,
        name: (j['name'] as String?) ?? 'Playlist',
        description: j['description'] as String?,
        isLikedSongs: j['is_liked_songs'] as bool? ?? false,
        isLikedPlaylist: j['is_liked_playlist'] as bool? ?? false,
        trackCount: j['track_count'] as int? ?? 0,
        coverUrl: j['cover_url'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'is_liked_songs': isLikedSongs,
        'is_liked_playlist': isLikedPlaylist,
        'track_count': trackCount,
        'cover_url': coverUrl,
      };
}

class HomeFeed {
  HomeFeed({
    this.allSongs,
    this.recentTracks = const [],
    this.recentPlaylists = const [],
  });

  final Playlist? allSongs;
  final List<Track> recentTracks;
  final List<Playlist> recentPlaylists;

  factory HomeFeed.fromJson(Map<String, dynamic> j) {
    final recentPl = <Playlist>[];
    for (final raw in (j['recently_played_playlists'] as List? ?? const [])) {
      final m = Map<String, dynamic>.from(raw as Map);
      recentPl.add(
        Playlist(
          id: m['id'] as int,
          name: (m['name'] as String?) ?? 'Playlist',
          isLikedSongs: m['is_liked_songs'] as bool? ?? false,
          coverUrl: m['cover_url'] as String?,
        ),
      );
    }
    return HomeFeed(
      allSongs: j['all_songs'] != null
          ? Playlist.fromJson(Map<String, dynamic>.from(j['all_songs'] as Map))
          : null,
      recentTracks: (j['recently_played_tracks'] as List? ?? const [])
          .map((e) => Track.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      recentPlaylists: recentPl,
    );
  }

  Map<String, dynamic> toJson() => {
        'all_songs': allSongs?.toJson(),
        'recently_played_tracks': recentTracks.map((t) => t.toJson()).toList(),
        'recently_played_playlists': recentPlaylists
            .map(
              (p) => {
                'id': p.id,
                'name': p.name,
                'is_liked_songs': p.isLikedSongs,
                'cover_url': p.coverUrl,
              },
            )
            .toList(),
      };
}

class YoutubeResult {
  YoutubeResult({
    required this.id,
    required this.title,
    required this.artist,
    required this.url,
    this.channel = '',
    this.durationSeconds,
    this.thumbnailUrl,
  });

  final String id;
  final String title;
  final String artist;
  final String url;
  final String channel;
  final int? durationSeconds;
  final String? thumbnailUrl;

  factory YoutubeResult.fromJson(Map<String, dynamic> j) {
    int? duration;
    final rawDur = j['duration_seconds'];
    if (rawDur is int) {
      duration = rawDur;
    } else if (rawDur is num) {
      duration = rawDur.toInt();
    }
    return YoutubeResult(
      id: '${j['id'] ?? ''}',
      title: (j['title'] as String?) ?? 'Unknown',
      artist: (j['artist'] as String?) ?? (j['channel'] as String?) ?? 'YouTube',
      url: (j['url'] as String?) ?? '',
      channel: (j['channel'] as String?) ?? '',
      durationSeconds: duration,
      thumbnailUrl: j['thumbnail_url'] as String?,
    );
  }
}

class ArtistHit {
  ArtistHit({required this.name, required this.trackCount, this.artUrl});
  final String name;
  final int trackCount;
  final String? artUrl;
}

class UserProfile {
  UserProfile({
    required this.id,
    required this.email,
    required this.displayName,
    required this.role,
    required this.storageUsedBytes,
    required this.storageQuotaBytes,
    this.defaultAudioFormat = 'mp3',
  });

  final int id;
  final String email;
  final String displayName;
  final String role;
  final int storageUsedBytes;
  final int storageQuotaBytes;
  final String defaultAudioFormat;

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        id: j['id'] as int,
        email: (j['email'] as String?) ?? '',
        displayName: (j['display_name'] as String?) ?? 'User',
        role: (j['role'] as String?) ?? 'user',
        storageUsedBytes: (j['storage_used_bytes'] as num?)?.toInt() ?? 0,
        storageQuotaBytes: (j['storage_quota_bytes'] as num?)?.toInt() ?? 0,
        defaultAudioFormat: (j['default_audio_format'] as String?) ?? 'mp3',
      );
}

class UserStats {
  UserStats({
    required this.tracksCount,
    required this.playlistsCount,
    required this.storageUsedBytes,
    required this.storageQuotaBytes,
  });

  final int tracksCount;
  final int playlistsCount;
  final int storageUsedBytes;
  final int storageQuotaBytes;

  factory UserStats.fromJson(Map<String, dynamic> j) => UserStats(
        tracksCount: (j['tracks_count'] as num?)?.toInt() ?? 0,
        playlistsCount: (j['playlists_count'] as num?)?.toInt() ?? 0,
        storageUsedBytes: (j['storage_used_bytes'] as num?)?.toInt() ?? 0,
        storageQuotaBytes: (j['storage_quota_bytes'] as num?)?.toInt() ?? 0,
      );
}

String formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  if (bytes < 1024 * 1024 * 1024) return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
}
