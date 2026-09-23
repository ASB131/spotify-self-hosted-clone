import 'package:flutter/material.dart';

class MixColors {
  static const bg = Color(0xFF121212);
  static const surface = Color(0xFF181818);
  static const card = Color(0xFF282828);
  static const green = Color(0xFF1DB954);
  static const muted = Color(0xFFB3B3B3);
  static const white = Color(0xFFFFFFFF);
}

ThemeData mixTheme() {
  final base = ThemeData(
    brightness: Brightness.dark,
    useMaterial3: true,
    scaffoldBackgroundColor: MixColors.bg,
    colorScheme: const ColorScheme.dark(
      primary: MixColors.green,
      surface: MixColors.surface,
      onPrimary: Colors.black,
    ),
  );
  return base.copyWith(
    appBarTheme: const AppBarTheme(
      backgroundColor: MixColors.bg,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: MixColors.white),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: Color(0xFF000000),
      selectedItemColor: MixColors.white,
      unselectedItemColor: MixColors.muted,
      type: BottomNavigationBarType.fixed,
      elevation: 0,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: MixColors.card,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
      hintStyle: const TextStyle(color: MixColors.muted),
    ),
  );
}

String formatDuration(int? seconds) {
  if (seconds == null || seconds <= 0) return '0:00';
  final m = seconds ~/ 60;
  final s = seconds % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}
