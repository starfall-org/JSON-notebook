import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/main.dart';

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
}

void _noop(ThemeMode mode) {}
