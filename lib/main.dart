import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'document_view.dart';
import 'folder_drawer.dart';
import 'json_document.dart';
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

/// The signed-in account workflow, separate from the document store. Tests
/// can inject a controllable session without using Google platform channels.
abstract class VaultSession {
  Future<VaultStore?> restore();
  Future<VaultStore?> signIn();
  Future<void> signOut();
}

class _GoogleVaultSession implements VaultSession {
  final GoogleSignIn _google = GoogleSignIn(
    scopes: [driveScope],
    serverClientId: googleWebClientId,
  );

  @override
  Future<VaultStore?> restore() async {
    final account = await _google.signInSilently();
    return account == null ? null : GoogleDriveStore(account, signIn: _google);
  }

  @override
  Future<VaultStore?> signIn() async {
    final account = await _google.signIn();
    return account == null ? null : GoogleDriveStore(account, signIn: _google);
  }

  @override
  Future<void> signOut() async {
    await _google.signOut();
  }
}

class VaultScreen extends StatefulWidget {
  const VaultScreen({
    super.key,
    required this.themeMode,
    required this.onTheme,
    this.session,
  });
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onTheme;
  final VaultSession? session;
  @override
  State<VaultScreen> createState() => _VaultScreenState();
}

class _VaultScreenState extends State<VaultScreen> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final _documentKey = GlobalKey<JsonDocumentViewState>();
  late final VaultSession _session;
  bool _restoringSession = true;
  bool _signedIn = false;
  VaultStore? store;
  final List<DriveEntry> path = [];
  List<DriveEntry> entries = [];
  DriveEntry? openFile;
  String content = '';
  JsonDocument? activeDocument;
  bool busy = false, search = false;
  String query = '', error = '';
  final TextEditingController searchController = TextEditingController();
  @override
  void initState() {
    super.initState();
    _session = widget.session ?? _GoogleVaultSession();
    _restore();
  }

  Future<void> _restore() async {
    try {
      final restoredStore = await _session.restore();
      if (restoredStore != null) {
        await _connect(restoredStore);
        if (mounted && store != null) setState(() => _signedIn = true);
      }
    } catch (_) {
      // A missing or expired session is signed out; the Login screen appears
      // only after the silent restore has actually completed.
    } finally {
      if (mounted) setState(() => _restoringSession = false);
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
        _resetSearch();
      });
    }
  });
  Future<void> _login() async {
    if (_restoringSession || busy) return;
    setState(() {
      _restoringSession = true;
      error = '';
    });
    try {
      final selectedStore = await _session.signIn();
      if (selectedStore != null) {
        await _connect(selectedStore);
        if (mounted && store != null) setState(() => _signedIn = true);
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => _restoringSession = false);
    }
  }

  void _resetSearch() {
    search = false;
    query = '';
    searchController.clear();
  }

  void _toggleSearch() {
    setState(() {
      if (search) {
        _resetSearch();
        FocusManager.instance.primaryFocus?.unfocus();
      } else {
        _resetSearch();
        search = true;
      }
    });
  }

  void _openFolders() => _scaffoldKey.currentState?.openDrawer();

  void _moreAction(String action) {
    switch (action) {
      case 'folders':
        _openFolders();
      case 'migrate':
        _migrateFolder();
      case 'theme':
        _cycleTheme();
      case 'logout':
        _logout();
    }
  }

  Future<void> _open(DriveEntry entry) => _run(() async {
    if (entry.isFolder) {
      final children = await store!.children(entry.id);
      if (mounted) {
        setState(() {
          path.add(entry);
          entries = children;
          _resetSearch();
        });
      }
    } else {
      final text = await store!.read(entry.id);
      if (mounted) {
        setState(() {
          openFile = entry;
          content = text;
          activeDocument = entry.name.toLowerCase().endsWith('.json')
              ? JsonDocument.parse(text)
              : null;
          _resetSearch();
        });
      }
    }
  });
  Future<void> _back() => _run(() async {
    if (openFile != null) {
      setState(() {
        openFile = null;
        activeDocument = null;
        _resetSearch();
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

  Future<void> _deleteEntry(DriveEntry entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text('Delete ${entry.name}?'),
        content: const Text('Move this item to Google Drive Trash?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _run(() async {
      await store!.remove(entry.id);
      final refreshed = await store!.children(path.last.id);
      if (mounted) {
        setState(() {
          entries = refreshed;
          if (openFile?.id == entry.id) {
            openFile = null;
            activeDocument = null;
            content = '';
          }
        });
      }
    });
  }

  void _cycleTheme() {
    final next = switch (widget.themeMode) {
      ThemeMode.system => ThemeMode.light,
      ThemeMode.light => ThemeMode.dark,
      ThemeMode.dark => ThemeMode.system,
    };
    widget.onTheme(next);
  }

  Future<void> _logout() async {
    try {
      await _session.signOut();
      if (mounted) {
        setState(() {
          _signedIn = false;
          _restoringSession = false;
          store = null;
          path.clear();
          entries = [];
          openFile = null;
          activeDocument = null;
          _resetSearch();
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

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
      if (mounted) {
        setState(() {
          entries = refreshed;
          if (openFile?.id == entry.id) {
            openFile = refreshed.firstWhere((item) => item.id == entry.id);
          }
        });
      }
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
          await store!.write(created.id, JsonDocument.empty().toJson());
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

  Future<bool> _saveDocument(JsonDocument document) async {
    final file = openFile;
    if (file == null || busy) return false;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final encoded = document.toJson();
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
          'Create a formatted JSON copy of ${source.name}. '
          'The Markdown original is preserved; unsupported syntax is reported rather than discarded.',
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
          ? JsonDocument.parse(raw)
          : null;
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

  List<PopupMenuEntry<String>> _fileMenuItems(DriveEntry entry) => [
    if (entry.name.toLowerCase().endsWith('.md'))
      _menuOption('convert', Icons.data_object, 'Convert to JSON'),
    _menuOption('rename', Icons.edit_outlined, 'Rename'),
    // Deletion is available only for Markdown, never for JSON or folders.
    if (!entry.isFolder && entry.name.toLowerCase().endsWith('.md'))
      _menuOption('delete', Icons.delete_outline, 'Delete'),
  ];

  Future<void> _showFileContextMenu(
    DriveEntry entry,
    LongPressStartDetails details,
  ) async {
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
    final at = overlay.globalToLocal(details.globalPosition);
    final position = RelativeRect.fromRect(
      Rect.fromLTWH(at.dx, at.dy, 1, 1),
      Offset.zero & overlay.size,
    );
    final action = await showMenu<String>(
      context: context,
      position: position,
      items: _fileMenuItems(entry),
    );
    if (action != null) await _fileOption(action, entry);
  }

  PopupMenuEntry<String> _menuOption(
    String action,
    IconData icon,
    String title,
  ) => PopupMenuItem<String>(
    value: action,
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 20),
        const SizedBox(width: 12),
        Flexible(
          child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      ],
    ),
  );

  Future<void> _fileOption(String action, DriveEntry entry) async {
    switch (action) {
      case 'convert':
        await _migrateOne(entry);
      case 'rename':
        await _renameEntry(entry);
      case 'delete':
        if (!entry.isFolder && entry.name.toLowerCase().endsWith('.md')) {
          await _deleteEntry(entry);
        }
    }
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
          title: search && (current == null || activeDocument != null)
              ? TextField(
                  controller: searchController,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: current == null ? 'Search files' : 'Search JSON',
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
            if (store != null && (current == null || activeDocument != null))
              IconButton(
                tooltip: search
                    ? 'Close search'
                    : current == null
                    ? 'Search files'
                    : 'Search JSON',
                icon: Icon(search ? Icons.close : Icons.search),
                onPressed: _toggleSearch,
              ),
            if (!search && activeDocument != null)
              IconButton(
                tooltip: 'Add entry',
                icon: const Icon(Icons.add),
                onPressed: () => _documentKey.currentState?.addRootEntry(),
              ),
            if (!search && store != null && current == null)
              PopupMenuButton<String>(
                tooltip: 'Add',
                icon: const Icon(Icons.add),
                onSelected: _create,
                itemBuilder: (_) => [
                  _menuOption(
                    'folder',
                    Icons.create_new_folder_outlined,
                    'New folder',
                  ),
                  _menuOption(
                    'md',
                    Icons.note_add_outlined,
                    'New Markdown file',
                  ),
                  _menuOption('json', Icons.data_object, 'New JSON document'),
                ],
              ),
            if (!search && current != null)
              PopupMenuButton<String>(
                tooltip: 'File options',
                onSelected: (action) => action == 'folders'
                    ? _openFolders()
                    : _fileOption(action, current),
                itemBuilder: (_) => [
                  ..._fileMenuItems(current),
                  _menuOption(
                    'folders',
                    Icons.account_tree_outlined,
                    'Browse folders',
                  ),
                ],
              ),
            if (!search && store != null && current == null)
              PopupMenuButton<String>(
                tooltip: 'More',
                onSelected: _moreAction,
                itemBuilder: (_) => [
                  _menuOption(
                    'folders',
                    Icons.account_tree_outlined,
                    'Browse folders',
                  ),
                  _menuOption(
                    'migrate',
                    Icons.transform_outlined,
                    'Migrate folder to JSON',
                  ),
                  _menuOption(
                    'theme',
                    Icons.brightness_auto_outlined,
                    'Theme: ${widget.themeMode.name}',
                  ),
                  if (_signedIn)
                    _menuOption('logout', Icons.logout, 'Sign out'),
                ],
              ),
          ],
        ),
        // The AppBar already handles the status-bar inset. Protect the
        // scrollable body from Android's gesture/navigation area without
        // adding the top inset twice (including with edge-to-edge enabled).
        body: SafeArea(
          top: false,
          child: Column(
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
                child: _restoringSession
                    ? const Center(
                        child: CircularProgressIndicator(
                          key: ValueKey('vault-session-loading'),
                          semanticsLabel: 'Restoring session',
                        ),
                      )
                    : store == null
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
                    ? activeDocument != null
                          ? JsonDocumentView(
                              key: _documentKey,
                              documentId: current.id,
                              document: activeDocument!,
                              searchQuery: search ? query : '',
                              onSave: _saveDocument,
                            )
                          : ListView(
                              padding: const EdgeInsets.all(18),
                              children: [
                                Text(
                                  'Markdown source (not rendered)',
                                  style: Theme.of(context)
                                      .textTheme
                                      .labelMedium,
                                ),
                                const SizedBox(height: 12),
                                SelectableText(
                                  content,
                                  style: const TextStyle(
                                    fontFamily: 'monospace',
                                    fontSize: 13,
                                  ),
                                ),
                              ],
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
                                              (entry.name
                                                      .toLowerCase()
                                                      .endsWith('.md') ||
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
                                return GestureDetector(
                                  onLongPressStart: (details) =>
                                      _showFileContextMenu(entry, details),
                                  child: ListTile(
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
                                      tooltip: 'Options for ${entry.name}',
                                      onSelected: (action) =>
                                          _fileOption(action, entry),
                                      itemBuilder: (context) =>
                                          _fileMenuItems(entry),
                                    ),
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
        ),
      ),
    );
  }
}
