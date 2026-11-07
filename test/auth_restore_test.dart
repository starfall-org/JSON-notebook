import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:json_notebook/main.dart';

class _FakeSession implements VaultSession {
  final restorePending = Completer<VaultStore?>();
  final signInPending = Completer<VaultStore?>();
  int signOutCalls = 0;

  @override
  Future<VaultStore?> restore() => restorePending.future;

  @override
  Future<VaultStore?> signIn() => signInPending.future;

  @override
  Future<void> signOut() async {
    signOutCalls++;
  }
}

class _SlowDemoStore extends DemoStore {
  final rootPending = Completer<DriveEntry>();

  @override
  Future<DriveEntry> root() => rootPending.future;
}

Future<void> launch(WidgetTester tester, VaultSession session) async {
  await tester.pumpWidget(
    MaterialApp(
      home: VaultScreen(
        themeMode: ThemeMode.system,
        onTheme: (_) {},
        session: session,
      ),
    ),
  );
  await tester.pump();
}

void expectRestoring() {
  expect(find.byKey(const ValueKey('vault-session-loading')), findsOneWidget);
  expect(find.text('Continue with Google'), findsNothing);
  expect(find.text('Explore demo'), findsNothing);
}

void main() {
  testWidgets('Never flashes Login while silent sign-in is unresolved', (
    tester,
  ) async {
    final session = _FakeSession();
    await launch(tester, session);
    expectRestoring();
    await tester.pump(const Duration(milliseconds: 350));
    expectRestoring();

    session.restorePending.complete(DemoStore());
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('vault-session-loading')), findsNothing);
    expect(find.text('Continue with Google'), findsNothing);
    expect(find.text('Explore demo'), findsNothing);
    expect(find.text('services'), findsOneWidget);
    expect(find.text('cloud'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Login is hidden while Google Drive initializes after restore', (
    tester,
  ) async {
    final session = _FakeSession();
    final slowStore = _SlowDemoStore();
    await launch(tester, session);
    session.restorePending.complete(slowStore);
    await tester.pump();
    expectRestoring();
    slowStore.rootPending.complete(await DemoStore().root());
    await tester.pumpAndSettle();
    expect(find.text('Continue with Google'), findsNothing);
    expect(find.text('services'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('No saved session offers Login only after silent restore ends', (
    tester,
  ) async {
    final session = _FakeSession();
    await launch(tester, session);
    expectRestoring();
    session.restorePending.complete(null);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('vault-session-loading')), findsNothing);
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.text('Explore demo'), findsOneWidget);
  });

  testWidgets('Explicit sign-out returns to Login, not to restoring UI', (
    tester,
  ) async {
    final session = _FakeSession();
    await launch(tester, session);
    session.restorePending.complete(DemoStore());
    await tester.pumpAndSettle();
    expect(find.text('Continue with Google'), findsNothing);
    await tester.tap(find.byTooltip('More'));
    await tester.pumpAndSettle();
    expect(find.text('Sign out'), findsOneWidget);
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    expect(session.signOutCalls, 1);
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.text('Explore demo'), findsOneWidget);
    expect(find.byKey(const ValueKey('vault-session-loading')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Manual sign-in also hides Login until the account is ready', (
    tester,
  ) async {
    final session = _FakeSession();
    await launch(tester, session);
    session.restorePending.complete(null);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue with Google'));
    await tester.pump();
    expectRestoring();
    session.signInPending.complete(DemoStore());
    await tester.pumpAndSettle();
    expect(find.text('Continue with Google'), findsNothing);
    expect(find.text('services'), findsOneWidget);
  });

  testWidgets('Failed silent restore eventually provides sign-in options', (
    tester,
  ) async {
    final session = _FakeSession();
    await launch(tester, session);
    session.restorePending.completeError(StateError('expired session'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('vault-session-loading')), findsNothing);
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
