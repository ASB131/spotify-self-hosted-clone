import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_state.dart';
import 'theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _server = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _localError;

  @override
  void initState() {
    super.initState();
    final api = context.read<AppState>().api;
    _server.text = api.baseUrl.isNotEmpty ? api.baseUrl : 'http://192.168.1.177:8010';
  }

  @override
  void dispose() {
    _server.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _localError = null);
    try {
      await context.read<AppState>().login(
            serverUrl: _server.text,
            email: _email.text,
            password: _password.text,
          );
    } catch (e) {
      setState(() => _localError = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = context.watch<AppState>().busy;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
          children: [
            const Text(
              'Mix player',
              style: TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: MixColors.white),
            ),
            const SizedBox(height: 8),
            const Text(
              'Sign in to your self-hosted server',
              style: TextStyle(color: MixColors.muted),
            ),
            const SizedBox(height: 32),
            TextField(
              controller: _server,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'Server URL',
                hintText: 'http://192.168.1.x:8010',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
              onSubmitted: (_) => busy ? null : _submit(),
            ),
            if (_localError != null) ...[
              const SizedBox(height: 12),
              Text(_localError!, style: const TextStyle(color: Colors.redAccent)),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: busy ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: MixColors.green,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: const StadiumBorder(),
              ),
              child: busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                    )
                  : const Text('Log in', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
            const SizedBox(height: 16),
            const Text(
              'Use the API port (default 8000 / 8010), not only the web UI port, unless your reverse proxy serves /api on the same host.',
              style: TextStyle(color: MixColors.muted, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
