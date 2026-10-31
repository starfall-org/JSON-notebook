# Secrets Keep

Flutter vault for hierarchical **JSON** data stored in Google Drive. Android and Web share the same source. The original Capacitor implementation is archived under `legacy_capacitor/` for reference.

## File behavior

- `.json`: parsed as a native JSON object, with expandable nested sections and lists. Edit/add/delete keys or values, reorder entries, copy text, and save the resulting document to Drive. **Every leaf value is a string**; numbers, booleans and null are rejected rather than silently converted.
- An **Add** button appears only for an empty key or a key containing child keys. Keys that already have a string or an array of values show **Edit** instead of Add. The Add/Edit dialog accepts zero or more Value fields: zero → `""`, one → a string, and two or more → an array of strings. Adding a child beneath an empty-string key turns it into a nested object; existing nonempty values are preserved. Values have no individual toolbar. The key title and its action toolbar are on the same horizontal line; Delete is inside the Edit dialog with an explicit confirmation, not on the key toolbar. The UI shows no type labels or array indices.
- `.md`: displayed as **raw source only**; the app does not render it as Markdown or use a Markdown block parser in the editor. Tap the file's `⋮` menu (or long-press its row) and choose **Convert to JSON**.
- File/folder context menus use icon + text actions. JSON files and folders only offer **Rename**; Markdown files offer **Convert to JSON**, Rename and Delete to avoid accidentally deleting structured vault data.
- JSON files are saved with **2-space indentation** and a final newline (`JsonEncoder.withIndent('  ')`). They are plain JSON, with no custom `format`, `version`, `blocks` or `sourceMarkdown` wrapper.
- **JSON drag & drop:** long-press the grip at the left of a key, then drag to another key's header. Drop at the top or bottom of the header to insert before/after it, or in the middle to move inside a nested object or empty-string key. The complete subtree moves intact (including array values); existing values are never overwritten. Duplicate destination keys, cycles (moving into own descendants), and invalid target types are rejected. The source dims and valid destinations highlight while dragging. Dragging is disabled during Search and while a file save is underway. Up/down buttons remain as a non-drag ordering alternative.
- **Search and Add are in the AppBar.** Search is collapsed by default. In a JSON document, Search matches nested keys and all string values (including array elements), case-insensitively and after trimming whitespace. Matching branches expand automatically, unrelated branches are hidden, and clearing Search restores the prior expand/collapse state. The document's Add button opens the root entry editor.
- In file lists, the AppBar Add menu offers a new folder, Markdown file or JSON document. The More menu contains folder navigation, recursive Markdown conversion, theme and sign-out (when signed in). The file-level three-dot context menus remain available.

## Markdown import rule

The one-time Markdown → JSON importer interprets headings as nested keys and fenced code as values. Top-level list items (for example `- **x**`) are valid JSON keys even without a preceding heading. When the preceding heading has no code value, following list items are children: `# a` followed by `- b` is equivalent to `# a` followed by `## b` (both yield `{"a": {"b": ""}}`). Headings that already contain code are values, not containers. A top-level heading and a top-level item with the same key and fenced code have identical output; even an empty fenced code block is preserved as `[""]`. Item lines (`- D`, or `- **D**`) contain lists of their code blocks. This input:

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

Ordinary multiline fenced code is supported, with indentation normalized. **Even one code block is stored as a one-element JSON array** (for example `["content"]`), while a heading/item without any values becomes an empty string. Presentation-only Markdown, including table separators, padding and layout tags, is cleaned automatically while retaining the text and table cells; fenced code content is never reformatted. The converter preserves Markdown hyperlink names such as `[Docs](https://example.com)` as actual JSON keys. Within the JSON editor those keys render as tappable links, while editing, searching and saving still use their original raw key string. Structural conflicts, duplicate keys and unclosed code fences still produce explicit errors rather than overwriting data.

Conversion creates a separate `.json` sibling, verifies its contents and **preserves the original `.md`**. An existing JSON sibling is never overwritten. You can also convert a folder and its subfolders sequentially; conflicts are reported.

The Android UI respects system insets: the Material AppBar handles the top status-bar area, the main `SafeArea(top: false)` keeps file lists and the JSON editor clear of the bottom navigation/gesture bar, and the folder drawer and dialogs respect both edges. Widget tests simulate top and bottom insets on a narrow phone viewport.

## Development

```sh
flutter pub get
flutter analyze
flutter test --concurrency=1
flutter run -d chrome
flutter build web --release
```

### Signed Android release

Place the local `release.jks` and `.env` with `KEYSTORE_PASSWORD`, `KEY_PASSWORD`, and `KEY_ALIAS` at the project root (both must remain gitignored). Use `scripts/build-release.sh` instead of calling Gradle directly: it limits the build to two CPUs/one Gradle worker, stores intermediate build outputs in temporary RAM, and checks that each ABI contains both `libflutter.so` **and `libapp.so`**. Some Flutter/Android Gradle Plugin versions have produced release APKs without `libapp.so`, which crash immediately when opened. If necessary, the script adds the already-compiled AOT library, aligns and re-signs the APK with the release keystore. Do not publish until `python3 scripts/verify-release-apks.py` passes on all three output APKs. The original keystore and passwords must never be uploaded.

Google Drive authorization must be configured for the deployed web origin or Android signing fingerprint. Real-account authentication is not verified by demo tests. Secrets are cached in RAM only, not unencrypted app preferences. Destructive file actions require confirmation; Drive items are trashed where supported.

### ADB hot reload

```sh
scripts/adb-hot-reload.sh start
scripts/adb-hot-reload.sh reload
scripts/adb-hot-reload.sh restart
scripts/adb-hot-reload.sh stop
```

The connected device must have an active Flutter debug session. Some remote ADB forwarding configurations do not expose the Dart VM Service, so successful installation by itself does not establish hot reload.

## Migration status

The new UI operates on JSON directly; the legacy Markdown block editor and its `flutter_markdown` dependency have been removed. JSON CRUD and migration are tested with demo data. Google OAuth on a real account, large-vault performance and a complete Android real-device UX pass remain to be verified. Do not delete `legacy_capacitor/` before reviewing any content that the strict importer rejects.
