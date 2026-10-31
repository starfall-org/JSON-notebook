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
        'A': ['value'],
        'B': {
          'C': {
            'D': ['e', 'f'],
          },
        },
      });
      expect(
        json.toJson(),
        '{\n  "A": [\n    "value"\n  ],\n  "B": {\n    "C": {\n      "D": [\n        "e",\n        "f"\n      ]\n    }\n  }\n}\n',
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
        returnsNormally,
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

  test('Top-level bold list item without heading becomes empty JSON key', () {
    expect(MarkdownToJson.convert('- **x**\n').data, {'x': ''});
    expect(MarkdownToJson.convert('- x\n- **y**\n').data, {'x': '', 'y': ''});
  });

  test('Top-level heading and list item with empty code are equivalent', () {
    const heading = '# abc\n```\n```\n';
    const item = '- abc\n```\n```\n';
    final headingDocument = MarkdownToJson.convert(heading);
    final itemDocument = MarkdownToJson.convert(item);
    expect(headingDocument.data, {
      'abc': [''],
    });
    expect(itemDocument.data, headingDocument.data);
    expect(itemDocument.toJson(), headingDocument.toJson());
  });

  test('Top-level headings and list items also match for nonempty code', () {
    const heading = '# abc\n```txt\ncontent\n```\n';
    const item = '- **abc**\n```txt\ncontent\n```\n';
    expect(MarkdownToJson.convert(item).data, {
      'abc': ['content'],
    });
    expect(
      MarkdownToJson.convert(item).toJson(),
      MarkdownToJson.convert(heading).toJson(),
    );
  });

  test('Top-level list item with one fenced block retains array content', () {
    const source = '- **x**\n```text\n  content\n```\n';
    expect(MarkdownToJson.convert(source).data, {
      'x': ['content'],
    });
  });

  test('Top-level items support multiple code values and later headings', () {
    const source =
        '- **x**\n```first```\n```second```\n'
        '- [Docs](https://example.com)\n```link```\n'
        '# Section\n- Nested\n```value```\n';
    expect(MarkdownToJson.convert(source).data, {
      'x': ['first', 'second'],
      '[Docs](https://example.com)': ['link'],
      'Section': {
        'Nested': ['value'],
      },
    });
  });

  test('Top-level duplicate keys are rejected without losing content', () {
    expect(
      () => MarkdownToJson.convert('- **x**\n- x\n'),
      throwsFormatException,
    );
    expect(() => MarkdownToJson.convert('- x\n# x\n'), throwsFormatException);
  });

  test('One fenced code block becomes a singleton array', () {
    const source = '# Credentials\n```env\n  TOKEN=abc\n  SECOND=def\n```\n';
    expect(MarkdownToJson.convert(source).data, {
      'Credentials': ['TOKEN=abc\nSECOND=def'],
    });
  });

  test('One inline code block becomes a singleton array under an item', () {
    const source = '# Vault\n## Production\n- **ApiKey**\n```SECRET_raw```\n';
    expect(MarkdownToJson.convert(source).data, {
      'Vault': {
        'Production': {
          'ApiKey': ['SECRET_raw'],
        },
      },
    });
  });

  test('Keeps Markdown hyperlinks in JSON key names during conversion', () {
    const source =
        '# **[Docs](https://example.com/a?x=1&y=2)**\n'
        '- **[Api](https://service.example/api)**\n'
        '```env\nTOKEN=a_b-c\n```\n';
    final result = MarkdownToJson.convert(source);
    expect(result.data, {
      '[Docs](https://example.com/a?x=1&y=2)': {
        '[Api](https://service.example/api)': ['TOKEN=a_b-c'],
      },
    });
    expect(JsonDocument.parse(result.toJson()).data, result.data);
  });

  test('Markdown tables are cleaned while their cells survive', () {
    const source =
        '# Vault\n| Environment | Key |\n| :--- | ---: |\n'
        '| Prod | s3cr3t |\n| Stage | value\\|tail |\n';
    expect(MarkdownToJson.convert(source).data, {
      'Vault': [
        'Environment: Prod; Key: s3cr3t\n'
            'Environment: Stage; Key: value|tail',
      ],
    });
  });

  test(
    'Ignores padding/HTML wrappers and decoration while preserving content',
    () {
      const source =
          '# Vault\n- Notes\n<div style="padding:16px">\n'
          '> **Important** login\n</div>\n---\n'
          '<span style="padding:4px">alpha</span>\n';
      expect(MarkdownToJson.convert(source).data, {
        'Vault': {
          'Notes': ['Important login\nalpha'],
        },
      });
    },
  );

  test('Unknown angle-bracket content is not deleted by markup cleanup', () {
    const source = '# Vault\n<API_TOKEN> = live\n';
    expect(MarkdownToJson.convert(source).data, {
      'Vault': ['<API_TOKEN> = live'],
    });
  });

  test('Markdown symbols inside fenced code are preserved verbatim', () {
    const source =
        '# Vault\n```text\n| A | B |\n&tag;<secret>\n[a](https://x.example)\n```\n';
    expect(MarkdownToJson.convert(source).data, {
      'Vault': ['| A | B |\n&tag;<secret>\n[a](https://x.example)'],
    });
  });

  test('Plain paragraphs no longer abort a conversion', () {
    expect(MarkdownToJson.convert('# A\nplain content\n').data, {
      'A': ['plain content'],
    });
  });

  test('Plain JSON is always indented two spaces and ends with newline', () {
    final doc = JsonDocument.parse('{"A":"value","B":{"C":{"D":["e","f"]}}}');
    expect(doc.toJson(), contains('    "C": {'));
    expect(doc.toJson(), endsWith('\n'));
    expect(jsonDecode(doc.toJson()), doc.data);
  });

  test(
    'Markdown import uses empty strings without content and arrays for code',
    () {
      const source =
          '# Empty\n# Tree\n## Node\n- Blank\n- Single\n```text\nonly\n```\n';
      expect(MarkdownToJson.convert(source).data, {
        'Empty': '',
        'Tree': {
          'Node': {
            'Blank': '',
            'Single': ['only'],
          },
        },
      });
    },
  );

  test('Field count and nested promotion follow JSON value rules', () {
    expect(JsonDocument.valueFromFields([]), '');
    expect(JsonDocument.valueFromFields(['e']), 'e');
    expect(JsonDocument.valueFromFields(['e', 'f']), ['e', 'f']);
    var doc = JsonDocument.empty().addKey([], 'A', []);
    expect(doc.data, {'A': ''});
    doc = doc.addKey(['A'], 'B', ['value']);
    expect(doc.data, {
      'A': {'B': 'value'},
    });
    doc = doc.addKey(['A'], 'C', ['e', 'f']);
    expect(doc.data, {
      'A': {
        'B': 'value',
        'C': ['e', 'f'],
      },
    });
    expect(() => doc.addKey(['A', 'C'], 'D', []), throwsFormatException);
    expect(JsonDocument.parse(doc.toJson()).data, doc.data);
  });

  test('Add/edit/delete/reorder preserve structures with string values', () {
    var doc = JsonDocument.parse('{"B":{"C":{"D":["e","f"]}},"A":"value"}');
    doc = doc.add(['B', 'C'], 'E', 'enabled');
    doc = doc.update(['B', 'C', 'D', 1], 'g');
    doc = doc.reorder(['B', 'C', 'D'], 0, 1);
    doc = doc.update(['B', 'C', 'E'], '42', newKey: 'Count');
    expect(doc.at(['B', 'C']), {
      'D': ['g', 'e'],
      'Count': '42',
    });
    doc = doc.delete(['B', 'C', 'Count']);
    expect(doc.at(['B', 'C']), {
      'D': ['g', 'e'],
    });
    expect(() => doc.add(['B'], 'C', {}), throwsFormatException);
    expect(JsonDocument.parse(doc.toJson()).data, doc.data);
  });

  test(
    'Reject non-string primitive values instead of silently altering data',
    () {
      for (final raw in [
        '{"x": 42}',
        '{"x": true}',
        '{"x": false}',
        '{"x": null}',
        '{"x": ["a", 1]}',
        '{"x": {"nested": 2.5}}',
      ]) {
        expect(() => JsonDocument.parse(raw), throwsFormatException);
      }
      final doc = JsonDocument.parse('{"a": "1", "b": ["2"]}');
      expect(() => doc.add([], 'number', 42), throwsFormatException);
      expect(() => doc.update(['a'], false), throwsFormatException);
      expect(() => doc.update(['b', 0], null), throwsFormatException);
      expect(doc.toJson(), contains('"a": "1"'));
    },
  );

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
      await store.write(result.destination.id, '{"Different": "value"}\n');
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
