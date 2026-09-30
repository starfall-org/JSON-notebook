# Secrets Keep

Secrets Keep is a web-first Markdown editor backed by Google Drive. The same DOM UI runs directly in browsers and inside a thin Capacitor Android shell; there is no React Native or nested app WebView layer.

## Development

```sh
npm ci
npm start
npm test
npm run typecheck
npm run build
npm run android:sync
npm run build:android
```

`npm run build` creates the Firebase-ready Vite output in `dist/`. `npm run android:sync` builds that same UI and copies it into the Capacitor Android project.

## Android

Package: `org.starfallorb.secretskeep`

The Android project is tracked in `android/`. Capacitor provides the WebView shell, back-button handling, clipboard access, and app exit.

Google authentication and Drive authorization use `@capgo/capacitor-social-login` in Google online mode. The plugin uses Android Credential Manager plus Google Play Services `AuthorizationClient`, persists the native Google session, exposes `refresh()` and `getAuthorizationCode()`, and returns the Drive access token to the existing app bridge. Secrets Keep keeps a short in-memory token cache so normal Drive requests do not revalidate Google auth on every API call. A Drive 401 forces the native refresh path.

Register an Android OAuth client for `org.starfallorb.secretskeep` with the signing certificate SHA-1. The web client ID used by the native plugin must belong to the same Google Cloud project.

The current Capacitor Android shell starts at versionCode 5; versionCode 4 belongs to the final Expo build.

## Web

The web build retains the existing Firebase redirect OAuth flow. User data remains in Markdown files inside the user's `secrets` folder in Google Drive.

Firebase Hosting serves `dist/`. HTML routes are revalidated on reload while hashed Vite assets are cached long-term.

## Validation

`npm test` covers the existing editor behavior and the Capacitor auth adapter. `npm run typecheck` validates the TypeScript entry and bridge. Android validation uses `./gradlew assembleDebug assembleRelease lintDebug` after `npm run android:sync`.

A local debug APK is signed with the Android debug key, so Google Drive login on that APK also requires the debug certificate SHA-1 to be registered. Production builds must use the registered release signing key.
