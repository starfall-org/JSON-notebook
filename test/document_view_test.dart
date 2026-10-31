import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/document_view.dart';
import 'package:secrets_keep/json_document.dart';

void main() {
  testWidgets('Search reveals nested matching keys and values, not siblings', (
    tester,
  ) async {
    final query = ValueNotifier<String>('');
    addTearDown(query.dispose);
    final doc = JsonDocument.parse(
      '{"Alpha":{"Child":{"Token":["SECRET-ONE","different"]},"Ignore":"hidden"},"Beta":"plain"}',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ValueListenableBuilder<String>(
            valueListenable: query,
            builder: (context, value, _) => JsonDocumentView(
              document: doc,
              searchQuery: value,
              onSave: (_) async => true,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    // Closed sections automatically expand while their descendants match.
    await tester.tap(find.byTooltip('Toggle Alpha'));
    await tester.pumpAndSettle();
    expect(find.text('Token'), findsNothing);
    query.value = '  secret-one ';
    await tester.pumpAndSettle();
    expect(find.text('Alpha'), findsOneWidget);
    expect(find.text('Child'), findsOneWidget);
    expect(find.text('Token'), findsOneWidget);
    expect(find.text('SECRET-ONE'), findsOneWidget);
    expect(find.text('Ignore'), findsNothing);
    expect(find.text('Beta'), findsNothing);
    query.value = 'token';
    await tester.pumpAndSettle();
    expect(find.text('Token'), findsOneWidget);
    query.value = 'ALPHA';
    await tester.pumpAndSettle();
    expect(find.text('Ignore'), findsOneWidget);
    query.value = 'not-found';
    await tester.pumpAndSettle();
    expect(find.text('No matching entries'), findsOneWidget);
    query.value = '';
    await tester.pumpAndSettle();
    expect(find.text('Beta'), findsOneWidget);
    expect(find.text('Token'), findsNothing); // Restores prior collapse.
  });

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
      expect(find.byTooltip('Add to G'), findsNothing);
      final edit = tester.getRect(find.byTooltip('Edit G'));
      expect((key.center.dy - edit.center.dy).abs(), lessThan(10));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Values have individual copy buttons but no array index labels', (
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
    expect(find.byTooltip('Add to D'), findsNothing);
    expect(find.byTooltip('Edit D'), findsOneWidget);
    expect(find.text('[1]'), findsNothing);
    expect(find.text('[2]'), findsNothing);
    expect(find.byTooltip('Copy value'), findsNWidgets(3));
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
      tester
          .state<JsonDocumentViewState>(find.byType(JsonDocumentView))
          .addRootEntry();
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
      tester
          .state<JsonDocumentViewState>(find.byType(JsonDocumentView))
          .addRootEntry();
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

  testWidgets('Add visibility depends on whether a key already has a value', (
    tester,
  ) async {
    final doc = JsonDocument.parse(
      '{"Empty":"","Filled":"secret","List":["x","y"],"Group":{"Child":"value"}}',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: JsonDocumentView(document: doc, onSave: (_) async => true),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byTooltip('Add to Empty'), findsOneWidget);
    expect(find.byTooltip('Add to Group'), findsOneWidget);
    expect(find.byTooltip('Add to Filled'), findsNothing);
    expect(find.byTooltip('Add to List'), findsNothing);
    expect(find.byTooltip('Add to Child'), findsNothing);
    expect(find.byTooltip('Edit Filled'), findsOneWidget);
    expect(find.byTooltip('Edit List'), findsOneWidget);
    expect(find.byTooltip('Edit Child'), findsOneWidget);
  });

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
    tester
        .state<JsonDocumentViewState>(find.byType(JsonDocumentView))
        .addRootEntry();
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

  testWidgets('Edit dialog buttons stay on one horizontal row at 320px', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 720));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final doc = JsonDocument.parse('{"A":"example"}');
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: JsonDocumentView(document: doc, onSave: (_) async => true),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Edit A'));
    await tester.pumpAndSettle();
    final deleteRect = tester.getRect(find.text('Delete'));
    final cancelRect = tester.getRect(find.text('Cancel'));
    final saveRect = tester.getRect(find.text('Save'));
    expect(deleteRect.right, lessThan(cancelRect.left));
    expect(cancelRect.right, lessThan(saveRect.left));
    expect((deleteRect.center.dy - cancelRect.center.dy).abs(), lessThan(3));
    expect((cancelRect.center.dy - saveRect.center.dy).abs(), lessThan(3));
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
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
    tester
        .state<JsonDocumentViewState>(find.byType(JsonDocumentView))
        .addRootEntry();
    await tester.pumpAndSettle();
    expect(find.text('Delete'), findsNothing);
    expect(find.text('Save'), findsOneWidget);
  });

  testWidgets(
    'Populated key offers Edit only; value fields are changed in Edit',
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
      await tester.pumpAndSettle();
      expect(find.byTooltip('Add to D'), findsNothing);
      await tester.tap(find.byTooltip('Edit D'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add value'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('json-value-1')), 'f');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(doc.data, {
        'D': ['e', 'f'],
      });
      expect(find.byTooltip('Copy value'), findsNWidgets(2));
    },
  );
}
