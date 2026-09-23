import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../theme.dart';
import 'home_screen.dart';
import 'library_screen.dart';
import 'login_screen.dart';
import 'player_screen.dart';
import 'profile_screen.dart';
import 'search_screen.dart';

class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  int _tab = 0;
  final _homeNav = GlobalKey<NavigatorState>();
  final _searchNav = GlobalKey<NavigatorState>();
  final _libraryNav = GlobalKey<NavigatorState>();
  final _profileNav = GlobalKey<NavigatorState>();

  Future<void> _handleSystemBack() async {
    final nav = switch (_tab) {
      0 => _homeNav.currentState,
      1 => _searchNav.currentState,
      2 => _libraryNav.currentState,
      _ => _profileNav.currentState,
    };
    if (nav != null && nav.canPop()) {
      nav.pop();
      return;
    }
    // Leave the app when already at a tab root.
    SystemNavigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.booting) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: MixColors.green)),
      );
    }
    if (!state.isLoggedIn) {
      return const LoginScreen();
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleSystemBack();
      },
      child: Scaffold(
        body: SafeArea(
          child: IndexedStack(
            index: _tab,
            children: [
              Navigator(
                key: _homeNav,
                onGenerateRoute: (_) => MaterialPageRoute(builder: (_) => const HomeScreen()),
              ),
              Navigator(
                key: _searchNav,
                onGenerateRoute: (_) => MaterialPageRoute(builder: (_) => const SearchScreen()),
              ),
              Navigator(
                key: _libraryNav,
                onGenerateRoute: (_) => MaterialPageRoute(builder: (_) => const LibraryScreen()),
              ),
              Navigator(
                key: _profileNav,
                onGenerateRoute: (_) => MaterialPageRoute(builder: (_) => const ProfileScreen()),
              ),
            ],
          ),
        ),
        bottomNavigationBar: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            MiniPlayerBar(
              onOpen: () {
                Navigator.of(context, rootNavigator: true).push(
                  MaterialPageRoute(builder: (_) => const NowPlayingScreen()),
                );
              },
            ),
            BottomNavigationBar(
              currentIndex: _tab,
              onTap: (i) {
                if (i == _tab) {
                  final nav = switch (i) {
                    0 => _homeNav.currentState,
                    1 => _searchNav.currentState,
                    2 => _libraryNav.currentState,
                    _ => _profileNav.currentState,
                  };
                  nav?.popUntil((r) => r.isFirst);
                } else {
                  setState(() => _tab = i);
                }
              },
              items: const [
                BottomNavigationBarItem(icon: Icon(Icons.home_filled), label: 'Home'),
                BottomNavigationBarItem(icon: Icon(Icons.search), label: 'Search'),
                BottomNavigationBarItem(icon: Icon(Icons.library_music), label: 'Your Library'),
                BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
