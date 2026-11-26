import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:json_notebook/main.dart';

import 'signed_out_test_session.dart';

void main() {
  test('Demo vault exposes its Markdown files and nested folders', () async {
    final demo = DemoStore();
    final root = await demo.root();
    expect(root.name, 'secrets');
    final children = await demo.children(root.id);
    expect(children.any((item) => item.isFolder), isTrue);
    expect(children.any((item) => item.name == 'services.md'), isTrue);
    final file = children.firstWhere((e) => e.name == 'services.md');
    expect(await demo.read(file.id), contains('# Services'));
    await demo.write(file.id, '# Updated');
    expect(await demo.read(file.id), '# Updated');
  });

  testWidgets('Shows a Google sign-in and a demo entry point', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: VaultScreen(
          themeMode: ThemeMode.system,
          onTheme: _noop,
          session: SignedOutTestSession(),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.text('Explore demo'), findsOneWidget);
    await tester.tap(find.text('Explore demo'));
    await tester.pumpAndSettle();
    expect(find.text('services'), findsOneWidget);
    expect(find.text('cloud'), findsOneWidget);
  });

  testWidgets('Wide vault stays centered and breadcrumbs navigate to root', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(1440, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      const MaterialApp(
        home: VaultScreen(
          themeMode: ThemeMode.system,
          onTheme: _noop,
          session: SignedOutTestSession(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explore demo'));
    await tester.pumpAndSettle();

    final list = tester.getRect(find.byType(ListView));
    expect(list.width, lessThan(1000));
    expect(list.center.dx, 720);
    expect(find.byTooltip('Refresh folder'), findsOneWidget);

    await tester.tap(find.text('cloud'));
    await tester.pumpAndSettle();
    expect(find.text('main'), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, 'secrets'));
    await tester.pumpAndSettle();
    expect(find.text('main'), findsNothing);
    expect(find.text('services'), findsOneWidget);
  });
}

void _noop(ThemeMode mode) {}
