# Secrets Keep

**Secrets Keep** is a Flutter app for organizing Markdown notes and structured secrets in a private `secrets` folder in the user's Google Drive. Flutter (Material 3) is the current implementation for Android and Web; `legacy_capacitor/` preserves the previous application and tests for migration parity.

## What works in Flutter

- Google sign-in with silent session restoration and one retry after an expired Drive access token. Google Drive file and folder operations use the existing `org.starfallorb.secretskeep` application ID on Android.
- Nested Drive folders, a lazy-loading folder tree, `.md` and `.json` files, file filtering, file create/rename/delete (Drive Trash), folder creation, and manual refresh.
- Native block-based Markdown view with headings, nested sections, bold list items, attached fenced code blocks, plain Markdown, and thematic dividers. Create, edit, delete, copy code, and move blocks (drag a handle or use the Move menu). The item editor can edit its attached code blocks in one save.
- Explicit Markdown source editor; system/light/dark theme support; demo vault; memory-only file/listing cache with a 30-second TTL. Plaintext secret contents are **not** placed in unencrypted on-disk preferences.
- **Lossless Markdown → JSON migration**, for one document or recursively for a folder and its children. Original `.md` files remain untouched. New `.json` copies hold the original source and verified typed blocks so unknown Markdown is preserved verbatim. Existing destination names are never overwritten; matching copies are skipped; conflicts are reported. JSON can also be exported back to a separate Markdown copy.

## Migration workflow

From the file list, open a `.md` file and select **Convert to JSON** (or select **Convert to JSON copy** from its file menu). For a whole directory, choose **Migrate Markdown → JSON (recursive)** from the options menu. Results show created, skipped, and failed files. Existing `.md` files remain usable; they are not renamed or deleted.

The JSON schema includes `format: "secrets-keep.blocks"`, `version: 1`, the exact `sourceMarkdown` string, and a typed `blocks` array with original offsets, raw text, indentation, heading levels, and code languages. This redundancy is intentional: it makes conversions reversible and detects mismatched/corrupted JSON documents before editing. Converting is a *copy*, not an automatic bidirectional sync between the `.md` and `.json` files. Once the two copies are edited independently, they can differ.

## Development

Requires Flutter 3.47+ (Dart 3.13+) and an Android SDK for device builds.

```sh
flutter pub get
flutter analyze
flutter test --concurrency=1
flutter run -d chrome
flutter run -d <adb-device-id>
flutter build web --release
```

Firebase Hosting reads `build/web` using the root `firebase.json`. Browser Google login requires the web OAuth client to recognize the deployed origin. Android Google login requires a signing SHA-1 registered for `org.starfallorb.secretskeep`. These account-specific login flows need validation with registered credentials; the local demo does not establish successful Google authorization.

### Android hot reload over ADB

```sh
adb devices -l
scripts/adb-hot-reload.sh start
scripts/adb-hot-reload.sh status
scripts/adb-hot-reload.sh reload      # SIGUSR1, retains widget state
scripts/adb-hot-reload.sh restart     # SIGUSR2, resets widget state
scripts/adb-hot-reload.sh stop
```

Set `FLUTTER_DEVICE` to select a different serial. A resident Flutter debug session is necessary for SIGUSR1/SIGUSR2 to work. The script reuses a previously built debug APK when available and refuses new Gradle builds below 2 GiB free disk. Merely installing a debug APK does **not** establish a hot reload session. Some hosted/forwarded ADB servers cannot forward the Dart VM Service socket back to this container, so check `status` before using `reload`; on those setups the `start`/`attach` phase may fail despite successful APK installation.

## Remaining differences and cautions

This is an **in-progress feature migration**, not yet a fully verified drop-in replacement. The original persistent browser cache, its specialized drag previews/sticky action toolbar, exact Markdown formatting via Prettier, and legacy Firebase redirect handoff have not been reproduced verbatim. The new native editor covers the main block actions but needs a full real-device UX pass and OAuth validation on Android/Web. The remote ADB hot-reload attachment is not yet reliable through the host's forwarded ADB server. Please retain `legacy_capacitor/` until parity has been reviewed.

For data safety: migration never deletes source Markdown, file deletion moves items to Google Drive Trash where supported, renaming cannot silently change a file's format suffix, and failed writes do not update the in-memory cache. No release signing credentials are committed.

For resource safety on a small machine, tests run sequentially and `android/gradle.properties` limits Gradle to one worker and a 1.5-GiB JVM heap. The original migration host has 4 vCPUs, 7.8 GiB RAM, no swap, and limited disk space; avoid running parallel Android builds. A debug APK previously built on this host is not proof that the **latest** source code has been installed on a device.
