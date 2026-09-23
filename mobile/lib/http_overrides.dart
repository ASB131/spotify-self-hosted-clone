import 'dart:io';

class MixHttpOverrides extends HttpOverrides {
  MixHttpOverrides({this.allowBadCerts = false});

  bool allowBadCerts;

  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = super.createHttpClient(context);
    client.badCertificateCallback = allowBadCerts ? (cert, host, port) => true : null;
    client.connectionTimeout = const Duration(seconds: 20);
    client.idleTimeout = const Duration(seconds: 30);
    return client;
  }
}

/// Updated whenever the user toggles “Trust server certificate”.
final mixHttpOverrides = MixHttpOverrides();
