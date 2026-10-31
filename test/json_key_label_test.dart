import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/json_key_label.dart';
import 'package:secrets_keep/document_view.dart';
import 'package:secrets_keep/json_document.dart';

List<TextSpan> _leafSpans(RichText text) {
  final leaves = <TextSpan>[];
  void visit(InlineSpan part) {
    if (part is! TextSpan) return;
    if (part.text != null) leaves.add(part);
    for (final child in part.children ?? <InlineSpan>[]) {
      visit(child);
    }
  }

  visit(text.text);
  return leaves;
}

void main() {
  testWidgets('Markdown link key shows title and opens correct URL on tap', (
    tester,
  ) async {
    Uri? opened;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: JsonKeyLabel(
              rawKey: '[Docs](https://example.com/path?x=1&y=2)',
              openLink: (uri) async {
                opened = uri;
                return true;
              },
            ),
          ),
        ),
      ),
    );
    final widget = find.byType(JsonKeyLabel);
    final text = tester.widget<RichText>(
      find.descendant(of: widget, matching: find.byType(RichText)),
    );
    final spans = _leafSpans(text);
    expect(spans, hasLength(1));
    expect(spans.single.text, 'Docs');
    expect(spans.single.recognizer, isA<TapGestureRecognizer>());
    expect(spans.single.style!.decoration, TextDecoration.underline);
    expect(find.textContaining('https://example.com/path'), findsNothing);
    await tester.tap(widget);
    await tester.pumpAndSettle();
    expect(opened.toString(), 'https://example.com/path?x=1&y=2');
    expect(tester.takeException(), isNull);
  });

  testWidgets('Mixed text and multiple Markdown links keep order', (
    tester,
  ) async {
    final urls = <Uri>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: JsonKeyLabel(
            rawKey:
                'Visit [A](https://a.example) and [B](http://b.example) now',
            openLink: (uri) async {
              urls.add(uri);
              return true;
            },
          ),
        ),
      ),
    );
    final rich = tester.widget<RichText>(
      find.descendant(
        of: find.byType(JsonKeyLabel),
        matching: find.byType(RichText),
      ),
    );
    final spans = _leafSpans(rich);
    expect(spans.map((span) => span.text).toList(), [
      'Visit ',
      'A',
      ' and ',
      'B',
      ' now',
    ]);
    expect(spans.where((span) => span.recognizer != null).length, 2);
    (spans[1].recognizer! as TapGestureRecognizer).onTap!();
    (spans[3].recognizer! as TapGestureRecognizer).onTap!();
    await tester.pumpAndSettle();
    expect(urls.map((uri) => uri.toString()).toList(), [
      'https://a.example',
      'http://b.example',
    ]);
  });

  testWidgets('Non-web schemes are never actionable', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: JsonKeyLabel(rawKey: '[Unsafe](javascript:alert(1)) and plain'),
        ),
      ),
    );
    final rich = tester.widget<RichText>(
      find.descendant(
        of: find.byType(JsonKeyLabel),
        matching: find.byType(RichText),
      ),
    );
    final spans = _leafSpans(rich);
    expect(spans.any((span) => span.recognizer != null), isFalse);
    expect(spans.single.text, contains('javascript:alert(1)'));
  });

  testWidgets('Editing a linked key preserves its raw Markdown key name', (
    tester,
  ) async {
    var doc = JsonDocument.parse(
      '{"[Docs](https://example.com)":{"Child":["secret"]}}',
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
    final label = tester.widget<JsonKeyLabel>(find.byType(JsonKeyLabel).first);
    expect(label.rawKey, '[Docs](https://example.com)');
    await tester.tap(find.byTooltip('Edit [Docs](https://example.com)'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('json-key-input')), findsOneWidget);
    final input = tester.widget<TextFormField>(
      find.byKey(const ValueKey('json-key-input')),
    );
    expect(input.initialValue, '[Docs](https://example.com)');
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(doc.data, {
      '[Docs](https://example.com)': {
        'Child': ['secret'],
      },
    });
  });
}
