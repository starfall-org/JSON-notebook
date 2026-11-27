import 'vault_store.dart';

abstract class VaultSession {
  Future<VaultStore?> restore();
  Future<VaultStore?> signIn();
  Future<void> signOut();
}
