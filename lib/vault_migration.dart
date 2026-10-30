import 'json_document.dart';
import 'markdown_to_json.dart';
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
      'Created: $created · already converted: $skipped · errors: ${errors.length}';
}

/// Import Markdown only on explicit request. Result is a plain formatted JSON
/// object. Source .md files are never modified, renamed or deleted.
class VaultMigration {
  const VaultMigration(this.store);
  final VaultStore store;

  Future<MigrationRecord> migrate(DriveEntry source) async {
    if (source.isFolder || !source.name.toLowerCase().endsWith('.md')) {
      throw const FormatException('Only Markdown files can be converted');
    }
    final parent = source.parentId;
    if (parent == null) throw const FormatException('Source folder missing');
    final formatted = MarkdownToJson.convert(await store.read(source.id))
        .toJson();
    final destinationName =
        '${source.name.substring(0, source.name.length - 3)}.json';
    final sibling = (await store.children(parent))
        .where(
          (entry) => entry.name.toLowerCase() == destinationName.toLowerCase(),
        )
        .toList();
    if (sibling.isNotEmpty) {
      if (sibling.length != 1 || sibling.first.isFolder) {
        throw StateError('Conflicting destination: $destinationName');
      }
      // Existing destination must be identical; no silent replacement.
      if (JsonDocument.parse(await store.read(sibling.first.id)).toJson() !=
          formatted) {
        throw StateError('Existing JSON differs: $destinationName');
      }
      return MigrationRecord(MigrationState.skipped, source, sibling.first);
    }
    final created = await store.create(parent, destinationName);
    try {
      await store.write(created.id, formatted);
      if (JsonDocument.parse(await store.read(created.id)).toJson() !=
          formatted) {
        throw StateError('JSON verification failed for $destinationName');
      }
    } catch (_) {
      try {
        await store.remove(created.id);
      } catch (_) {
        /* Keep the cause. */
      }
      rethrow;
    }
    return MigrationRecord(MigrationState.created, source, created);
  }

  /// Sequential traversal avoids excessive memory/Drive requests.
  Future<MigrationReport> migrateTree(
    String folderId, {
    void Function(String file)? onProgress,
  }) async {
    final report = MigrationReport();
    final seen = <String>{};
    Future<void> walk(String folder) async {
      if (!seen.add(folder)) return;
      final children = await store.children(folder);
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
            final conversion = await migrate(entry);
            if (conversion.state == MigrationState.created) {
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
