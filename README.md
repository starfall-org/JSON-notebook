# Secrets Keep

Expo app for Android and web. The original interface and Markdown editor are shared unchanged through an Expo DOM component; Android bundles the interface locally and uses native Google Sign-In for Drive access.

## Development

```sh
npm ci
cp .env.example .env
npm start
npm run web
npm run android
npm test
npm run typecheck
npm run build
npm run build:android
```

The EAS preview profile creates an APK. Native sign-in requires a development build or APK with Google Play Services, rather than Expo Go.

## Android authentication

Register the Android OAuth client for `com.contributory.secretskeep` and the signing certificate SHA-1, and keep `google-services.json` in sync. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the Web client in the same Google project.

Google Play Services retains the authorized account, restores it silently after reopening the app, and obtains Drive access tokens. Expired tokens are renewed without an hourly login prompt. A Drive 401 clears the native token cache and retries once. Concurrent renewals share one request, and logout prevents an in-flight renewal from restoring the session. No app OAuth backend, server auth code, client secret, or stored refresh token is required. Access tokens remain in memory on Android. Revoked authorization requires reconnecting.

Web retains the original Firebase redirect flow and UI. Data stays in Markdown files in the user's `secrets` folder in Google Drive.

## Validation

`npm test` checks the original editor/toolbar behavior and token manager. `npm run typecheck`, web/Android exports, and `npx expo-doctor` check build compatibility. Native Google sign-in and real token renewal still require a physical Android device.
