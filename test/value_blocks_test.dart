import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:json_notebook/document_view.dart';
import 'package:json_notebook/json_document.dart';

import 'entry_test_actions.dart';

void main() {
  testWidgets(
    'Each array element has its own visually separate copyable block',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 850));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final doc = JsonDocument.parse('{"Entries":["first","second","third"]}');
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: JsonDocumentView(document: doc, onSave: (_) async => true),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('first'), findsNothing);
      await openEntry(tester, '["Entries"]');

      final blocks = [
        for (var i = 0; i < 3; i++)
          find.byKey(ValueKey('json-value-block-["Entries",$i]')),
      ];
      for (var i = 0; i < 3; i++) {
        expect(blocks[i], findsOneWidget);
        expect(
          find.descendant(
            of: blocks[i],
            matching: find.byTooltip('Copy value'),
          ),
          findsOneWidget,
        );
        expect(
          find.descendant(
            of: blocks[i],
            matching: find.text(['first', 'second', 'third'][i]),
          ),
          findsOneWidget,
        );
      }
      for (var i = 1; i < blocks.length; i++) {
        expect(
          tester.getRect(blocks[i]).top - tester.getRect(blocks[i - 1]).bottom,
          greaterThanOrEqualTo(5),
        );
      }
      expect(find.byTooltip('Copy value'), findsNWidgets(3));
      expect(find.text('[0]'), findsNothing);
      expect(find.text('[1]'), findsNothing);
      expect(doc.data, {
        'Entries': ['first', 'second', 'third'],
      });
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Copy gets precisely the selected array element or scalar value',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 850));
      addTearDown(() => tester.binding.setSurfaceSize(null));
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
        '{"Entries":["first","line one\\nline two","third"],"Scalar":"alone","Empty":""}',
      );
      final original = doc.toJson();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: JsonDocumentView(document: doc, onSave: (_) async => true),
          ),
        ),
      );
      await tester.pumpAndSettle();

      Future<void> copyFrom(String path) async {
        final block = find.byKey(ValueKey('json-value-block-$path'));
        expect(block, findsOneWidget);
        final copy = find.descendant(
          of: block,
          matching: find.byTooltip('Copy value'),
        );
        await tester.ensureVisible(copy);
        await tester.tap(copy);
        await tester.pump();
      }

      await openEntry(tester, '["Entries"]');
      await copyFrom('["Entries",2]');
      await copyFrom('["Entries",1]');
      await copyFrom('["Entries",0]');
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      await openEntry(tester, '["Scalar"]');
      await copyFrom('["Scalar",0]');
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      await entryAction(tester, 'Empty', 'Copy');
      expect(copied, ['third', 'line one\nline two', 'first', 'alone', '']);
      expect(doc.toJson(), original);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Nested values and multiline content fit small screens', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 720));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final doc = JsonDocument.parse(
      '{"Outer":{"Tokens":["alpha","a very long piece of content that should wrap onto several lines and not overlap the copy icon"]}}',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: JsonDocumentView(document: doc, onSave: (_) async => true),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await openEntry(tester, '["Outer","Tokens"]');
    final block = find.byKey(
      const ValueKey('json-value-block-["Outer","Tokens",1]'),
    );
    expect(block, findsOneWidget);
    expect(
      find.descendant(of: block, matching: find.byTooltip('Copy value')),
      findsOneWidget,
    );
    final text = find.descendant(
      of: block,
      matching: find.byType(SelectableText),
    );
    final copy = find.descendant(
      of: block,
      matching: find.byTooltip('Copy value'),
    );
    expect(
      tester.getRect(text).right,
      lessThanOrEqualTo(tester.getRect(copy).left),
    );
    expect(tester.takeException(), isNull);
  });
}
