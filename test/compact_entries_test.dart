import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:json_notebook/document_view.dart';
import 'package:json_notebook/json_document.dart';

import 'entry_test_actions.dart';

Future<void> mountDocument(
  WidgetTester tester,
  JsonDocument document, {
  Future<bool> Function(JsonDocument)? onSave,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: JsonDocumentView(
          document: document,
          onSave: onSave ?? (_) async => true,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Finder handle(String path) => find.descendant(
  of: find.byKey(ValueKey('json-drop-$path')),
  matching: find.byIcon(Icons.drag_indicator),
);

void main() {
  testWidgets('Only valued entries open details; branch rows toggle the tree', (
    tester,
  ) async {
    final doc = JsonDocument.parse(
      '{"Group":{"Child":"secret"},"Empty":"","EmptyGroup":{},"List":["one","two"]}',
    );
    await mountDocument(tester, doc);
    expect(find.text('Child'), findsOneWidget);
    await tester.tap(find.text('Group'));
    await tester.pumpAndSettle();
    expect(find.text('Child'), findsNothing);
    expect(find.byType(AlertDialog), findsNothing);
    await tester.tap(find.text('Group'));
    await tester.pumpAndSettle();
    expect(find.text('Child'), findsOneWidget);
    await tester.tap(find.text('Empty'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    await tester.tap(find.text('EmptyGroup'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    await tester.tap(find.text('Child'));
    await tester.pumpAndSettle();
    expect(find.text('secret'), findsOneWidget);
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('List'));
    await tester.pumpAndSettle();
    expect(find.text('one'), findsOneWidget);
    expect(find.text('two'), findsOneWidget);
    expect(doc.at(['Group', 'Child']), 'secret');
  });

  testWidgets(
    'Only three menu actions; copy preserves complete values and document',
    (tester) async {
      final copied = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            copied.add((call.arguments as Map)['text'] as String);
          }
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      final doc = JsonDocument.parse(
        '{"Scalar":"line 1\\nline 2","List":["one","two"],"Group":{"Child":"secret"}}',
      );
      var saves = 0;
      await mountDocument(
        tester,
        doc,
        onSave: (_) async {
          saves++;
          return true;
        },
      );
      expect(find.byType(SelectableText), findsNothing);
      expect(find.byIcon(Icons.edit_outlined), findsNothing);
      await tester.tap(find.byTooltip('Options for Scalar'));
      await tester.pumpAndSettle();
      expect(find.byType(PopupMenuItem<String>), findsNWidgets(3));
      expect(find.text('Copy'), findsOneWidget);
      expect(find.text('Edit'), findsOneWidget);
      expect(find.text('Delete'), findsOneWidget);
      expect(find.byType(AlertDialog), findsNothing);
      await tester.tap(find.text('Copy'));
      await tester.pumpAndSettle();
      await entryAction(tester, 'List', 'Copy');
      await entryAction(tester, 'Group', 'Copy');
      expect(copied[0], 'line 1\nline 2');
      expect(JsonDocument.parse('{"value":${copied[1]}}').at(['value']), [
        'one',
        'two',
      ]);
      expect(JsonDocument.parse(copied[2]).data, {'Child': 'secret'});
      expect(saves, 0);
    },
  );

  testWidgets(
    'Menu Delete confirms and Cancel preserves the selected subtree',
    (tester) async {
      final doc = JsonDocument.parse(
        '{"Group":{"Child":"secret"},"Keep":"safe"}',
      );
      JsonDocument? saved;
      await mountDocument(
        tester,
        doc,
        onSave: (next) async {
          saved = next;
          return true;
        },
      );
      await entryAction(tester, 'Group', 'Delete');
      expect(find.text('Delete Group?'), findsOneWidget);
      expect(saved, isNull);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(saved, isNull);
      await entryAction(tester, 'Group', 'Delete');
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(saved!.data, {'Keep': 'safe'});
    },
  );

  testWidgets('Handle starts dragging immediately without long press', (
    tester,
  ) async {
    JsonDocument? saved;
    await mountDocument(
      tester,
      JsonDocument.parse('{"A":"a","B":"b"}'),
      onSave: (next) async {
        saved = next;
        return true;
      },
    );
    final gesture = await tester.startGesture(
      tester.getCenter(handle('["B"]')),
    );
    final target = tester.getRect(
      find.byKey(const ValueKey('json-drop-["A"]')),
    );
    await gesture.moveTo(Offset(target.center.dx, target.top + 8));
    await tester.pump();
    final state = tester.state<JsonDocumentViewState>(
      find.byType(JsonDocumentView),
    );
    expect(state.draggingId, '["B"]');
    expect(state.hoverPosition, JsonDropPosition.before);
    await gesture.up();
    await tester.pumpAndSettle();
    expect(saved!.data.keys, ['B', 'A']);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets(
    'Long press on the item label also drags without opening a dialog',
    (tester) async {
      JsonDocument? saved;
      await mountDocument(
        tester,
        JsonDocument.parse('{"A":"a","B":"b"}'),
        onSave: (next) async {
          saved = next;
          return true;
        },
      );
      final gesture = await tester.startGesture(
        tester.getCenter(find.text('A')),
      );
      await tester.pump(const Duration(milliseconds: 350));
      final target = tester.getRect(
        find.byKey(const ValueKey('json-drop-["B"]')),
      );
      await gesture.moveTo(Offset(target.center.dx, target.bottom - 8));
      await tester.pump();
      await gesture.up();
      await tester.pumpAndSettle();
      expect(saved!.data.keys, ['B', 'A']);
      expect(find.byType(AlertDialog), findsNothing);
    },
  );

  testWidgets(
    'Hover opens a closed branch and invalid inside drop never highlights',
    (tester) async {
      final doc = JsonDocument.parse(
        '{"Source":"move","Target":{"Child":"keep"},"Duplicate":{"Source":"existing"}}',
      );
      JsonDocument? saved;
      await mountDocument(
        tester,
        doc,
        onSave: (next) async {
          saved = next;
          return true;
        },
      );
      await tester.tap(find.byTooltip('Toggle Target'));
      await tester.pumpAndSettle();
      expect(find.text('Child'), findsNothing);
      final gesture = await tester.startGesture(
        tester.getCenter(handle('["Source"]')),
      );
      await gesture.moveTo(
        tester.getCenter(find.byKey(const ValueKey('json-drop-["Target"]'))),
      );
      await tester.pump(const Duration(milliseconds: 700));
      expect(find.text('Child'), findsOneWidget);
      final state = tester.state<JsonDocumentViewState>(
        find.byType(JsonDocumentView),
      );
      expect(state.hoverPosition, JsonDropPosition.inside);
      await gesture.moveTo(
        tester.getCenter(find.byKey(const ValueKey('json-drop-["Duplicate"]'))),
      );
      await tester.pump();
      expect(state.hoverId, isNull);
      await gesture.up();
      await tester.pumpAndSettle();
      expect(saved, isNull);
    },
  );

  testWidgets('Dragging near the bottom scrolls; releasing stops scrolling', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final doc = JsonDocument.parse(
      jsonEncode({for (var i = 0; i < 35; i++) 'Item $i': 'value $i'}),
    );
    await mountDocument(tester, doc);
    final list = tester.widget<ListView>(find.byType(ListView));
    final gesture = await tester.startGesture(
      tester.getCenter(handle('["Item 0"]')),
    );
    await gesture.moveTo(const Offset(180, 580));
    await tester.pump(const Duration(milliseconds: 500));
    expect(list.controller!.offset, greaterThan(100));
    await gesture.cancel();
    await tester.pumpAndSettle();
    final stopped = list.controller!.offset;
    await tester.pump(const Duration(milliseconds: 500));
    expect(list.controller!.offset, stopped);
    expect(tester.takeException(), isNull);
  });
}
