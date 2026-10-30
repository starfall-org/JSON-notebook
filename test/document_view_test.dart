import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/document_view.dart';
import 'package:secrets_keep/vault_document.dart';
import 'package:secrets_keep/vault_migration.dart';
import 'package:secrets_keep/vault_store.dart';

void main() {
  testWidgets('Structured document exposes editable blocks and code copy', (
    tester,
  ) async {
    var current = VaultDocument(
      '# Title\n\n- **Token**\n\n  ```text\n  example\n  ```\n',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => DocumentView(
              document: current,
              onSave: (next) async {
                setState(() => current = next);
                return true;
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Title'), findsWidgets);
    expect(find.text('example'), findsWidgets);
    expect(find.byTooltip('Copy code'), findsOneWidget);
    expect(find.byTooltip('Add block'), findsOneWidget);

    await tester.tap(find.byTooltip('Add block'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Heading').last);
    await tester.pumpAndSettle();
    expect(find.text('Add heading'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, 'Added');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(current.markdown, contains('# Added'));
  });

  testWidgets('Document search navigates matching titles and their code', (
    tester,
  ) async {
    final document = VaultDocument(
      '# Alpha\n\n- **Token**\n\n  ```text\n  secret value\n  ```\n\n# Beta\n\n- **Token 2**\n',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: DocumentView(document: document, onSave: (_) async => true),
        ),
      ),
    );
    await tester.tap(find.byTooltip('Find in document'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Token');
    await tester.pumpAndSettle();
    expect(find.text('1 / 2'), findsOneWidget);
    expect(find.text('secret value'), findsWidgets);
    await tester.tap(find.byTooltip('Next match'));
    await tester.pumpAndSettle();
    expect(find.text('2 / 2'), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, 'secret value');
    await tester.pumpAndSettle();
    expect(find.text('No matching sections or items'), findsOneWidget);
  });

  testWidgets('Item editor manages attached code blocks in one save', (
    tester,
  ) async {
    var current = VaultDocument(
      '- **Account**\n\n  ```text\n  initial\n  ```\n',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, redraw) => DocumentView(
              document: current,
              onSave: (next) async {
                redraw(() => current = next);
                return true;
              },
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.byTooltip('Block actions').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit').last);
    await tester.pumpAndSettle();
    expect(find.text('Attached code blocks'), findsOneWidget);
    expect(find.byTooltip('Add attached code'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).first, 'Updated Account');
    await tester.tap(find.byTooltip('Add attached code'));
    await tester.pumpAndSettle();
    final codeInputs = find.byType(TextFormField);
    expect(codeInputs, findsNWidgets(5));
    await tester.enterText(codeInputs.last, 'new snippet');
    await tester.tap(find.text('Save').last);
    await tester.pumpAndSettle();
    expect(current.markdown, contains('- **Updated Account**'));
    expect(current.markdown, contains('initial'));
    expect(current.markdown, contains('new snippet'));
  });

  testWidgets('Drag handle moves blocks into another section', (tester) async {
    var current = VaultDocument('# Alpha\n\n# Beta\n');
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, redraw) => DocumentView(
              document: current,
              onSave: (next) async {
                redraw(() => current = next);
                return true;
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final handle = find.byIcon(Icons.drag_indicator).last;
    final target = find.text('Alpha').last;
    final gesture = await tester.startGesture(tester.getCenter(handle));
    await tester.pump(const Duration(milliseconds: 700));
    await gesture.moveTo(tester.getCenter(target));
    await tester.pump();
    await gesture.up();
    await tester.pumpAndSettle();
    expect(current.markdown, contains('Alpha'));
    expect(current.markdown, contains('Beta'));
    expect(current.markdown, contains('## Beta'));
    expect(VaultDocument.fromJson(current.toJson()).markdown, current.markdown);
  });

  testWidgets(
    'Demo vault supports JSON migration and back to Markdown without overwrites',
    (tester) async {
      final store = DemoStore();
      final source = (await store.children('root'))
          .firstWhere((e) => e.name == 'github.md');
      final migrated = await VaultMigration(store).migrate(source);
      expect(migrated.destination.name, 'github.json');
      final exported = await VaultMigration(store)
          .exportMarkdown(migrated.destination);
      expect(exported.state, MigrationState.skipped);
      expect(
        await store.read(source.id),
        VaultDocument.fromJson(await store.read(migrated.destination.id))
            .markdown,
      );
    },
  );
}
