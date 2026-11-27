import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'vault_session.dart';
import 'vault_store.dart';

class GoogleDriveSession implements VaultSession {
  final _google = GoogleSignIn(scopes: [driveScope]);

  GoogleDriveStore? _store(GoogleSignInAccount? account) {
    if (account == null) return null;
    GoogleSignInAccount activeAccount = account;
    return GoogleDriveStore(
      accessToken: () async => (await activeAccount.authentication).accessToken,
      onUnauthorized: () async {
        try {
          await activeAccount.clearAuthCache();
          final renewed = await _google.signInSilently(reAuthenticate: true);
          if (renewed == null || renewed.id != account.id) return false;
          activeAccount = renewed;
          return true;
        } on PlatformException {
          return false;
        }
      },
    );
  }

  @override
  Future<VaultStore?> restore() async => _store(await _google.signInSilently());

  @override
  Future<VaultStore?> signIn() async => _store(await _google.signIn());

  @override
  Future<void> signOut() async {
    await _google.signOut();
  }
}
