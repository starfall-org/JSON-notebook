import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Let Flutter paint under Android's status and navigation bars.
/// The AppBar and SafeArea keep controls out of the system insets.
Future<void> configureSystemBars() =>
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

/// Resolve the app's explicit theme or, in System mode, the device appearance.
Brightness systemBarBrightness(ThemeMode mode, Brightness platform) =>
    switch (mode) {
      ThemeMode.light => Brightness.light,
      ThemeMode.dark => Brightness.dark,
      ThemeMode.system => platform,
    };

/// The AppBar paints under Android's transparent status bar. On web, Flutter
/// uses statusBarColor to set the browser's theme color.
SystemUiOverlayStyle statusBarStyle(
  Brightness brightness, {
  required Color backgroundColor,
}) => SystemUiOverlayStyle(
  statusBarColor: kIsWeb ? backgroundColor : Colors.transparent,
  systemStatusBarContrastEnforced: false,
  statusBarBrightness: brightness,
  statusBarIconBrightness: _iconBrightness(brightness),
);

/// Use the app background on Android versions that honor navigation bar colors.
/// Edge-to-edge Android uses the matching Flutter background behind the bar.
/// Disable the system contrast scrim and choose contrasting button/gesture icons.
SystemUiOverlayStyle navigationBarStyle(
  Brightness brightness, {
  required Color backgroundColor,
}) => SystemUiOverlayStyle(
  systemNavigationBarColor: backgroundColor,
  systemNavigationBarDividerColor: backgroundColor,
  systemNavigationBarContrastEnforced: false,
  systemNavigationBarIconBrightness: _iconBrightness(brightness),
);

Brightness _iconBrightness(Brightness background) =>
    background == Brightness.dark ? Brightness.light : Brightness.dark;
