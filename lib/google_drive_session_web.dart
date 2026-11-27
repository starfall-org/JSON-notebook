import 'dart:async';

import 'package:google_identity_services_web/oauth2.dart';

import 'vault_session.dart';
import 'vault_store.dart';

class GoogleDriveSession implements VaultSession {
  static const _clientId = String.fromEnvironment('GOOGLE_WEB_CLIENT_ID');
  String? _token;

  @override
  Future<VaultStore?> restore() async => null;

  @override
  Future<VaultStore?> signIn() async {
    if (_clientId.isEmpty) {
      throw StateError('Configure GOOGLE_WEB_CLIENT_ID for web sign-in.');
    }
    final result = Completer<String?>();
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
            if (response.error == 'access_denied') {
              result.complete(null);
            } else if (response.error != null ||
                response.access_token == null ||
                !response.scope.contains(driveScope)) {
              result.completeError(
                StateError('Google Drive permission was not granted.'),
              );
            } else {
              result.complete(response.access_token);
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
    if (token == null || token.isEmpty) return null;
    _token = token;
    return GoogleDriveStore(
      accessToken: () async => _token == token ? token : null,
    );
  }

  @override
  Future<void> signOut() async {
    _token = null;
  }
}
