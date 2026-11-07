import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> entryAction(
  WidgetTester tester,
  String label,
  String action,
) async {
  await tester.tap(find.byTooltip('Options for $label'));
  await tester.pumpAndSettle();
  await tester.tap(find.text(action));
  await tester.pumpAndSettle();
}

Future<void> openEntry(WidgetTester tester, String path) async {
  await tester.tap(find.byKey(ValueKey('json-drop-$path')));
  await tester.pumpAndSettle();
}
