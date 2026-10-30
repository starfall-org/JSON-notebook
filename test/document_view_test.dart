import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/document_view.dart';
import 'package:secrets_keep/json_document.dart';

void main() {
  testWidgets('Deep JSON card borders stay close together on a narrow screen', (
    tester,
  ) async {
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
    for (var index = 1; index < rectangles.length; index++) {
      expect(
        rectangles[index].left - rectangles[index - 1].left,
        lessThanOrEqualTo(9),
        reason: 'Too much left indent at level $index',
      );
      expect(
        rectangles[index - 1].right - rectangles[index].right,
        lessThanOrEqualTo(9),
        reason: 'Too much right indent at level $index',
      );
    }
    expect(rectangles.last.width, greaterThan(240));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Native JSON tree encloses nested objects and array children', (
    tester,
  ) async {
    final document = JsonDocument.parse(
      '{"A":"value","B":{"C":{"D":["e","f"]}}}',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: JsonDocumentView(document: document, onSave: (_) async => true),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final outer = find.byKey(const ValueKey('json-["B"]'));
    expect(outer, findsOneWidget);
    expect(find.ancestor(of: find.text('C'), matching: outer), findsOneWidget);
    expect(find.ancestor(of: find.text('D'), matching: outer), findsOneWidget);
    expect(find.ancestor(of: find.text('e'), matching: outer), findsOneWidget);
    expect(find.byTooltip('Add child to D'), findsOneWidget);
    expect(find.byType(PopupMenuButton), findsNothing);
  });

  testWidgets(
    'Value editing writes formatted JSON and preserves sibling data',
    (tester) async {
      var doc = JsonDocument.parse('{"A":"old","B":{"C":["e","f"]}}');
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
      await tester.tap(find.byTooltip('Edit A'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('value-String')),
        'new value',
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(doc.data, {
        'A': 'new value',
        'B': {
          'C': ['e', 'f'],
        },
      });
      expect(doc.toJson(), contains('  "A": "new value"'));
      expect(doc.toJson(), endsWith('\n'));
    },
  );

  testWidgets('Array element can be added using inline action', (tester) async {
    var doc = JsonDocument.parse('{"D":["e"]}');
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
    await tester.tap(find.byTooltip('Add child to D'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('value-String')), 'f');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(doc.data, {
      'D': ['e', 'f'],
    });
  });
}
