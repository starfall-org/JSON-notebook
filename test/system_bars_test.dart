import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:json_notebook/system_bars.dart';
import 'package:json_notebook/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('Navigation bar stays transparent with suitable light/dark icons', () {
    for (final brightness in [Brightness.light, Brightness.dark]) {
      final style = navigationBarStyle(brightness);
      expect(style.systemNavigationBarColor, Colors.transparent);
      expect(style.systemNavigationBarDividerColor, Colors.transparent);
      expect(style.systemNavigationBarContrastEnforced, isFalse);
      expect(
        style.systemNavigationBarIconBrightness,
        brightness == Brightness.dark ? Brightness.light : Brightness.dark,
      );
      // The Material AppBar continues to control the status-bar appearance.
      expect(style.statusBarColor, isNull);
      expect(style.statusBarIconBrightness, isNull);
    }
  });

  test('Explicit theme overrides system brightness for navigation icons', () {
    expect(
      navigationBrightness(ThemeMode.light, Brightness.dark),
      Brightness.light,
    );
    expect(
      navigationBrightness(ThemeMode.dark, Brightness.light),
      Brightness.dark,
    );
    expect(
      navigationBrightness(ThemeMode.system, Brightness.dark),
      Brightness.dark,
    );
    expect(
      navigationBrightness(ThemeMode.system, Brightness.light),
      Brightness.light,
    );
  });

  testWidgets('Configures edge-to-edge instead of covering the gesture area', (
    tester,
  ) async {
    final calls = <MethodCall>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        calls.add(call);
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );

    await configureSystemBars();
    expect(calls, hasLength(1));
    expect(calls.single.method, 'SystemChrome.setEnabledSystemUIMode');
    expect(calls.single.arguments, 'SystemUiMode.edgeToEdge');
  });

  testWidgets('App root applies navigation icon contrast for saved theme', (
    tester,
  ) async {
    for (final pair in [(1, Brightness.dark), (2, Brightness.light)]) {
      // ThemeMode.light has index 1 and requires dark navigation icons;
      // ThemeMode.dark has index 2 and requires light navigation icons.
      SharedPreferences.setMockInitialValues({'theme': pair.$1});
      await tester.pumpWidget(const JsonNotebookApp());
      await tester.pump();
      final regions = find.byWidgetPredicate(
        (widget) =>
            widget is AnnotatedRegion<SystemUiOverlayStyle> &&
            widget.value.systemNavigationBarColor == Colors.transparent,
      );
      expect(regions, findsOneWidget);
      final region = tester.widget<AnnotatedRegion<SystemUiOverlayStyle>>(
        regions,
      );
      expect(region.value.systemNavigationBarIconBrightness, pair.$2);
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });

  test('Both Android launch and normal themes have transparent navigation', () {
    for (final variant in ['values', 'values-night']) {
      final xml = File('android/app/src/main/res/$variant/styles.xml')
          .readAsStringSync();
      expect(
        RegExp(r'<style name="LaunchTheme"[\s\S]*?</style>')
            .firstMatch(xml)
            ?.group(0),
        contains(
          '<item name="android:navigationBarColor">@android:color/transparent</item>',
        ),
      );
      expect(
        RegExp(r'<style name="NormalTheme"[\s\S]*?</style>')
            .firstMatch(xml)
            ?.group(0),
        contains(
          '<item name="android:navigationBarColor">@android:color/transparent</item>',
        ),
      );
      expect(
        RegExp('android:windowNavigationBarContrastEnforced">false')
            .allMatches(xml),
        hasLength(2),
      );
      expect(
        RegExp(
          'android:windowLightNavigationBar">'
          '${variant == 'values' ? 'true' : 'false'}',
        ).allMatches(xml),
        hasLength(2),
      );
    }
  });
}
