import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/vault_store.dart';
import 'package:secrets_keep/vault_naming.dart';

class _InstrumentedDemo implements VaultStore {
  final DemoStore source = DemoStore();
  int lists = 0, reads = 0;
  bool offline = false;
  @override
  Future<DriveEntry> root() => source.root();
  @override
  Future<List<DriveEntry>> children(String folderId) async {
    lists++;
    if (offline) throw StateError('No connection');
    return source.children(folderId);
  }

  @override
  Future<String> read(String fileId) async {
    reads++;
    if (offline) throw StateError('No connection');
    return source.read(fileId);
  }

  @override
  Future<void> write(String fileId, String content) async {
    if (offline) throw StateError('No connection');
    await source.write(fileId, content);
  }

  @override
  Future<DriveEntry> create(
    String folderId,
    String name, {
    bool folder = false,
  }) => source.create(folderId, name, folder: folder);
  @override
  Future<void> remove(String id) => source.remove(id);
  @override
  Future<void> rename(String id, String name) => source.rename(id, name);
}

void main() {
  test(
    'Cache loads demo root, reuses lists and refreshes on request',
    () async {
      final underlying = _InstrumentedDemo();
      final cache = CachedVaultStore(underlying);
      final root = await cache.root();
      expect((await cache.children(root.id)).length, 3);
      expect((await cache.children(root.id)).length, 3);
      expect(underlying.lists, 1);
      await cache.refreshChildren(root.id);
      expect(underlying.lists, 2);
      await cache.create(root.id, 'new.md');
      expect((await cache.children(root.id)).length, 4);
      expect(underlying.lists, 3);
    },
  );

  test('Stale in-memory content can be read offline, but failed writes are not cached', () async {
    final underlying = _InstrumentedDemo();
    final cache = CachedVaultStore(underlying, ttl: Duration.zero);
    expect(await cache.read('github'), contains('# GitHub'));
    underlying.offline = true;
    expect(await cache.read('github'), contains('# GitHub'));
    expect(() => cache.write('github', 'should not cache'), throwsStateError);
    underlying.offline = false;
    expect(await cache.read('github'), contains('# GitHub'));
    expect(await cache.refreshFile('github'), contains('# GitHub'));
    expect(underlying.reads, 4);
  });

  test('Names prevent silent file format conversion and case-insensitive duplicates', () {
    expect(
      validateEntryName(' notes.MD ', originalName: 'notes.md'),
      'notes.MD',
    );
    expect(
      () => validateEntryName('notes.json', originalName: 'notes.md'),
      throwsFormatException,
    );
    expect(
      () => validateEntryName('../evil', folder: true),
      throwsFormatException,
    );
    expect(
      () => ensureUniqueName(['secrets.json'], 'Secrets.JSON'),
      throwsFormatException,
    );
  });
}
