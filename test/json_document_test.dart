import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/json_document.dart';
import 'package:secrets_keep/markdown_to_json.dart';
import 'package:secrets_keep/vault_migration.dart';
import 'package:secrets_keep/vault_store.dart';

void main() {
  test(
    'Requested heading, nested heading, list item, and inline code conversion',
    () {
      const source =
          '# A\n```\nvalue\n```\n# B\n## C\n- D\n   ```e```\n   ```f```\n';
      final json = MarkdownToJson.convert(source);
      expect(json.data, {
        'A': 'value',
        'B': {
          'C': {
            'D': ['e', 'f'],
          },
        },
      });
      expect(
        json.toJson(),
        '{\n  "A": "value",\n  "B": {\n    "C": {\n      "D": [\n        "e",\n        "f"\n      ]\n    }\n  }\n}\n',
      );
    },
  );

  test('Legacy markdown code blocks and bold items become nested native JSON', () {
    const source =
        '# Services\n\n## Production\n\n- **Notes**\n\n    ```env\n    API_URL=https://example.internal\n    TOKEN=demo-value\n    ```\n';
    expect(MarkdownToJson.convert(source).data, {
      'Services': {
        'Production': {
          'Notes': ['API_URL=https://example.internal\nTOKEN=demo-value'],
        },
      },
    });
  });

  test(
    'Unexpected Markdown and key collisions must fail, not destroy content',
    () {
      expect(
        () => MarkdownToJson.convert('# A\nplain content\n'),
        throwsFormatException,
      );
      expect(
        () => MarkdownToJson.convert('# A\n```value```\n# A\n```other```\n'),
        throwsFormatException,
      );
      expect(
        () => MarkdownToJson.convert('# A\n```\nunclosed\n'),
        throwsFormatException,
      );
      expect(
        () => MarkdownToJson.convert('# A\n```one```\n## B\n'),
        throwsFormatException,
      );
    },
  );

  test('Plain JSON is always indented two spaces and ends with newline', () {
    final doc = JsonDocument.parse('{"A":"value","B":{"C":{"D":["e","f"]}}}');
    expect(doc.toJson(), contains('    "C": {'));
    expect(doc.toJson(), endsWith('\n'));
    expect(jsonDecode(doc.toJson()), doc.data);
  });

  test('Add/edit/delete/reorder preserve native object and array types', () {
    var doc = JsonDocument.parse('{"B":{"C":{"D":["e","f"]}},"A":"value"}');
    doc = doc.add(['B', 'C'], 'E', true);
    doc = doc.update(['B', 'C', 'D', 1], 'g');
    doc = doc.reorder(['B', 'C', 'D'], 0, 1);
    doc = doc.update(['B', 'C', 'E'], 42, newKey: 'Count');
    expect(doc.at(['B', 'C']), {
      'D': ['g', 'e'],
      'Count': 42,
    });
    doc = doc.delete(['B', 'C', 'Count']);
    expect(doc.at(['B', 'C']), {
      'D': ['g', 'e'],
    });
    expect(() => doc.add(['B'], 'C', {}), throwsFormatException);
    expect(JsonDocument.parse(doc.toJson()).data, doc.data);
  });

  test(
    'Migration creates a formatted JSON copy while leaving Markdown unmodified',
    () async {
      final store = DemoStore();
      final file = (await store.children('root'))
          .firstWhere((e) => e.name == 'services.md');
      final original = await store.read(file.id);
      final migration = VaultMigration(store);
      final result = await migration.migrate(file);
      expect(result.state, MigrationState.created);
      expect(result.destination.name, 'services.json');
      final formatted = await store.read(result.destination.id);
      expect(formatted, JsonDocument.parse(formatted).toJson());
      expect((jsonDecode(formatted) as Map).containsKey('format'), isFalse);
      expect(await store.read(file.id), original);
      final again = await migration.migrate(file);
      expect(again.state, MigrationState.skipped);
      await store.write(result.destination.id, '{"Different": true}\n');
      expect(() async => migration.migrate(file), throwsStateError);
      expect(await store.read(file.id), original);
    },
  );

  test('Recursive conversion handles nested files sequentially', () async {
    final store = DemoStore();
    final report = await VaultMigration(store).migrateTree('root');
    expect(report.created, 3);
    expect(report.errors, isEmpty);
    expect((await VaultMigration(store).migrateTree('root')).skipped, 3);
    expect(
      (await store.children('cloud')).any((e) => e.name == 'main.json'),
      isTrue,
    );
  });
}
