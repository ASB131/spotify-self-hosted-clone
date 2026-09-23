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
