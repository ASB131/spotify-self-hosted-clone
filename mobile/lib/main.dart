import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:provider/provider.dart';

import 'app_state.dart';
import 'http_overrides.dart';
import 'screens/shell_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = mixHttpOverrides;

  // Lock-screen controls need AudioServiceActivity. Never block app launch if init fails.
  try {
    await JustAudioBackground.init(
      androidNotificationChannelId: 'com.mixplayer.channel.audio',
      androidNotificationChannelName: 'Mix Player',
      androidNotificationOngoing: true,
      androidShowNotificationBadge: true,
    );
  } catch (e, st) {
    debugPrint('JustAudioBackground.init failed (continuing without lock-screen controls): $e\n$st');
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
