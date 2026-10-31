import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secrets_keep/main.dart';

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
}

void _ignoreTheme(ThemeMode _) {}
