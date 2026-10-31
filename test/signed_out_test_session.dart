import 'package:secrets_keep/main.dart';

/// Deterministic session for UI tests that intentionally start signed out.
/// Do not depend on the Google plugin's asynchronous platform restore.
class SignedOutTestSession implements VaultSession {
  const SignedOutTestSession();

  @override
  Future<VaultStore?> restore() async => null;

  @override
  Future<VaultStore?> signIn() async => null;

  @override
  Future<void> signOut() async {}
}
