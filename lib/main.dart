import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'document_view.dart';
import 'folder_drawer.dart';
import 'vault_document.dart';
import 'vault_migration.dart';
import 'vault_naming.dart';
import 'vault_store.dart';

export 'vault_store.dart';

void main() => runApp(const SecretKeeps());

class SecretKeeps extends StatefulWidget {
  const SecretKeeps({super.key});
  @override
  State<SecretKeeps> createState() => _SecretKeepsState();
}

class _SecretKeepsState extends State<SecretKeeps> {
  ThemeMode themeMode = ThemeMode.system;
  @override
  void initState() {
    super.initState();
    _loadTheme();
  }

  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    if (mounted) {
      setState(
        () => themeMode =
            ThemeMode.values[prefs.getInt('theme')?.clamp(0, 2) ?? 0],
      );
    }
  }

  void _setTheme(ThemeMode value) async {
    setState(() => themeMode = value);
    (await SharedPreferences.getInstance()).setInt('theme', value.index);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Secrets Keep',
    debugShowCheckedModeBanner: false,
    themeMode: themeMode,
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
      useMaterial3: true,
    ),
    darkTheme: ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: Colors.indigo,
        brightness: Brightness.dark,
      ),
      useMaterial3: true,
    ),
    home: VaultScreen(themeMode: themeMode, onTheme: _setTheme),
  );
}

class VaultScreen extends StatefulWidget {
  const VaultScreen({
    super.key,
    required this.themeMode,
    required this.onTheme,
  });
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onTheme;
  @override
  State<VaultScreen> createState() => _VaultScreenState();
}

class _VaultScreenState extends State<VaultScreen> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final google = GoogleSignIn(
    scopes: [driveScope],
    serverClientId: googleWebClientId,
  );
  VaultStore? store;
  final List<DriveEntry> path = [];
  List<DriveEntry> entries = [];
  DriveEntry? openFile;
  String content = '';
  VaultDocument? activeDocument;
  bool busy = false, search = false;
  String query = '', error = '';
  final TextEditingController searchController = TextEditingController();
  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    try {
      final user = await google.signInSilently();
      if (user != null) await _connect(GoogleDriveStore(user, signIn: google));
    } catch (_) {
      /* Demo mode remains available without an account. */
    }
  }

  Future<void> _run(Future<void> Function() operation) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await operation();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _connect(VaultStore value) => _run(() async {
    final cached = CachedVaultStore(value);
    final root = await cached.root();
    final items = await cached.children(root.id);
    if (mounted) {
      setState(() {
        store = cached;
        path
          ..clear()
          ..add(root);
        entries = items;
        openFile = null;
        activeDocument = null;
      });
    }
  });
  Future<void> _login() async {
    try {
      final user = await google.signIn();
      if (user != null) await _connect(GoogleDriveStore(user, signIn: google));
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> _open(DriveEntry entry) => _run(() async {
    if (entry.isFolder) {
      final children = await store!.children(entry.id);
      if (mounted) {
        setState(() {
          path.add(entry);
          entries = children;
          search = false;
          query = '';
        });
      }
    } else {
      final text = await store!.read(entry.id);
      if (mounted) {
        setState(() {
          openFile = entry;
          content = text;
          activeDocument = entry.name.toLowerCase().endsWith('.json')
              ? VaultDocument.fromJson(text)
              : VaultDocument(text);
        });
      }
    }
  });
  Future<void> _back() => _run(() async {
    if (openFile != null) {
      setState(() {
        openFile = null;
        activeDocument = null;
      });
      return;
    }
    if (path.length < 2) return;
    final previous = path[path.length - 2];
    final children = await store!.children(previous.id);
    if (mounted) {
      setState(() {
        path.removeLast();
        entries = children;
      });
    }
  });
  Future<void> _refresh() => _run(() async {
    if (path.isEmpty) return;
    final children = store is CachedVaultStore
        ? await (store! as CachedVaultStore).refreshChildren(path.last.id)
        : await store!.children(path.last.id);
    if (mounted) setState(() => entries = children);
  });
  Future<String?> _prompt(String title, {String initial = ''}) async {
    var draftValue = initial;
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextFormField(
          initialValue: draftValue,
          onChanged: (value) => draftValue = value,
          autofocus: true,
          decoration: const InputDecoration(border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, draftValue.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    return result?.isNotEmpty == true ? result : null;
  }

  Future<List<DriveEntry>> _freshEntries() async => store is CachedVaultStore
      ? (store! as CachedVaultStore).refreshChildren(path.last.id)
      : store!.children(path.last.id);

  Future<void> _renameEntry(DriveEntry entry) async {
    final newName = await _prompt('Rename', initial: entry.name);
    if (newName == null || newName == entry.name) return;
    await _run(() async {
      final validated = validateEntryName(
        newName,
        originalName: entry.name,
        folder: entry.isFolder,
      );
      final fresh = await _freshEntries();
      ensureUniqueName(
        fresh.map((e) => e.name),
        validated,
        excluding: entry.name,
      );
      await store!.rename(entry.id, validated);
      final refreshed = await store!.children(path.last.id);
      if (mounted) setState(() => entries = refreshed);
    });
  }

  Future<void> _create(String type) async {
    final folder = type == 'folder';
    final json = type == 'json';
    final requested = await _prompt(
      folder
          ? 'New folder'
          : json
          ? 'New JSON document'
          : 'New Markdown file',
    );
    if (requested == null) return;
    await _run(() async {
      final extension = json ? '.json' : '.md';
      final fileName = folder
          ? requested
          : requested.toLowerCase().endsWith(extension)
          ? requested
          : '$requested$extension';
      final name = validateEntryName(fileName, folder: folder);
      final fresh = await _freshEntries();
      ensureUniqueName(fresh.map((e) => e.name), name);
      final created = await store!.create(path.last.id, name, folder: folder);
      if (json) {
        try {
          await store!.write(created.id, VaultDocument('').toJson());
        } catch (_) {
          try {
            await store!.remove(created.id);
          } catch (_) {
            /* Keep error. */
          }
          rethrow;
        }
      }
      final children = await store!.children(path.last.id);
      if (mounted) setState(() => entries = children);
    });
  }

  Future<bool> _saveDocument(VaultDocument document) async {
    final file = openFile;
    if (file == null || busy) return false;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final encoded = file.name.toLowerCase().endsWith('.json')
          ? document.toJson()
          : document.markdown;
      await store!.write(file.id, encoded);
      if (mounted && openFile?.id == file.id) {
        setState(() {
          content = encoded;
          activeDocument = document;
        });
      }
      return true;
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
      return false;
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _migrateOne(DriveEntry source) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Convert Markdown to JSON?'),
        content: Text(
          'Create a JSON copy of ${source.name} with editable blocks. '
          'The original Markdown file stays unchanged. Nothing is overwritten.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Convert'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    await _run(() async {
      final result = await VaultMigration(store!).migrate(source);
      final children = await store!.children(path.last.id);
      if (mounted) {
        setState(() => entries = children);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.state == MigrationState.created
                  ? 'JSON copy created (original preserved)'
                  : 'Matching JSON already exists',
            ),
          ),
        );
      }
    });
  }

  Future<void> _exportOne(DriveEntry source) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Export JSON to Markdown?'),
        content: const Text(
          'This creates a separate Markdown file in the same Drive folder. Existing files are never overwritten.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Export'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    await _run(() async {
      final result = await VaultMigration(store!).exportMarkdown(source);
      final children = await store!.children(path.last.id);
      if (mounted) {
        setState(() => entries = children);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.state == MigrationState.created
                  ? 'Markdown copy created'
                  : 'Matching Markdown already exists',
            ),
          ),
        );
      }
    });
  }

  Future<void> _browseFromDrawer(
    List<DriveEntry> folderPath, [
    DriveEntry? file,
  ]) async {
    Navigator.of(context).pop();
    await _run(() async {
      final children = await store!.children(folderPath.last.id);
      final raw = file == null ? null : await store!.read(file.id);
      final parsed = raw == null
          ? null
          : file!.name.toLowerCase().endsWith('.json')
          ? VaultDocument.fromJson(raw)
          : VaultDocument(raw);
      if (mounted) {
        setState(() {
          path
            ..clear()
            ..addAll(folderPath);
          entries = children;
          openFile = file;
          content = raw ?? '';
          activeDocument = parsed;
          search = false;
          query = '';
          searchController.clear();
        });
      }
    });
  }

  Future<void> _migrateFolder() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Migrate Markdown files in this folder?'),
        content: const Text(
          'This includes subfolders. Creates independent .json copies; original .md files are preserved. '
          'Conflicting JSON files are never overwritten. Conversion runs sequentially.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Migrate'),
          ),
        ],
      ),
    );
    if (confirm != true || path.isEmpty) return;
    MigrationReport? report;
    await _run(() async {
      report = await VaultMigration(store!).migrateTree(path.last.id);
      final children = await store!.children(path.last.id);
      if (mounted) setState(() => entries = children);
    });
    if (mounted && report != null) {
      final summary = report!;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Migration results'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(summary.description),
                for (final issue in summary.errors.take(12))
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: SelectableText(issue),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    }
  }

  Future<void> _edit() async {
    final entry = openFile;
    if (entry == null) return;
    final result = await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (_) => MarkdownEditor(
          name: entry.name,
          initial: activeDocument?.markdown ?? '',
        ),
      ),
    );
    if (result == null) return;
    await _saveDocument(VaultDocument(result));
  }

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme;
    final current = openFile;
    return PopScope(
      canPop: openFile == null && path.length < 2,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && (openFile != null || path.length > 1)) _back();
      },
      child: Scaffold(
        key: _scaffoldKey,
        drawer: store == null || path.isEmpty
            ? null
            : FolderDrawer(
                store: store!,
                root: path.first,
                selectedId: openFile?.id ?? path.last.id,
                onFolder: (folders) => _browseFromDrawer(folders),
                onFile: (folders, file) => _browseFromDrawer(folders, file),
              ),
        appBar: AppBar(
          title: search && current == null
              ? TextField(
                  controller: searchController,
                  autofocus: true,
                  decoration: const InputDecoration(
                    hintText: 'Search files',
                    border: InputBorder.none,
                  ),
                  onChanged: (value) => setState(() => query = value),
                )
              : Text(
                  current?.name.replaceAll(
                        RegExp(r'\.(?:md|json)$', caseSensitive: false),
                        '',
                      ) ??
                      (path.isEmpty ? 'Secrets Keep' : path.last.name),
                ),
          leading: (current != null || path.length > 1)
              ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: _back)
              : store != null
              ? IconButton(
                  tooltip: 'Folders',
                  icon: const Icon(Icons.menu),
                  onPressed: () => _scaffoldKey.currentState?.openDrawer(),
                )
              : null,
          actions: [
            if (store != null && (current != null || path.length > 1))
              IconButton(
                tooltip: 'Folder tree',
                icon: const Icon(Icons.account_tree_outlined),
                onPressed: () => _scaffoldKey.currentState?.openDrawer(),
              ),
            if (store != null && current == null)
              IconButton(
                tooltip: 'Search',
                icon: Icon(search ? Icons.close : Icons.search),
                onPressed: () => setState(() {
                  search = !search;
                  query = '';
                  searchController.clear();
                }),
              ),
            if (current != null && current.name.toLowerCase().endsWith('.md'))
              IconButton(
                tooltip: 'Convert to JSON',
                onPressed: () => _migrateOne(current),
                icon: const Icon(Icons.data_object),
              ),
            if (current != null && current.name.toLowerCase().endsWith('.json'))
              IconButton(
                tooltip: 'Export as Markdown',
                onPressed: () => _exportOne(current),
                icon: const Icon(Icons.file_download_outlined),
              ),
            if (current != null)
              IconButton(
                tooltip: 'Edit',
                onPressed: _edit,
                icon: const Icon(Icons.edit_outlined),
              ),
            PopupMenuButton<String>(
              tooltip: 'Options',
              onSelected: (choice) async {
                if (choice == 'migrate-folder') {
                  await _migrateFolder();
                } else if (choice == 'logout') {
                  await google.signOut();
                  setState(() {
                    store = null;
                    path.clear();
                    entries = [];
                    openFile = null;
                    activeDocument = null;
                  });
                } else if (choice == 'system') {
                  widget.onTheme(ThemeMode.system);
                } else if (choice == 'light') {
                  widget.onTheme(ThemeMode.light);
                } else if (choice == 'dark') {
                  widget.onTheme(ThemeMode.dark);
                }
              },
              itemBuilder: (_) => [
                const PopupMenuItem(
                  value: 'system',
                  child: Text('System theme'),
                ),
                const PopupMenuItem(value: 'light', child: Text('Light theme')),
                const PopupMenuItem(value: 'dark', child: Text('Dark theme')),
                if (store != null && current == null)
                  const PopupMenuItem(
                    value: 'migrate-folder',
                    child: Text('Migrate Markdown → JSON (recursive)'),
                  ),
                if (store is CachedVaultStore &&
                    (store! as CachedVaultStore).source is GoogleDriveStore)
                  const PopupMenuItem(value: 'logout', child: Text('Sign out')),
              ],
            ),
          ],
        ),
        body: Column(
          children: [
            if (busy) const LinearProgressIndicator(),
            if (error.isNotEmpty)
              MaterialBanner(
                content: SelectableText(error),
                actions: [
                  TextButton(
                    onPressed: () => setState(() => error = ''),
                    child: const Text('Dismiss'),
                  ),
                ],
              ),
            Expanded(
              child: store == null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.lock_outline,
                            size: 52,
                            color: color.primary,
                          ),
                          const SizedBox(height: 20),
                          Text(
                            'Secrets Keep',
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                          const SizedBox(height: 18),
                          FilledButton.icon(
                            onPressed: _login,
                            icon: const Icon(Icons.login),
                            label: const Text('Continue with Google'),
                          ),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () => _connect(DemoStore()),
                            child: const Text('Explore demo'),
                          ),
                        ],
                      ),
                    )
                  : current != null
                  ? DocumentView(
                      key: ValueKey(current.id),
                      document: activeDocument!,
                      onSave: _saveDocument,
                    )
                  : RefreshIndicator(
                      onRefresh: _refresh,
                      child: Builder(
                        builder: (context) {
                          final visible =
                              entries
                                  .where(
                                    (entry) =>
                                        (entry.isFolder ||
                                            (entry.name.toLowerCase().endsWith(
                                                  '.md',
                                                ) ||
                                                entry.name
                                                    .toLowerCase()
                                                    .endsWith('.json'))) &&
                                        entry.name.toLowerCase().contains(
                                          query.toLowerCase(),
                                        ),
                                  )
                                  .toList()
                                ..sort((a, b) {
                                  if (a.isFolder != b.isFolder) {
                                    return a.isFolder ? -1 : 1;
                                  }
                                  return a.name.toLowerCase().compareTo(
                                    b.name.toLowerCase(),
                                  );
                                });
                          return ListView.builder(
                            physics: const AlwaysScrollableScrollPhysics(),
                            itemCount: visible.length,
                            itemBuilder: (context, i) {
                              final entry = visible[i];
                              return ListTile(
                                leading: Icon(
                                  entry.isFolder
                                      ? Icons.folder_outlined
                                      : entry.name.toLowerCase().endsWith(
                                          '.json',
                                        )
                                      ? Icons.data_object
                                      : Icons.description_outlined,
                                  color: color.primary,
                                ),
                                title: Text(
                                  entry.isFolder
                                      ? entry.name
                                      : entry.name.replaceAll(
                                          RegExp(
                                            r'\.(?:md|json)$',
                                            caseSensitive: false,
                                          ),
                                          '',
                                        ),
                                ),
                                subtitle: entry.isFolder
                                    ? null
                                    : Text(
                                        entry.name.toLowerCase().endsWith(
                                              '.json',
                                            )
                                            ? 'JSON · Structured'
                                            : 'Markdown',
                                        style: Theme.of(context)
                                            .textTheme
                                            .labelSmall,
                                      ),
                                onTap: () => _open(entry),
                                trailing: PopupMenuButton<String>(
                                  tooltip: 'File options',
                                  onSelected: (value) async {
                                    if (value == 'export') {
                                      await _exportOne(entry);
                                    }
                                    if (value == 'migrate') {
                                      await _migrateOne(entry);
                                    }
                                    if (value == 'rename') {
                                      await _renameEntry(entry);
                                    }
                                    if (value == 'delete') {
                                      if (!context.mounted) return;
                                      final ok = await showDialog<bool>(
                                        context: context,
                                        builder: (context) => AlertDialog(
                                          title: Text('Delete ${entry.name}?'),
                                          actions: [
                                            TextButton(
                                              onPressed: () =>
                                                  Navigator.pop(context, false),
                                              child: const Text('Cancel'),
                                            ),
                                            FilledButton(
                                              onPressed: () =>
                                                  Navigator.pop(context, true),
                                              child: const Text('Delete'),
                                            ),
                                          ],
                                        ),
                                      );
                                      if (ok == true) {
                                        await _run(() async {
                                          await store!.remove(entry.id);
                                          final items = await store!.children(
                                            path.last.id,
                                          );
                                          if (mounted) {
                                            setState(() => entries = items);
                                          }
                                        });
                                      }
                                    }
                                  },
                                  itemBuilder: (_) => [
                                    if (entry.name.toLowerCase().endsWith(
                                      '.md',
                                    ))
                                      const PopupMenuItem(
                                        value: 'migrate',
                                        child: Text('Convert to JSON copy'),
                                      ),
                                    if (entry.name.toLowerCase().endsWith(
                                      '.json',
                                    ))
                                      const PopupMenuItem(
                                        value: 'export',
                                        child: Text('Export Markdown copy'),
                                      ),
                                    const PopupMenuItem(
                                      value: 'rename',
                                      child: Text('Rename'),
                                    ),
                                    const PopupMenuItem(
                                      value: 'delete',
                                      child: Text('Delete'),
                                    ),
                                  ],
                                ),
                              );
                            },
                          );
                        },
                      ),
                    ),
            ),
          ],
        ),
        floatingActionButton: store != null && current == null
            ? PopupMenuButton<String>(
                tooltip: 'Create',
                onSelected: _create,
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'json', child: Text('JSON document')),
                  PopupMenuItem(value: 'md', child: Text('Markdown file')),
                  PopupMenuItem(value: 'folder', child: Text('Folder')),
                ],
                child: Material(
                  elevation: 3,
                  color: color.primaryContainer,
                  shape: const CircleBorder(),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Icon(Icons.add, color: color.onPrimaryContainer),
                  ),
                ),
              )
            : null,
      ),
    );
  }
}

class MarkdownEditor extends StatefulWidget {
  const MarkdownEditor({super.key, required this.name, required this.initial});
  final String name, initial;
  @override
  State<MarkdownEditor> createState() => _MarkdownEditorState();
}

class _MarkdownEditorState extends State<MarkdownEditor> {
  late final TextEditingController controller = TextEditingController(
    text: widget.initial,
  );
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.name),
      actions: [
        TextButton.icon(
          onPressed: () => Navigator.pop(context, controller.text),
          icon: const Icon(Icons.check),
          label: const Text('Save'),
        ),
      ],
    ),
    body: Padding(
      padding: const EdgeInsets.all(16),
      child: TextField(
        controller: controller,
        expands: true,
        maxLines: null,
        minLines: null,
        keyboardType: TextInputType.multiline,
        textAlignVertical: TextAlignVertical.top,
        style: const TextStyle(fontFamily: 'monospace', fontSize: 15),
        decoration: const InputDecoration(
          border: InputBorder.none,
          hintText: 'Write Markdown…',
        ),
      ),
    ),
  );
}
