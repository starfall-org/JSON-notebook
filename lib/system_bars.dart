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

/// Android 10+ can otherwise add a dark contrast scrim to transparent 3-button
/// navigation. Use theme-appropriate icons rather than a scrim for contrast.
SystemUiOverlayStyle navigationBarStyle(Brightness brightness) =>
    SystemUiOverlayStyle(
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarDividerColor: Colors.transparent,
      systemNavigationBarContrastEnforced: false,
      systemNavigationBarIconBrightness: brightness == Brightness.dark
          ? Brightness.light
          : Brightness.dark,
    );
