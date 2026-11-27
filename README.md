# JSON Notebook

JSON Notebook stores hierarchical **JSON** data in Google Drive. The same Flutter app runs on **Android** and **Web**.

## App identity and Android sign-in

Android uses Google Sign-In with the package name `org.starfall.jsonnotebook`.
Register an Android OAuth client for that package and the SHA-1 fingerprint
of each signing certificate (including debug, if used) in the Google Cloud
project with the Drive API enabled.

## File behavior

- `.json`: parsed as a native JSON object, with expandable nested sections and lists. Edit/add/delete keys or values, reorder entries, copy text, and save the resulting document to Drive. **Every leaf value is a string**; numbers, booleans and null are rejected rather than silently converted.
- An **Add** button appears only for an empty key or a key containing child keys. Keys that already have a string or an array of values show **Edit** instead of Add. The Add/Edit dialog accepts zero or more Value fields: zero → `""`, one → a string, and two or more → an array of strings. Adding a child beneath an empty-string key turns it into a nested object; existing nonempty values are preserved. Values appear beneath their keys in outlined, copyable blocks. Tap a key or its chevron to expand or collapse its values or child entries. Each array element has its own block. The trailing three-dot menu contains exactly **Copy**, **Edit**, and **Delete**. Copy preserves scalar text exactly and copies arrays/objects as formatted JSON. Add child is available in Edit for containers and empty keys; arrow buttons beneath expanded values move an entry up or down; Delete requires confirmation. Markdown link keys display their title in the row and remain actionable beneath the expanded key and in the Edit dialog. The UI shows no type labels or array indices.
- `.md`: displayed as **raw source only**; the app does not render it as Markdown or use a Markdown block parser in the editor. Tap the file's `⋮` menu (or long-press its row) and choose **Convert to JSON**.
- File menus offer **Rename** for files and folders, and **Convert to JSON** and **Delete** for Markdown files. Moving Markdown files to Drive Trash requires confirmation.
- JSON files are saved with **2-space indentation** and a final newline (`JsonEncoder.withIndent('  ')`). They are plain JSON, with no custom `format`, `version`, `blocks` or `sourceMarkdown` wrapper.
- **JSON drag & drop:** drag immediately from the 44-pixel grip at the left, or hold anywhere on the row briefly, then drag to another row. Drop at the top or bottom of the header to insert before/after it, or in the middle to move inside a nested object or empty-string key. The complete subtree moves intact (including array values); existing values are never overwritten. Duplicate destination keys, cycles (moving into own descendants), and invalid target types are rejected. The source dims; insertion lines mark before/after positions and a highlighted row marks an inside drop. Holding over a collapsed container opens it, and dragging near the list edges scrolls automatically. Dragging is disabled during Search and while a file save is underway.
- **Search and Add are in the AppBar.** Search is collapsed by default. In a JSON document, Search matches nested keys and all string values (including array elements), case-insensitively and after trimming whitespace. Matching branches expand automatically, unrelated branches are hidden, and clearing Search restores the prior expand/collapse state. The document's Add button opens the root entry editor.
- Use the folder toolbar to create folders or documents, refresh listings, or convert Markdown files in the current folder and its subfolders.

## Markdown import rule

The one-time Markdown → JSON importer interprets headings as nested keys and fenced code as values. Top-level list items (for example `- **x**`) are valid JSON keys even without a preceding heading. When the preceding heading has no code value, following list items are children: `# a` followed by `- b` is equivalent to `# a` followed by `## b` (both yield `{"a": {"b": ""}}`). Headings that already contain code are values, not containers. Following list items therefore become siblings under the closest enclosing heading that has no code value (or root-level siblings if none exists): `# a` with code `b`, then `- c` with code `D` converts to `{"a": ["b"], "c": ["D"]}`, rather than failing or discarding either value. A top-level heading and a top-level item with the same key and fenced code have identical output; even an empty fenced code block is preserved as `[""]`. Item lines (`- D`, or `- **D**`) contain lists of their code blocks. This input:

````text
# A
```
value
```
# B
## C
- D
   ```e```
   ```f```
````

creates the following **formatted** file:

```json
{
  "A": ["value"],
  "B": {
    "C": {
      "D": [
        "e",
        "f"
      ]
    }
  }
}
```

A file with only fenced code blocks is converted to a JSON object with a `content` array (for example, one `echo hello` block becomes `{"content": ["echo hello"]}`); multiple blocks remain separate array elements. Ordinary multiline fenced code is supported, with indentation normalized. **Even one code block is stored as a one-element JSON array** (for example `["content"]`), while a heading/item without any values becomes an empty string. Presentation-only Markdown, including table separators, padding and layout tags, is cleaned automatically while retaining the text and table cells; fenced code content is never reformatted. The converter preserves Markdown hyperlink names such as `[Docs](https://example.com)` as actual JSON keys. Within the JSON editor those keys render as tappable links, while editing, searching and saving still use their original raw key string. Structural conflicts, duplicate keys and unclosed code fences still produce explicit errors rather than overwriting data.

Conversion creates a separate `.json` sibling, verifies its contents and **preserves the original `.md`**. An existing JSON sibling is never overwritten. You can also convert a folder and its subfolders sequentially; conflicts are reported.

The Android UI respects system insets: the Material AppBar handles the top status-bar area, the main `SafeArea(top: false)` keeps file lists and the JSON editor clear of the bottom navigation/gesture bar, and the folder drawer and dialogs respect both edges. The Android status and navigation bars use the app theme’s background with contrasting icons. Flutter draws behind the bars in edge-to-edge mode and disables the platform contrast scrims. System appearance changes and the app’s saved light/dark choice update both bars. On the web, Flutter sends the active background color to the browser. Widget tests simulate both system insets on a narrow phone viewport.

## Development

Create a gitignored `.env.client` at the project root with the public Google OAuth web client ID for browser sign-in:

```dotenv
GOOGLE_WEB_CLIENT_ID=<web client ID>
```

The web build embeds this public identifier. Keep signing
passwords in the separate signing `.env` file.

```sh
flutter pub get
flutter analyze
flutter test --concurrency=1
flutter run -d chrome --web-port=7357 --dart-define-from-file=.env.client
```

### Firebase Hosting

To build the web release locally, run `flutter build web --release --dart-define-from-file=.env.client`. Firebase
Hosting serves the generated `build/web` directory. With Flutter and the
Firebase CLI available on your PATH, deploy with:

```sh
firebase deploy --only hosting --project awesome-89e82
```

The Hosting predeploy hook builds the Flutter web release before uploading it.
The deploy targets Hosting only.

### Signed Android release

Place the local `release.jks` and `.env` with `KEYSTORE_PASSWORD`, `KEY_PASSWORD`, and `KEY_ALIAS` at the project root (both must remain gitignored). Use `scripts/build-release.sh` instead of calling Gradle directly: it limits the build to two CPUs/one Gradle worker, stores intermediate build outputs in temporary RAM, and checks that each ABI contains both `libflutter.so` **and `libapp.so`**. Some Flutter/Android Gradle Plugin versions have produced release APKs without `libapp.so`, which crash immediately when opened. If necessary, the script adds the already-compiled AOT library, aligns and re-signs the APK with the release keystore. Do not publish until `python3 scripts/verify-release-apks.py` passes on all three output APKs. The original keystore and passwords must never be uploaded.

### Google Drive authorization

Android requests Drive access through Google Sign-In and can restore a
previously authorized account silently. The browser uses the Google Identity
Services token popup. Register each web app origin (including the local
development origin and the Hosting origin) under **Authorized JavaScript
origins** on the web OAuth client. For a stable local origin use
`flutter run -d chrome --web-port=7357 --dart-define-from-file=.env.client`
and register `http://localhost:7357`.

Both platforms call Drive with a short-lived OAuth access token. The app
keeps tokens in memory. After a web reload, select **Continue with Google**
again. An expired web session offers **Reconnect Google Drive**. Android
can renew authorization silently. Firebase Hosting serves the web app.

The existing vault requires the restricted `https://www.googleapis.com/auth/drive`
scope. Configure the consent screen and eligible test users or verification
in Google Auth Platform. Real-account consent requires an interactive test.

Destructive file actions require confirmation; Drive items are trashed where
supported.

### ADB hot reload

```sh
scripts/adb-hot-reload.sh start
scripts/adb-hot-reload.sh reload
scripts/adb-hot-reload.sh restart
scripts/adb-hot-reload.sh stop
```

The connected device must have an active Flutter debug session. Some remote ADB forwarding configurations do not expose the Dart VM Service, so successful installation by itself does not establish hot reload.
