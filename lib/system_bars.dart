import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Allow the theme's Scaffold background to extend behind Android's system
/// navigation region. The app's existing SafeArea keeps controls clear of it.
Future<void> configureSystemBars() =>
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

/// Respect the explicitly selected theme, or the device appearance when
/// the user has selected System. MaterialApp.builder's context is not reliably
/// beneath the app's selected Theme, so Theme.of(context) can be wrong there.
Brightness navigationBrightness(ThemeMode mode, Brightness platform) =>
    switch (mode) {
      ThemeMode.light => Brightness.light,
      ThemeMode.dark => Brightness.dark,
      ThemeMode.system => platform,
    };

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
  systemNavigationBarIconBrightness: brightness == Brightness.dark
      ? Brightness.light
      : Brightness.dark,
);
