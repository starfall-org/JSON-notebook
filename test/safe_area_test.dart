import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:json_notebook/main.dart';

import 'signed_out_test_session.dart';

void main() {
  testWidgets('Main content respects bottom system navigation inset', (
    tester,
  ) async {
    const screen = Size(360, 740);
    const topInset = 28.0;
    const bottomInset = 34.0;
    await tester.binding.setSurfaceSize(screen);
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(
            size: screen,
            padding: EdgeInsets.only(top: topInset, bottom: bottomInset),
            viewPadding: EdgeInsets.only(top: topInset, bottom: bottomInset),
          ),
          child: const VaultScreen(
            themeMode: ThemeMode.system,
            onTheme: _ignoreTheme,
            session: SignedOutTestSession(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final safe = find.byType(SafeArea).first;
    final widget = tester.widget<SafeArea>(safe);
    expect(widget.top, isFalse); // AppBar owns the status-bar inset.
    expect(widget.bottom, isTrue);
    final safeRect = tester.getRect(safe);
    final content = find
        .descendant(of: safe, matching: find.byType(Column))
        .first;
    final contentRect = tester.getRect(content);
    expect((safeRect.bottom - contentRect.bottom).round(), bottomInset);
    expect(contentRect.bottom, lessThanOrEqualTo(screen.height - bottomInset));
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('Explore demo'));
    await tester.pumpAndSettle();
    final list = find.byType(ListView).first;
    expect(
      tester.getRect(list).bottom,
      lessThanOrEqualTo(screen.height - bottomInset),
    );
    expect(tester.takeException(), isNull);
  });
  testWidgets('AppBar, drawer and dialogs respect status/navigation bars', (
    tester,
  ) async {
    const screen = Size(360, 740);
    const topInset = 28.0;
    const bottomInset = 34.0;
    await tester.binding.setSurfaceSize(screen);
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: const MediaQueryData(
            size: screen,
            padding: EdgeInsets.only(top: topInset, bottom: bottomInset),
            viewPadding: EdgeInsets.only(top: topInset, bottom: bottomInset),
          ),
          child: child!,
        ),
        home: const VaultScreen(
          themeMode: ThemeMode.system,
          onTheme: _ignoreTheme,
          session: SignedOutTestSession(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explore demo'));
    await tester.pumpAndSettle();

    // Scaffold/AppBar owns the status-bar padding, so toolbar buttons must not
    // end up underneath the status bar even with edge-to-edge system UI.
    final toolbarButton = tester.getRect(find.byTooltip('Add'));
    expect(toolbarButton.top, greaterThanOrEqualTo(topInset));
    expect(toolbarButton.bottom, lessThan(screen.height - bottomInset));

    await tester.tap(find.byTooltip('Folders'));
    await tester.pumpAndSettle();
    final drawer = find.byType(Drawer);
    final drawerSafe = find
        .descendant(of: drawer, matching: find.byType(SafeArea))
        .first;
    final safe = tester.widget<SafeArea>(drawerSafe);
    expect(safe.top, isTrue);
    expect(safe.bottom, isTrue);
    final drawerContents = find
        .descendant(of: drawerSafe, matching: find.byType(Column))
        .first;
    final drawerBounds = tester.getRect(drawerContents);
    expect(drawerBounds.top, greaterThanOrEqualTo(topInset));
    expect(drawerBounds.bottom, lessThanOrEqualTo(screen.height - bottomInset));
    await tester.tapAt(const Offset(350, 350));
    await tester.pumpAndSettle();

    // Dialogs use showDialog's built-in SafeArea: don't add padding twice.
    await tester.tap(find.byTooltip('Add'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('New JSON document'));
    await tester.pumpAndSettle();
    final dialogBounds = tester.getRect(find.byType(AlertDialog));
    expect(dialogBounds.top, greaterThanOrEqualTo(topInset));
    expect(dialogBounds.bottom, lessThanOrEqualTo(screen.height - bottomInset));
    await tester.enterText(find.byType(TextFormField).last, 'safe');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('safe'));
    await tester.pumpAndSettle();

    // The structured JSON editor also stays clear of the bottom gesture bar.
    final jsonList = find.byType(ListView).first;
    expect(
      tester.getRect(jsonList).bottom,
      lessThanOrEqualTo(screen.height - bottomInset),
    );
    await tester.tap(find.byTooltip('Add entry'));
    await tester.pumpAndSettle();
    final keyDialog = tester.getRect(find.byType(AlertDialog));
    expect(keyDialog.top, greaterThanOrEqualTo(topInset));
    expect(keyDialog.bottom, lessThanOrEqualTo(screen.height - bottomInset));
    expect(tester.takeException(), isNull);
  });
}

void _ignoreTheme(ThemeMode _) {}
