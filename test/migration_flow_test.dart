import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/main.dart';

void main() {
  testWidgets('Demo Markdown file can be migrated from document toolbar', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: VaultScreen(themeMode: ThemeMode.system, onTheme: (_) {}),
      ),
    );
    await tester.tap(find.text('Explore demo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('github'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Convert to JSON'), findsOneWidget);
    await tester.tap(find.byTooltip('Convert to JSON'));
    await tester.pumpAndSettle();
    expect(find.text('Convert Markdown to JSON?'), findsOneWidget);
    await tester.tap(find.text('Convert'));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pumpAndSettle();
    expect(find.text('github'), findsNWidgets(2));
  });

  testWidgets(
    'A new structured JSON document opens and supports adding blocks',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: VaultScreen(themeMode: ThemeMode.system, onTheme: (_) {}),
        ),
      );
      await tester.tap(find.text('Explore demo'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Create'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('JSON document').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).last, 'notes');
      await tester.tap(find.text('Save').last);
      await tester.pumpAndSettle();
      expect(find.text('JSON · Structured'), findsOneWidget);
      expect(find.text('notes'), findsWidgets);
      await tester.tap(find.text('notes').first);
      await tester.pumpAndSettle();
      expect(find.text('0 blocks'), findsOneWidget);
      expect(find.byTooltip('Add block'), findsOneWidget);
    },
  );

  testWidgets('Lazy folder tree shows nested files', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: VaultScreen(themeMode: ThemeMode.system, onTheme: (_) {}),
      ),
    );
    await tester.tap(find.text('Explore demo'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Folders'));
    await tester.pumpAndSettle();
    expect(find.text('services.md'), findsWidgets);
    expect(find.text('cloud'), findsWidgets);
  });
}
