# Secrets Keep

Flutter vault for hierarchical **JSON** data stored in Google Drive. Android and Web share the same source. The original Capacitor implementation is archived under `legacy_capacitor/` for reference.

## File behavior

- `.json`: parsed as a native JSON object, with expandable nested sections and lists. Edit/add/delete keys or values, reorder entries, copy text, and save the resulting document to Drive. **Every leaf value is a string**; numbers, booleans and null are rejected rather than silently converted.
- An **Add** button appears only for an empty key or a key containing child keys. Keys that already have a string or an array of values show **Edit** instead of Add. The Add/Edit dialog accepts zero or more Value fields: zero → `""`, one → a string, and two or more → an array of strings. Adding a child beneath an empty-string key turns it into a nested object; existing nonempty values are preserved. Values have no individual toolbar. The key title and its action toolbar are on the same horizontal line; Delete is inside the Edit dialog with an explicit confirmation, not on the key toolbar. The UI shows no type labels or array indices.
- `.md`: displayed as **raw source only**; the app does not render it as Markdown or use a Markdown block parser in the editor. Tap the file's `⋮` menu (or long-press its row) and choose **Convert to JSON**.
- Every file and folder has a three-dot menu with icon + text actions. Markdown files additionally have **Convert to JSON**.
- JSON files are saved with **2-space indentation** and a final newline (`JsonEncoder.withIndent('  ')`). They are plain JSON, with no custom `format`, `version`, `blocks` or `sourceMarkdown` wrapper.
- **Search and Add are in the AppBar.** Search is collapsed by default. In a JSON document, Search matches nested keys and all string values (including array elements), case-insensitively and after trimming whitespace. Matching branches expand automatically, unrelated branches are hidden, and clearing Search restores the prior expand/collapse state. The document's Add button opens the root entry editor.
- In file lists, the AppBar Add menu offers a new folder, Markdown file or JSON document. The More menu contains folder navigation, recursive Markdown conversion, theme and sign-out (when signed in). The file-level three-dot context menus remain available.

## Markdown import rule

The one-time Markdown → JSON importer interprets headings as nested keys and fenced code as values. Item lines (`- D`, or `- **D**`) contain lists of their code blocks. This input:

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
  "A": "value",
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

Ordinary multiline fenced code is supported, with its indentation normalized. Headings/items with no values become empty strings, and those with one value become strings. If syntax cannot be represented safely in the requested structure, conversion reports a line-specific error instead of silently discarding text. Duplicate keys are rejected.

Conversion creates a separate `.json` sibling, verifies its contents and **preserves the original `.md`**. An existing JSON sibling is never overwritten. You can also convert a folder and its subfolders sequentially; conflicts are reported.

## Development

```sh
flutter pub get
flutter analyze
flutter test --concurrency=1
flutter run -d chrome
flutter build web --release
```

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
