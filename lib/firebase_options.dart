import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Public Firebase app identifiers for the awesome-89e82 project.
/// Authentication secrets and Google Drive tokens are never embedded here.
abstract final class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    if (defaultTargetPlatform == TargetPlatform.android) return android;
    throw UnsupportedError('Firebase is not configured for this platform.');
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyDk6tw0jfgUzfMA0xJHqKzDWU7MWyHF7Zc',
    appId: '1:1064411966305:web:977c5dc5c115197e04b320',
    messagingSenderId: '1064411966305',
    projectId: 'awesome-89e82',
    authDomain: 'awesome-89e82.firebaseapp.com',
    storageBucket: 'awesome-89e82.firebasestorage.app',
    measurementId: 'G-X55SYNVWT3',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyAphkXBLbeRXdW86m8AuSqNIURA_qk8Xmo',
    appId: '1:1064411966305:android:c5ee28c833336ccb04b320',
    messagingSenderId: '1064411966305',
    projectId: 'awesome-89e82',
    storageBucket: 'awesome-89e82.firebasestorage.app',
  );
}
