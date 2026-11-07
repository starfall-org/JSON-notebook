import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:json_notebook/document_view.dart';
import 'package:json_notebook/json_document.dart';

Future<void> dragKey(
  WidgetTester tester,
  String sourcePath,
  String targetPath,
  JsonDropPosition placement,
) async {
  final sourceCard = find.byKey(ValueKey('json-$sourcePath'));
  final handle = find
      .descendant(of: sourceCard, matching: find.byIcon(Icons.drag_indicator))
      .first;
  final target = find.byKey(ValueKey('json-drop-$targetPath'));
  final rect = tester.getRect(target);
  final point = Offset(rect.center.dx, switch (placement) {
    JsonDropPosition.before => rect.top + 2,
    JsonDropPosition.inside => rect.center.dy,
    JsonDropPosition.after => rect.bottom - 2,
  });
  final gesture = await tester.startGesture(tester.getCenter(handle));
  await tester.pump(const Duration(milliseconds: 700));
  await gesture.moveTo(point);
  await tester.pump(const Duration(milliseconds: 170));
  await gesture.up();
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('Drag handle reorders sibling keys', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 760));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    var doc = JsonDocument.parse('{"A":"a","B":"b","C":"c"}');
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
    expect(find.byIcon(Icons.drag_indicator), findsNWidgets(3));
    await dragKey(tester, '["C"]', '["A"]', JsonDropPosition.before);
    expect(doc.data.keys.toList(), ['C', 'A', 'B']);
    expect(doc.data, {'C': 'c', 'A': 'a', 'B': 'b'});
    expect(tester.takeException(), isNull);
  });

  testWidgets('Drag nested key onto empty key to create a container', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 760));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    var doc = JsonDocument.parse(
      '{"Source":{"Data":["one","two"]},"Empty":""}',
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
    await dragKey(
      tester,
      '["Source","Data"]',
      '["Empty"]',
      JsonDropPosition.inside,
    );
    expect(doc.data, {
      'Source': <String, dynamic>{},
      'Empty': {
        'Data': ['one', 'two'],
      },
    });
    expect(find.byTooltip('Toggle Empty'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Drop a branch inside another branch and preserve full subtree', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 850));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    var doc = JsonDocument.parse(
      '{"Origin":{"Container":{"Token":["one","two"],"Name":"value"}},"Destination":{"Keep":"safe"}}',
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
    await dragKey(
      tester,
      '["Origin","Container"]',
      '["Destination"]',
      JsonDropPosition.inside,
    );
    expect(doc.data, {
      'Origin': <String, dynamic>{},
      'Destination': {
        'Keep': 'safe',
        'Container': {
          'Token': ['one', 'two'],
          'Name': 'value',
        },
      },
    });
    expect(find.text('Container'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('No mutation from drag during active search', (tester) async {
    final query = ValueNotifier<String>('');
    addTearDown(query.dispose);
    var doc = JsonDocument.parse('{"Alpha":"one","Beta":"two"}');
    var saves = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, update) => ValueListenableBuilder<String>(
              valueListenable: query,
              builder: (context, text, _) => JsonDocumentView(
                document: doc,
                searchQuery: text,
                onSave: (next) async {
                  saves++;
                  update(() => doc = next);
                  return true;
                },
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    query.value = 'a';
    await tester.pumpAndSettle();
    await dragKey(tester, '["Beta"]', '["Alpha"]', JsonDropPosition.before);
    expect(doc.data.keys.toList(), ['Alpha', 'Beta']);
    expect(saves, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Dragging a parent into itself or child does not mutate data', (
    tester,
  ) async {
    var doc = JsonDocument.parse('{"A":{"Child":"x"},"B":"y"}');
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
    final original = doc.toJson();
    await dragKey(tester, '["A"]', '["A","Child"]', JsonDropPosition.after);
    expect(doc.toJson(), original);
    expect(tester.takeException(), isNull);
  });
}
