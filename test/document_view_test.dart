import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/document_view.dart';
import 'package:secrets_keep/json_document.dart';

void main() {
  testWidgets(
    'Deep borders remain close and toolbar stays level with key title',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final doc = JsonDocument.parse(
        '{"A":{"B":{"C":{"D":{"E":{"F":{"G":"value"}}}}}}}',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: JsonDocumentView(document: doc, onSave: (_) async => true),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final paths = [
        '["A"]',
        '["A","B"]',
        '["A","B","C"]',
        '["A","B","C","D"]',
        '["A","B","C","D","E"]',
        '["A","B","C","D","E","F"]',
        '["A","B","C","D","E","F","G"]',
      ];
      final rectangles = [
        for (final path in paths)
          tester.getRect(find.byKey(ValueKey('json-$path'))),
      ];
      for (var i = 1; i < rectangles.length; i++) {
        expect(
          rectangles[i].left - rectangles[i - 1].left,
          lessThanOrEqualTo(9),
        );
        expect(
          rectangles[i - 1].right - rectangles[i].right,
          lessThanOrEqualTo(9),
        );
      }
      expect(rectangles.last.width, greaterThan(240));
      final key = tester.getRect(find.text('G'));
      final add = tester.getRect(find.byTooltip('Add to G'));
      final edit = tester.getRect(find.byTooltip('Edit G'));
      expect((key.center.dy - add.center.dy).abs(), lessThan(10));
      expect((key.center.dy - edit.center.dy).abs(), lessThan(10));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Values have no independent action bars or array index labels', (
    tester,
  ) async {
    final doc = JsonDocument.parse('{"A":"value","B":{"C":{"D":["e","f"]}}}');
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: JsonDocumentView(document: doc, onSave: (_) async => true),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final outer = find.byKey(const ValueKey('json-["B"]'));
    expect(find.ancestor(of: find.text('C'), matching: outer), findsOneWidget);
    expect(find.ancestor(of: find.text('D'), matching: outer), findsOneWidget);
    expect(find.ancestor(of: find.text('e'), matching: outer), findsOneWidget);
    expect(find.byTooltip('Add to D'), findsOneWidget);
    expect(find.text('[1]'), findsNothing);
    expect(find.text('[2]'), findsNothing);
    expect(find.byTooltip('Copy value'), findsNothing);
    expect(find.byType(PopupMenuButton), findsNothing);
  });

  testWidgets(
    'No value fields creates an empty string; one field creates string',
    (tester) async {
      var doc = JsonDocument.empty();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, update) => JsonDocumentView(
                document: doc,
                onSave: (next) async {
                  update(() => doc = next);
                  return true;
                },
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Add entry'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('json-key-input')), 'A');
      expect(find.byKey(const ValueKey('json-value-0')), findsNothing);
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(doc.at(['A']), '');

      await tester.tap(find.byTooltip('Edit A'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add value'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('json-value-0')),
        'value',
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(doc.at(['A']), 'value');
      expect(doc.toJson(), '{\n  "A": "value"\n}\n');
    },
  );

  testWidgets(
    'Two value fields produce a list; editing back to one produces string',
    (tester) async {
      var doc = JsonDocument.empty();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, update) => JsonDocumentView(
                document: doc,
                onSave: (next) async {
                  update(() => doc = next);
                  return true;
                },
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Add entry'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('json-key-input')), 'D');
      await tester.tap(find.text('Add value'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('json-value-0')), 'e');
      await tester.tap(find.text('Add value'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('json-value-1')), 'f');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(doc.at(['D']), ['e', 'f']);
      expect(find.text('[1]'), findsNothing);

      await tester.tap(find.byTooltip('Edit D'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Remove value field').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(doc.at(['D']), 'e');
    },
  );

  testWidgets('The single Add promotes empty string to nested key', (
    tester,
  ) async {
    var doc = JsonDocument.empty();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, update) => JsonDocumentView(
              document: doc,
              onSave: (next) async {
                update(() => doc = next);
                return true;
              },
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.byTooltip('Add entry'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('json-key-input')),
      'Parent',
    );
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Add to Parent'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('json-key-input')),
      'Child',
    );
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(doc.data, {
      'Parent': {'Child': ''},
    });
    expect(find.byTooltip('Add to Parent'), findsOneWidget);
    expect(find.byTooltip('Add section to Parent'), findsNothing);
    expect(find.byTooltip('Add list to Parent'), findsNothing);
  });

  testWidgets('Delete lives inside Edit and requires confirmation', (
    tester,
  ) async {
    var doc = JsonDocument.parse('{"A":"value","B":{"C":"keep"}}');
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, update) => JsonDocumentView(
              document: doc,
              onSave: (next) async {
                update(() => doc = next);
                return true;
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byTooltip('Delete A'), findsNothing);
    expect(find.byTooltip('Delete B'), findsNothing);
    await tester.tap(find.byTooltip('Edit A'));
    await tester.pumpAndSettle();
    expect(find.text('Delete'), findsOneWidget);
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(find.text('Delete A?'), findsOneWidget);
    expect(doc.at(['A']), 'value');
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(doc.at(['A']), 'value');

    await tester.tap(find.byTooltip('Edit A'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(doc.data, {
      'B': {'C': 'keep'},
    });
    expect(find.text('A'), findsNothing);
  });

  testWidgets('Delete in nested Edit removes only selected branch', (
    tester,
  ) async {
    var doc = JsonDocument.parse(
      '{"A":{"B":"remove","C":"retain"},"D":"other"}',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, update) => JsonDocumentView(
              document: doc,
              onSave: (next) async {
                update(() => doc = next);
                return true;
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Edit B'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(doc.data, {
      'A': {'C': 'retain'},
      'D': 'other',
    });
  });

  testWidgets('Add dialog does not expose Delete', (tester) async {
    final doc = JsonDocument.empty();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: JsonDocumentView(document: doc, onSave: (_) async => true),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Add entry'));
    await tester.pumpAndSettle();
    expect(find.text('Delete'), findsNothing);
    expect(find.text('Save'), findsOneWidget);
  });

  testWidgets(
    'Add on a populated key appends a value through the same editor',
    (tester) async {
      var doc = JsonDocument.parse('{"D":"e"}');
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, update) => JsonDocumentView(
                document: doc,
                onSave: (next) async {
                  update(() => doc = next);
                  return true;
                },
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Add to D'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('json-value-1')), 'f');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(doc.data, {
        'D': ['e', 'f'],
      });
      expect(find.byTooltip('Copy value'), findsNothing);
    },
  );
}
