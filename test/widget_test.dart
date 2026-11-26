import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:json_notebook/json_document.dart';
import 'package:json_notebook/main.dart';

import 'entry_test_actions.dart';
import 'signed_out_test_session.dart';

void main() {
  test('Demo vault contains formatted JSON files at every level', () async {
    final demo = DemoStore();
    final root = await demo.root();
    expect(root.name, 'secrets');
    final children = await demo.children(root.id);
    final cloud = children.singleWhere((item) => item.isFolder);
    final files = [
      ...children.where((item) => !item.isFolder),
      ...await demo.children(cloud.id),
    ];
    expect(
      files.map((file) => file.name),
      unorderedEquals(['services.json', 'github.json', 'main.json']),
    );
    for (final file in files) {
      expect(file.mimeType, 'application/json');
      final source = await demo.read(file.id);
      final document = JsonDocument.parse(source);
      expect(document.data, isNotEmpty);
      expect(document.toJson(), source);
    }
    final file = files.singleWhere((item) => item.name == 'services.json');
    const updated = '{"Status":"Updated"}';
    await demo.write(file.id, updated);
    expect(await demo.read(file.id), updated);
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
    expect(find.text('Markdown'), findsNothing);

    await tester.tap(find.text('services'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Search JSON'), findsOneWidget);
    await openEntry(tester, '["Services","Production","Notes"]');
    expect(find.byTooltip('Copy value'), findsNWidgets(2));
    expect(
      find.text('API_URL=https://api.example.com\nTOKEN=demo-value'),
      findsOneWidget,
    );
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
