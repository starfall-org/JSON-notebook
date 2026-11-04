# Secrets Keep

Secrets Keep stores hierarchical **JSON** data in Google Drive. **Android** uses Flutter; the production **Web** client is now native HTML/CSS/JavaScript under `web_dom/` (no CanvasKit or WebGL renderer). The original HTML/Capacitor client under `legacy_capacitor/` provided the DOM styling and Drive API foundation for the new Web interface. It is kept for reference.

## File behavior

- `.json`: parsed as a native JSON object, with expandable nested sections and lists. Edit/add/delete keys or values, reorder entries, copy text, and save the resulting document to Drive. **Every leaf value is a string**; numbers, booleans and null are rejected rather than silently converted.
- An **Add** button appears only for an empty key or a key containing child keys. Keys that already have a string or an array of values show **Edit** instead of Add. The Add/Edit dialog accepts zero or more Value fields: zero → `""`, one → a string, and two or more → an array of strings. Adding a child beneath an empty-string key turns it into a nested object; existing nonempty values are preserved. Each string or array element is displayed in its own value block with a dedicated Copy button; copying never changes the JSON document. The key title and action toolbar are on one line. Android keeps Delete inside Edit; the HTML Web version offers a Delete key action with an explicit confirmation. The UI shows no type labels or array indices.
- `.md`: displayed as **raw source only**; the app does not render it as Markdown or use a Markdown block parser in the editor. Tap the file's `⋮` menu (or long-press its row) and choose **Convert to JSON**.
- HTML Web file menus offer **Rename**, **Move to trash**, and for Markdown files **Convert to JSON**. Every destructive operation requires confirmation. Android retains its existing file menu behavior.
- JSON files are saved with **2-space indentation** and a final newline (`JsonEncoder.withIndent('  ')`). They are plain JSON, with no custom `format`, `version`, `blocks` or `sourceMarkdown` wrapper.
- **JSON drag & drop:** long-press the grip at the left of a key, then drag to another key's header. Drop at the top or bottom of the header to insert before/after it, or in the middle to move inside a nested object or empty-string key. The complete subtree moves intact (including array values); existing values are never overwritten. Duplicate destination keys, cycles (moving into own descendants), and invalid target types are rejected. The source dims and valid destinations highlight while dragging. Dragging is disabled during Search and while a file save is underway. Up/down buttons remain as a non-drag ordering alternative.
- **Search and Add are in the AppBar.** Search is collapsed by default. In a JSON document, Search matches nested keys and all string values (including array elements), case-insensitively and after trimming whitespace. Matching branches expand automatically, unrelated branches are hidden, and clearing Search restores the prior expand/collapse state. The document's Add button opens the root entry editor.
- In the HTML Web file list, the toolbar offers **Folder**, **JSON**, **MD** and recursive Markdown conversion; file-level three-dot menus remain available. Firebase restores only the user's identity across reloads, **not** the Drive OAuth access token: the user explicitly reconnects Drive using Google popup sign-in. Android keeps its existing AppBar and restoration flow.

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

The Android UI respects system insets: the Material AppBar handles the top status-bar area, the main `SafeArea(top: false)` keeps file lists and the JSON editor clear of the bottom navigation/gesture bar, and the folder drawer and dialogs respect both edges. The Android navigation bar is transparent in edge-to-edge mode, using the Scaffold background behind it, with light/dark navigation icons matching the active theme and no platform contrast scrim. Widget tests simulate top and bottom insets on a narrow phone viewport.

## Development

```sh
flutter pub get
flutter analyze
flutter test --concurrency=1
# Flutter is still the Android app; build its APK via scripts/build-release.sh

# HTML Web: no npm install / bundling required
node --test web_dom/test.mjs
firebase deploy --only hosting --project awesome-89e82
```

### Signed Android release

Place the local `release.jks` and `.env` with `KEYSTORE_PASSWORD`, `KEY_PASSWORD`, and `KEY_ALIAS` at the project root (both must remain gitignored). Use `scripts/build-release.sh` instead of calling Gradle directly: it limits the build to two CPUs/one Gradle worker, stores intermediate build outputs in temporary RAM, and checks that each ABI contains both `libflutter.so` **and `libapp.so`**. Some Flutter/Android Gradle Plugin versions have produced release APKs without `libapp.so`, which crash immediately when opened. If necessary, the script adds the already-compiled AOT library, aligns and re-signs the APK with the release keystore. Do not publish until `python3 scripts/verify-release-apks.py` passes on all three output APKs. The original keystore and passwords must never be uploaded.

### Firebase Authentication and Google Drive

Secrets Keep uses Firebase Authentication with the Google provider. The HTML
Web app uses Firebase JavaScript SDK `signInWithPopup`; Flutter Android uses
Google Sign-In and passes its credential into `FirebaseAuth.signInWithCredential`.
The Firebase project is `awesome-89e82`; its configured Firebase Web App is
`secrets-keep-web`. Google Sign-In must remain enabled at
[Firebase Authentication](https://console.firebase.google.com/project/awesome-89e82/authentication/providers),
and the Hosting domain `awesome-89e82.web.app` must be in Authorized domains.
The shared Firebase Auth project is also used by other apps, so the local
`firebase.json` only deploys Hosting and does not overwrite Auth providers.

Firebase ID tokens **cannot** authorize Google Drive API calls. Sign-in also
requests the Google OAuth `https://www.googleapis.com/auth/drive` scope. The
Drive access token stays in process memory, is not serialized to application
preferences, and is discarded on sign-out. On Web, Firebase restores the
identity across reloads but **not** the Google Drive OAuth access token: press
**Continue with Google** to reconnect Drive. An expired Drive access token
shows a **Reconnect Google Drive** action; popups only open on a user gesture.
Android can renew its Google authorization silently when possible.

This Google Drive scope is restricted; Firebase Authentication does **not**
remove Google's OAuth consent-screen verification or test-user requirements.
Check Google Auth Platform if real-account consent is blocked. Real-account
OAuth is not covered by demo/widget tests.

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

## Migration status

The Flutter Android and HTML Web clients operate on JSON directly. Web HTML modules render with native DOM nodes and include pure-model Node tests and a simulated browser demo test; Android keeps Flutter widget tests. Google OAuth on a real account, large-vault performance and a complete Android real-device UX pass remain to be verified. Keep `legacy_capacitor/` until archive review is complete.
