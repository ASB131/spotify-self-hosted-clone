import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import 'app_state.dart';
import 'audio_handler.dart';
import 'http_overrides.dart';
import 'screens/shell_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = mixHttpOverrides;

  if (Platform.isAndroid) {
    try {
      final status = await Permission.notification.status;
      if (!status.isGranted) {
        await Permission.notification.request();
      }
    } catch (e) {
      debugPrint('Notification permission request failed: $e');
    }
  }

  late final MixAudioHandler audioHandler;
  try {
    audioHandler = await initMixAudioService();
  } catch (e, st) {
    debugPrint('AudioService.init failed: $e\n$st');
    // Still boot UI; playback controls in shade will be unavailable.
    audioHandler = MixAudioHandler();
  }

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Colors.black,
    ),
  );
  runApp(MixPlayerApp(audioHandler: audioHandler));
}

class MixPlayerApp extends StatelessWidget {
  const MixPlayerApp({super.key, required this.audioHandler});
  final MixAudioHandler audioHandler;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState(audioHandler: audioHandler),
      child: MaterialApp(
        title: 'Mix Player',
        debugShowCheckedModeBanner: false,
        theme: mixTheme(),
        home: const ShellScreen(),
      ),
    );
  }
}
