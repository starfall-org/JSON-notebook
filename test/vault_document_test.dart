import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/vault_document.dart';
import 'package:secrets_keep/vault_migration.dart';
import 'package:secrets_keep/vault_store.dart';

void main() {
  const source =
      '# Heading\n\n## Branch\n\n- **Token**\n\n'
      '  ```env\n  SECRET=value\n  ```\n\n'
      '### Nested\n\nMisc **Markdown**\n\n---\n\n'
      '    indented ordinary content\n';

  test('JSON conversion is byte-for-byte lossless for nested dialect', () {
    final document = VaultDocument(source);
    expect(document.blocks.map((b) => b.raw).join(), source);
    final json = document.toJson();
    final converted = VaultDocument.fromJson(json);
    expect(converted.markdown, source);
    expect(
      converted.blocks.where((b) => b.kind == BlockKind.heading).length,
      3,
    );
    expect(converted.blocks.where((b) => b.kind == BlockKind.item).length, 1);
    final code = converted.blocks.firstWhere((b) => b.kind == BlockKind.code);
    expect(code.value, 'SECRET=value');
    expect(code.language, 'env');
    expect(code.indent, '  ');
  });

  test('JSON validation refuses mismatched source and block structure', () {
    final json =
        jsonDecode(VaultDocument(source).toJson()) as Map<String, dynamic>;
    json['sourceMarkdown'] = 'tampered';
    expect(
      () => VaultDocument.fromJson(jsonEncode(json)),
      throwsFormatException,
    );
  });

  test('Editing a heading preserves all descendants and code blocks', () {
    final doc = VaultDocument(source);
    final branch = doc.blocks.firstWhere(
      (b) => b.kind == BlockKind.heading && b.level == 2,
    );
    final edited = doc.edit(branch, 'New Branch');
    expect(edited.markdown, contains('## New Branch'));
    expect(edited.markdown, contains('  SECRET=value'));
    expect(VaultDocument.fromJson(edited.toJson()).markdown, edited.markdown);
  });

  test('Deleting an item removes its code but keeps the next heading', () {
    final doc = VaultDocument(source);
    final item = doc.blocks.firstWhere((b) => b.kind == BlockKind.item);
    final result = doc.delete(item);
    expect(result.markdown, isNot(contains('Token')));
    expect(result.markdown, isNot(contains('SECRET=value')));
    expect(result.markdown, contains('### Nested'));
  });

  test('Moving a heading preserves its subtree and adjusts levels', () {
    const text =
        '# Main\n\n## Inner\n\n- **Token**\n\n```txt\n123\n```\n\n# Other\n';
    final doc = VaultDocument(text);
    final main = doc.blocks.first;
    final other = doc.blocks.lastWhere((b) => b.kind == BlockKind.heading);
    final moved = doc.move(main, other, DropMode.inside);
    expect(moved.markdown, contains('## Main'));
    expect(moved.markdown, contains('### Inner'));
    expect(moved.markdown, contains('- **Token**'));
    expect(moved.markdown, contains('123'));
  });

  test('Adding a child code block indents it consistently', () {
    final doc = VaultDocument('- **Password**\n');
    final child = doc.add(
      BlockKind.code,
      'key\nvalue',
      parent: doc.blocks.first,
      language: 'text',
    );
    expect(
      child.blocks.firstWhere((b) => b.kind == BlockKind.code).indent,
      '  ',
    );
    expect(child.markdown, contains('  ```text'));
  });

  test('Item editor saves multiple codes atomically without touching siblings', () {
    const source =
        '# Vault\n\n- **API**\n\n  ```env\n  TOKEN=old\n  ```\n\n  ```text\n  note\n  ```\n\n- **Second**\n\n  ```txt\n  keep me\n  ```\n';
    final doc = VaultDocument(source);
    final item = doc.blocks.firstWhere((b) => b.kind == BlockKind.item);
    final originalCodes = doc.blocks
        .where(
          (b) => b.kind == BlockKind.code && doc.parentOf(b)?.id == item.id,
        )
        .toList();
    expect(originalCodes.length, 2);
    final changed = doc.editItem(item, 'Cloud API', [
      ItemCodeEdit(
        start: originalCodes.first.start,
        value: 'TOKEN=new',
        language: 'env',
      ),
      const ItemCodeEdit(value: 'new snippet', language: 'bash'),
    ]);
    expect(changed.markdown, contains('- **Cloud API**'));
    expect(changed.markdown, contains('TOKEN=new'));
    expect(changed.markdown, isNot(contains('  note\n')));
    expect(changed.markdown, contains('  ```bash\n  new snippet\n  ```'));
    expect(changed.markdown, contains('- **Second**'));
    expect(changed.markdown, contains('keep me'));
    expect(VaultDocument.fromJson(changed.toJson()).markdown, changed.markdown);
  });

  test(
    'Unmanaged Markdown, unclosed fences and CRLF survive JSON migration',
    () {
      final cases = [
        'Text before heading\n\n# Heading\n\n> quote\n\n~~strike~~\n',
        '# Title\r\n\r\n- **Item**\r\n\r\n    ```sql\r\n    select *\r\n    ```\r\n',
        'prefix\n\n```\nunclosed\n',
        '# headings\n## deep\n\n---\n\n    unknown\n\n~~~not our fence~~~',
        '***\n___\n---\n\n# H\n\ntext\n',
      ];
      for (final markdown in cases) {
        final doc = VaultDocument(markdown);
        expect(doc.blocks.map((b) => b.raw).join(), markdown);
        expect(VaultDocument.fromJson(doc.toJson()).markdown, markdown);
      }
    },
  );

  test('Editing an item rejects foreign or duplicated block references', () {
    final doc = VaultDocument('- **A**\n\n  ```x\n  one\n  ```\n\n- **B**\n');
    final item = doc.blocks.first;
    final code = doc.blocks.firstWhere((b) => b.kind == BlockKind.code);
    expect(
      () => doc.editItem(item, 'A', [
        ItemCodeEdit(start: code.start, value: 'a'),
        ItemCodeEdit(start: code.start, value: 'b'),
      ]),
      throwsFormatException,
    );
    expect(() => doc.editItem(item, '', []), throwsFormatException);
  });

  test('Migrating a Markdown file creates a verified JSON copy, never overwrites original', () async {
    final store = DemoStore();
    final file = (await store.children('root'))
        .firstWhere((f) => f.name == 'services.md');
    final initial = await store.read(file.id);
    final migration = VaultMigration(store);
    final result = await migration.migrate(file);
    expect(result.state, MigrationState.created);
    final json = await store.read(result.destination.id);
    expect(VaultDocument.fromJson(json).markdown, initial);
    expect(await store.read(file.id), initial);
    final repeated = await migration.migrate(file);
    expect(repeated.state, MigrationState.skipped);
    expect(
      (await store.children('root'))
          .where((f) => f.name == 'services.json')
          .length,
      1,
    );
    await store.write(result.destination.id, VaultDocument('changed').toJson());
    expect(() async => migration.migrate(file), throwsStateError);
    expect(await store.read(file.id), initial);
  });

  test(
    'Recursive migration covers nested folders without touching Markdown',
    () async {
      final store = DemoStore();
      final before = await store.read('main');
      final result = await VaultMigration(store).migrateTree('root');
      expect(result.created, 3);
      expect(result.skipped, 0);
      expect(result.errors, isEmpty);
      expect(await store.read('main'), before);
      final nested = await store.children('cloud');
      expect(nested.any((e) => e.name == 'main.json'), true);
      final repeat = await VaultMigration(store).migrateTree('root');
      expect(repeat.created, 0);
      expect(repeat.skipped, 3);
    },
  );
}

// UI interactions are exercised separately in document_view_test.dart.

// Additional round-trip and editing cases guard data safety for migrations.
