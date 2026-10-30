import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/main.dart';

void main() {
  testWidgets(
    'File rows have three-dot icon+text menu for Markdown conversion',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: VaultScreen(themeMode: ThemeMode.system, onTheme: (_) {}),
        ),
      );
      await tester.tap(find.text('Explore demo'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Options for github.md'), findsOneWidget);
      await tester.tap(find.byTooltip('Options for github.md'));
      await tester.pumpAndSettle();
      expect(find.text('Convert to JSON'), findsOneWidget);
      expect(find.text('Rename'), findsOneWidget);
      expect(find.text('Delete'), findsOneWidget);
      expect(find.byIcon(Icons.data_object), findsWidgets);
      await tester.tap(find.text('Convert to JSON'));
      await tester.pumpAndSettle();
      expect(find.text('Convert Markdown to JSON?'), findsOneWidget);
      await tester.tap(find.text('Convert'));
      await tester.pumpAndSettle();
      expect(find.text('JSON · Structured'), findsOneWidget);
      expect(find.text('Markdown'), findsWidgets);
    },
  );

  testWidgets('Long press on Markdown file opens icon+text context menu', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: VaultScreen(themeMode: ThemeMode.system, onTheme: (_) {}),
      ),
    );
    await tester.tap(find.text('Explore demo'));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('services'));
    await tester.pumpAndSettle();
    expect(find.text('Convert to JSON'), findsOneWidget);
    expect(find.byIcon(Icons.data_object), findsWidgets);
    expect(find.text('Rename'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);
  });

  testWidgets('Native JSON documents open and are formatted on save', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: VaultScreen(themeMode: ThemeMode.system, onTheme: (_) {}),
      ),
    );
    await tester.tap(find.text('Explore demo'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Add'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('New JSON document'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).last, 'notes');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('notes'), findsOneWidget);
    await tester.tap(find.text('notes'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Add entry'), findsOneWidget);
  });

  testWidgets(
    'JSON search and Add are on AppBar, search is hidden by default',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 740));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          home: VaultScreen(themeMode: ThemeMode.system, onTheme: (_) {}),
        ),
      );
      await tester.tap(find.text('Explore demo'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Add'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('New JSON document'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).last, 'demo');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('demo'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Search JSON'), findsOneWidget);
      expect(find.byTooltip('Add entry'), findsOneWidget);
      expect(find.text('Search keys'), findsNothing);
      expect(find.byType(TextField), findsNothing);
      await tester.tap(find.byTooltip('Search JSON'));
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsOneWidget);
      expect(find.byTooltip('Close search'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'missing');
      await tester.pumpAndSettle();
      expect(find.text('No matching entries'), findsOneWidget);
      await tester.tap(find.byTooltip('Close search'));
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsNothing);
      expect(find.byTooltip('Add entry'), findsOneWidget);
      await tester.tap(find.byTooltip('Add entry'));
      await tester.pumpAndSettle();
      expect(find.text('Add entry'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Markdown is not parsed or rendered at runtime', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: VaultScreen(themeMode: ThemeMode.system, onTheme: (_) {}),
      ),
    );
    await tester.tap(find.text('Explore demo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('github'));
    await tester.pumpAndSettle();
    expect(find.text('Markdown source (not rendered)'), findsOneWidget);
    expect(find.text('Username'), findsNothing);
  });
}
