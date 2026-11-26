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
