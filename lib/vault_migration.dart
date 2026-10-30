import 'vault_document.dart';
import 'vault_store.dart';

enum MigrationState { created, skipped }

class MigrationRecord {
  const MigrationRecord(this.state, this.source, this.destination);
  final MigrationState state;
  final DriveEntry source;
  final DriveEntry destination;
}

class MigrationReport {
  int created = 0;
  int skipped = 0;
  final List<String> errors = [];
  String get description =>
      'Created: $created · already migrated: $skipped · errors: ${errors.length}';
}

/// Never modifies/deletes the original .md file. A neighboring .json file is
/// created only if no file of that name already exists.
class VaultMigration {
  const VaultMigration(this.store);
  final VaultStore store;

  Future<MigrationRecord> migrate(DriveEntry source) async {
    if (source.isFolder || !source.name.toLowerCase().endsWith('.md')) {
      throw const FormatException('Only Markdown documents can be migrated');
    }
    final parent = source.parentId;
    if (parent == null) throw const FormatException('Source folder is unknown');
    final markdown = await store.read(source.id);
    final converted = VaultDocument(markdown).toJson();
    if (VaultDocument.fromJson(converted).markdown != markdown) {
      throw const FormatException('Lossless Markdown conversion failed');
    }
    final destinationName =
        '${source.name.substring(0, source.name.length - 3)}.json';
    final sibling = (await store.children(parent))
        .where(
          (entry) => entry.name.toLowerCase() == destinationName.toLowerCase(),
        )
        .toList();
    if (sibling.isNotEmpty) {
      if (sibling.length > 1 || sibling.first.isFolder) {
        throw StateError('Conflicting destination: $destinationName');
      }
      final existing = VaultDocument.fromJson(
        await store.read(sibling.first.id),
      );
      if (existing.markdown != markdown) {
        throw StateError(
          'Destination exists with different content: $destinationName',
        );
      }
      return MigrationRecord(MigrationState.skipped, source, sibling.first);
    }

    final created = await store.create(parent, destinationName);
    try {
      await store.write(created.id, converted);
    } catch (_) {
      // Only remove the newly created file. The original is never touched.
      try {
        await store.remove(created.id);
      } catch (_) {
        /* Leave recoverable artifact. */
      }
      rethrow;
    }
    // Verify the actual persisted file before calling conversion successful.
    final saved = VaultDocument.fromJson(await store.read(created.id));
    if (saved.markdown != markdown) {
      throw StateError('Write verification failed: $destinationName');
    }
    return MigrationRecord(MigrationState.created, source, created);
  }

  /// Reversible export of a structured JSON document to Markdown, without
  /// overwriting an existing .md sibling.
  Future<MigrationRecord> exportMarkdown(DriveEntry source) async {
    if (source.isFolder || !source.name.toLowerCase().endsWith('.json')) {
      throw const FormatException('Only Secrets Keep JSON can be exported');
    }
    final parent = source.parentId;
    if (parent == null) throw const FormatException('Source folder is unknown');
    final markdown = VaultDocument.fromJson(await store.read(source.id))
        .markdown;
    final destinationName =
        '${source.name.substring(0, source.name.length - 5)}.md';
    final sibling = (await store.children(parent))
        .where(
          (item) => item.name.toLowerCase() == destinationName.toLowerCase(),
        )
        .toList();
    if (sibling.isNotEmpty) {
      if (sibling.length != 1 ||
          sibling.first.isFolder ||
          await store.read(sibling.first.id) != markdown) {
        throw StateError(
          'A different Markdown file already exists: $destinationName',
        );
      }
      return MigrationRecord(MigrationState.skipped, source, sibling.first);
    }
    final created = await store.create(parent, destinationName);
    try {
      await store.write(created.id, markdown);
    } catch (_) {
      try {
        await store.remove(created.id);
      } catch (_) {
        /* Avoid masking original error. */
      }
      rethrow;
    }
    if (await store.read(created.id) != markdown) {
      throw StateError('Markdown export verification failed: $destinationName');
    }
    return MigrationRecord(MigrationState.created, source, created);
  }

  /// Depth-first and strictly sequential to bound Drive requests / memory use.
  Future<MigrationReport> migrateTree(
    String folderId, {
    void Function(String file)? onProgress,
  }) async {
    final report = MigrationReport();
    final seen = <String>{};
    Future<void> walk(String id) async {
      if (!seen.add(id)) return;
      final children = await store.children(id);
      for (final entry in children) {
        if (entry.isFolder) {
          try {
            await walk(entry.id);
          } catch (error) {
            report.errors.add('${entry.name}: $error');
          }
        } else if (entry.name.toLowerCase().endsWith('.md')) {
          onProgress?.call(entry.name);
          try {
            final converted = await migrate(entry);
            if (converted.state == MigrationState.created) {
              report.created++;
            } else {
              report.skipped++;
            }
          } catch (error) {
            report.errors.add('${entry.name}: $error');
          }
        }
      }
    }

    await walk(folderId);
    return report;
  }
}
