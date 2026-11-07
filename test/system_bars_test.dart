import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:json_notebook/system_bars.dart';
import 'package:json_notebook/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test(
    'Navigation bar matches app background with suitable light/dark icons',
    () {
      for (final brightness in [Brightness.light, Brightness.dark]) {
        final background = ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: Colors.indigo,
            brightness: brightness,
          ),
        ).scaffoldBackgroundColor;
        final style = navigationBarStyle(
          brightness,
          backgroundColor: background,
        );
        expect(style.systemNavigationBarColor, background);
        expect(style.systemNavigationBarDividerColor, background);
        expect(style.systemNavigationBarContrastEnforced, isFalse);
        expect(
          style.systemNavigationBarIconBrightness,
          brightness == Brightness.dark ? Brightness.light : Brightness.dark,
        );
        // The Material AppBar continues to control the status-bar appearance.
        expect(style.statusBarColor, isNull);
        expect(style.statusBarIconBrightness, isNull);
      }
    },
  );

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
      await tester.pumpAndSettle();
      final regions = find.byWidgetPredicate(
        (widget) =>
            widget is AnnotatedRegion<SystemUiOverlayStyle> &&
            widget.value.systemNavigationBarContrastEnforced == false,
      );
      expect(regions, findsOneWidget);
      final region = tester.widget<AnnotatedRegion<SystemUiOverlayStyle>>(
        regions,
      );
      expect(region.value.systemNavigationBarIconBrightness, pair.$2);
      final appTheme = Theme.of(tester.element(find.byType(VaultScreen)));
      expect(
        region.value.systemNavigationBarColor,
        appTheme.scaffoldBackgroundColor,
      );
      final background = tester.widget<ColoredBox>(
        find.descendant(of: regions, matching: find.byType(ColoredBox)).first,
      );
      expect(background.color, appTheme.scaffoldBackgroundColor);
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });

  testWidgets(
    'Navigation background follows system changes and explicit app theme',
    (tester) async {
      SharedPreferences.setMockInitialValues({'theme': ThemeMode.system.index});
      final platform = tester.binding.platformDispatcher;
      addTearDown(platform.clearPlatformBrightnessTestValue);
      platform.platformBrightnessTestValue = Brightness.light;
      await tester.pumpWidget(const JsonNotebookApp());
      await tester.pumpAndSettle();

      SystemUiOverlayStyle style() => tester
          .widget<AnnotatedRegion<SystemUiOverlayStyle>>(
            find.byWidgetPredicate(
              (widget) =>
                  widget is AnnotatedRegion<SystemUiOverlayStyle> &&
                  widget.value.systemNavigationBarContrastEnforced == false,
            ),
          )
          .value;
      final lightColor = style().systemNavigationBarColor;
      expect(style().systemNavigationBarIconBrightness, Brightness.dark);
      platform.platformBrightnessTestValue = Brightness.dark;
      await tester.pumpAndSettle();
      expect(style().systemNavigationBarColor, isNot(lightColor));
      expect(style().systemNavigationBarIconBrightness, Brightness.light);

      final screen = tester.widget<VaultScreen>(find.byType(VaultScreen));
      screen.onTheme(ThemeMode.light);
      await tester.pumpAndSettle();
      expect(style().systemNavigationBarColor, lightColor);
      expect(style().systemNavigationBarIconBrightness, Brightness.dark);
      platform.platformBrightnessTestValue = Brightness.light;
      screen.onTheme(ThemeMode.dark);
      await tester.pumpAndSettle();
      expect(style().systemNavigationBarColor, isNot(lightColor));
      expect(style().systemNavigationBarIconBrightness, Brightness.light);
    },
  );

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
