import 'dart:async';
import 'dart:convert';

import 'package:google_identity_services_web/oauth2.dart';
import 'package:web/web.dart' as web;

import 'vault_session.dart';
import 'vault_store.dart';

typedef _DriveToken = ({String value, int expiresAt});

class GoogleDriveSession implements VaultSession {
  static const _clientId = String.fromEnvironment('GOOGLE_WEB_CLIENT_ID');
  static const _storageKey = 'json-notebook.drive-session.$_clientId';
  _DriveToken? _token;

  bool _expired(_DriveToken token) =>
      token.expiresAt <= DateTime.now().millisecondsSinceEpoch;

  void _setToken(_DriveToken? token) {
    _token = token;
    try {
      final storage = web.window.sessionStorage;
      if (token == null) {
        storage.removeItem(_storageKey);
      } else {
        storage.setItem(
          _storageKey,
          jsonEncode({'token': token.value, 'expiresAt': token.expiresAt}),
        );
      }
    } catch (_) {
      // Browsers may disable storage. Keep the current document usable.
    }
  }

  GoogleDriveStore _store(_DriveToken token) => GoogleDriveStore(
    accessToken: () async {
      if (_token != token) return null;
      if (_expired(token)) {
        _setToken(null);
        return null;
      }
      return token.value;
    },
    onUnauthorized: () async {
      if (_token == token) _setToken(null);
      return false;
    },
  );

  @override
  Future<VaultStore?> restore() async {
    try {
      final saved = web.window.sessionStorage.getItem(_storageKey);
      if (saved == null) return null;
      final json = jsonDecode(saved);
      if (json case {'token': final String value, 'expiresAt': final int expiry}
          when value.isNotEmpty) {
        final token = (value: value, expiresAt: expiry);
        if (!_expired(token)) {
          _token = token;
          return _store(token);
        }
      }
    } catch (_) {
      // Invalid data or unavailable browser storage starts a fresh session.
    }
    _setToken(null);
    return null;
  }

  @override
  Future<VaultStore?> signIn() async {
    if (_clientId.isEmpty) {
      throw StateError('Configure GOOGLE_WEB_CLIENT_ID for web sign-in.');
    }
    final result = Completer<_DriveToken?>();
    // google_sign_in_web loads Google Identity Services during plugin registration.
    // Open the popup synchronously while the user gesture is still active.
    late final TokenClient client;
    try {
      client = oauth2.initTokenClient(
        TokenClientConfig(
          client_id: _clientId,
          scope: [driveScope],
          include_granted_scopes: false,
          callback: (response) {
            final value = response.access_token;
            final expiresIn = response.expires_in;
            if (response.error == 'access_denied') {
              result.complete(null);
            } else if (response.error != null ||
                value == null ||
                value.isEmpty ||
                expiresIn == null ||
                expiresIn <= 0 ||
                !response.scope.contains(driveScope)) {
              result.completeError(
                StateError('Google Drive permission was not granted.'),
              );
            } else {
              result.complete((
                value: value,
                expiresAt:
                    DateTime.now().millisecondsSinceEpoch +
                    expiresIn * Duration.millisecondsPerSecond,
              ));
            }
          },
          error_callback: (error) {
            if (error?.type == GoogleIdentityServicesErrorType.popup_closed) {
              result.complete(null);
            } else {
              result.completeError(
                StateError(
                  'Could not open Google sign-in. Allow popups and try again.',
                ),
              );
            }
          },
        ),
      );
    } catch (_) {
      throw StateError(
        'Google sign-in could not load. Check your connection and try again.',
      );
    }
    client.requestAccessToken();
    final token = await result.future;
    if (token == null) return null;
    _setToken(token);
    return _store(token);
  }

  @override
  Future<void> signOut() async => _setToken(null);
}
