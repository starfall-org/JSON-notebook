import 'package:flutter/material.dart';

import 'system_bars.dart';

const notebookWidth = 860.0;
const notebookContentInset = 14.0;

abstract final class NotebookTheme {
  static final light = _build(Brightness.light);
  static final dark = _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final background = dark ? const Color(0xff131724) : const Color(0xfff5f6fa);
    final panel = dark ? const Color(0xff1b2030) : Colors.white;
    final mutedPanel = dark ? const Color(0xff282f43) : const Color(0xffedf0f8);
    final text = dark ? const Color(0xffedf0fa) : const Color(0xff20263a);
    final muted = dark ? const Color(0xffafb8cf) : const Color(0xff555f78);
    final line = dark ? const Color(0xff343d54) : const Color(0xffdce1ee);
    final strong = dark ? const Color(0xffbec5ff) : const Color(0xff4655b6);
    final inverse = dark ? const Color(0xff202a6a) : Colors.white;
    final scheme =
        ColorScheme.fromSeed(
          seedColor: strong,
          brightness: brightness,
          dynamicSchemeVariant: DynamicSchemeVariant.tonalSpot,
        ).copyWith(
          primary: strong,
          onPrimary: inverse,
          primaryContainer: dark
              ? const Color(0xff343f70)
              : const Color(0xffe7eaff),
          onPrimaryContainer: dark
              ? const Color(0xffdfe3ff)
              : const Color(0xff303d91),
          surface: panel,
          onSurface: text,
          onSurfaceVariant: muted,
          surfaceContainerLowest: background,
          surfaceContainerLow: panel,
          surfaceContainer: panel,
          surfaceContainerHigh: mutedPanel,
          surfaceContainerHighest: mutedPanel,
          outline: muted,
          outlineVariant: line,
          error: dark ? const Color(0xfff09c9c) : const Color(0xffb02a2a),
        );
    final theme = ThemeData(
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      useMaterial3: true,
    );
    final buttonShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(10),
    );
    final panelShape = RoundedRectangleBorder(
      side: BorderSide(color: line),
      borderRadius: BorderRadius.circular(14),
    );
    final fieldBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: line),
    );
    return theme.copyWith(
      textTheme: theme.textTheme.copyWith(
        headlineMedium: theme.textTheme.headlineMedium?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.8,
        ),
        titleLarge: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.45,
        ),
        titleSmall: theme.textTheme.titleSmall?.copyWith(
          fontWeight: FontWeight.w600,
          letterSpacing: 0,
        ),
      ),
      appBarTheme: AppBarThemeData(
        backgroundColor: background,
        foregroundColor: text,
        systemOverlayStyle: statusBarStyle(
          brightness,
          backgroundColor: background,
        ),
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        centerTitle: false,
        shape: Border(bottom: BorderSide(color: line)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: panel,
        surfaceTintColor: Colors.transparent,
        shape: panelShape,
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: panel,
        surfaceTintColor: Colors.transparent,
        shape: panelShape,
      ),
      drawerTheme: DrawerThemeData(
        backgroundColor: panel,
        surfaceTintColor: Colors.transparent,
      ),
      dividerTheme: DividerThemeData(color: line),
      listTileTheme: ListTileThemeData(
        selectedColor: scheme.onPrimaryContainer,
        selectedTileColor: scheme.primaryContainer,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(shape: buttonShape),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: buttonShape,
          side: BorderSide(color: line),
        ),
      ),
      inputDecorationTheme: InputDecorationThemeData(
        filled: true,
        fillColor: background,
        border: fieldBorder,
        enabledBorder: fieldBorder,
        focusedBorder: fieldBorder.copyWith(
          borderSide: BorderSide(color: muted, width: 2),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: strong,
        linearTrackColor: line,
        linearMinHeight: 2,
      ),
    );
  }
}
