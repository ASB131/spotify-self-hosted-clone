import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import 'app_state.dart';
import 'http_overrides.dart';
import 'screens/shell_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = mixHttpOverrides;

  // Must succeed for the One UI / Android shade media card (MediaStyle notification).
  try {
    await JustAudioBackground.init(
      androidNotificationChannelId: 'com.mixplayer.channel.audio',
      androidNotificationChannelName: 'Now playing',
      androidNotificationOngoing: true,
      androidShowNotificationBadge: false,
      androidStopForegroundOnPause: false,
      preloadArtwork: true,
      artDownscaleWidth: 200,
      artDownscaleHeight: 200,
      fastForwardInterval: const Duration(seconds: 10),
      rewindInterval: const Duration(seconds: 10),
    );
  } catch (e, st) {
    debugPrint('JustAudioBackground.init failed: $e\n$st');
  }

  if (Platform.isAndroid) {
    try {
      var status = await Permission.notification.status;
      if (!status.isGranted) {
        status = await Permission.notification.request();
      }
      debugPrint('Notification permission: $status');
    } catch (e) {
      debugPrint('Notification permission request failed: $e');
    }
  }

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Colors.black,
    ),
  );
  runApp(const MixPlayerApp());
}

class MixPlayerApp extends StatelessWidget {
  const MixPlayerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState(),
      child: MaterialApp(
        title: 'Mix Player',
        debugShowCheckedModeBanner: false,
        theme: mixTheme(),
        home: const ShellScreen(),
      ),
    );
  }
}
