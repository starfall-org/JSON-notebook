import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'document_view.dart';
import 'firebase_options.dart';
import 'folder_drawer.dart';
import 'json_document.dart';
import 'notebook_theme.dart';
import 'system_bars.dart';
import 'vault_migration.dart';
import 'vault_naming.dart';
import 'vault_store.dart';

export 'vault_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await configureSystemBars();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const JsonNotebookApp());
}

class JsonNotebookApp extends StatefulWidget {
  const JsonNotebookApp({super.key});
  @override
  State<JsonNotebookApp> createState() => _JsonNotebookAppState();
}

class _JsonNotebookAppState extends State<JsonNotebookApp> {
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
  Widget build(BuildContext context) {
    final lightTheme = NotebookTheme.light;
    final darkTheme = NotebookTheme.dark;
    final brightness = systemBarBrightness(
      themeMode,
      MediaQuery.platformBrightnessOf(context),
    );
    final background = (brightness == Brightness.dark ? darkTheme : lightTheme)
        .scaffoldBackgroundColor;
    return MaterialApp(
      title: 'JSON Notebook',
      color: background,
      debugShowCheckedModeBanner: false,
      builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: navigationBarStyle(brightness, backgroundColor: background),
        child: ColoredBox(
          color: background,
          child: child ?? const SizedBox.shrink(),
        ),
      ),
      themeMode: themeMode,
      theme: lightTheme,
      darkTheme: darkTheme,
      home: VaultScreen(themeMode: themeMode, onTheme: _setTheme),
    );
  }
}

/// The signed-in account workflow, separate from the document store. Tests
/// can inject a controllable session without using Google platform channels.
abstract class VaultSession {
  Future<VaultStore?> restore();
  Future<VaultStore?> signIn();
  Future<void> signOut();
}

/// Firebase Authentication owns identity and session persistence. Google
/// OAuth access tokens are separately required for Drive and remain in RAM.
class _FirebaseVaultSession implements VaultSession {
  FirebaseAuth get _auth => FirebaseAuth.instance;
  late final GoogleSignIn _nativeGoogle = GoogleSignIn(
    scopes: [driveScope],
    serverClientId: googleWebClientId,
  );

  GoogleSignInAccount? _nativeAccount;
  String? _webDriveToken;

  bool get hasWebIdentity => kIsWeb && _auth.currentUser != null;

  GoogleAuthProvider _driveProvider() =>
      GoogleAuthProvider()..addScope(driveScope);

  GoogleDriveStore _webStore() => GoogleDriveStore(
    accessToken: () async => _webDriveToken,
    // Firebase does not expose a Google OAuth refresh token. A new popup
    // must start from an explicit user tap, not from a background API request.
  );

  GoogleDriveStore _nativeStore() => GoogleDriveStore(
    accessToken: () async {
      final account = _nativeAccount;
      return account == null
          ? null
          : (await account.authentication).accessToken;
    },
    onUnauthorized: () async {
      final account = await _nativeGoogle.signInSilently();
      if (account == null) return false;
      _nativeAccount = account;
      return (await account.authentication).accessToken != null;
    },
  );

  Future<VaultStore> _connectNative(GoogleSignInAccount account) async {
    final credentials = await account.authentication;
    if (credentials.idToken == null || credentials.accessToken == null) {
      throw StateError('Google Drive authorization failed. Sign in again.');
    }
    // Also upgrades pre-Firebase native Google sessions on first restoration.
    await _auth.signInWithCredential(
      GoogleAuthProvider.credential(
        idToken: credentials.idToken,
        accessToken: credentials.accessToken,
      ),
    );
    _nativeAccount = account;
    return _nativeStore();
  }

  @override
  Future<VaultStore?> restore() async {
    // Wait until Firebase has restored its persisted identity before showing UI.
    await _auth.authStateChanges().first;
    if (kIsWeb) {
      // Firebase restores identity but not Google Drive OAuth access tokens.
      // A user-initiated popup is required to reconnect Drive after a reload.
      return _webDriveToken == null ? null : _webStore();
    }
    final account = await _nativeGoogle.signInSilently();
    return account == null ? null : _connectNative(account);
  }

  @override
  Future<VaultStore?> signIn() async {
    if (kIsWeb) {
      final result = await _auth.signInWithPopup(_driveProvider());
      final accessToken = result.credential?.accessToken;
      if (accessToken == null || accessToken.isEmpty) {
        throw StateError('Google Drive permission was not granted.');
      }
      _webDriveToken = accessToken;
      return _webStore();
    }
    final account = await _nativeGoogle.signIn();
    return account == null ? null : _connectNative(account);
  }

  @override
  Future<void> signOut() async {
    _webDriveToken = null;
    _nativeAccount = null;
    try {
      if (!kIsWeb) await _nativeGoogle.signOut();
    } finally {
      await _auth.signOut();
    }
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
  bool _needsDriveReconnect = false;
  String query = '', error = '';
  final TextEditingController searchController = TextEditingController();
  @override
  void initState() {
    super.initState();
    _session = widget.session ?? _FirebaseVaultSession();
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
      _needsDriveReconnect = false;
    });
    try {
      await operation();
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          _needsDriveReconnect = e is DriveAuthorizationExpired;
        });
      }
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
      case 'exit-demo':
        _clearVault();
      case 'refresh':
        _refresh();
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
    await _openAncestor(path.length - 2);
  });

  Future<void> _openAncestor(int index) async {
    final children = await store!.children(path[index].id);
    if (mounted) {
      setState(() {
        path.removeRange(index + 1, path.length);
        entries = children;
        openFile = null;
        activeDocument = null;
        content = '';
        _resetSearch();
      });
    }
  }

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
          decoration: const InputDecoration(labelText: 'Name'),
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

  void _clearVault() {
    setState(() {
      _signedIn = false;
      _restoringSession = false;
      _needsDriveReconnect = false;
      error = '';
      store = null;
      path.clear();
      entries = [];
      openFile = null;
      activeDocument = null;
      content = '';
      _resetSearch();
    });
  }

  Future<void> _logout() async {
    try {
      await _session.signOut();
      if (mounted) _clearVault();
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
      _needsDriveReconnect = false;
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
      if (mounted) {
        setState(() {
          error = e.toString();
          _needsDriveReconnect = e is DriveAuthorizationExpired;
        });
      }
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

  Widget _loginCard(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme;
    final session = _session;
    final reconnect =
        session is _FirebaseVaultSession && session.hasWebIdentity;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: SizedBox(
          width: 420,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: color.surface,
              border: Border.all(color: color.outlineVariant),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: color.primaryContainer,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Icon(
                          Icons.data_object,
                          size: 28,
                          color: color.onPrimaryContainer,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text('JSON Notebook', style: theme.textTheme.headlineMedium),
                  const SizedBox(height: 8),
                  Text(
                    'Organize your notes in JSON files stored in Google Drive.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: color.onSurfaceVariant,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: busy ? null : _login,
                    icon: const Icon(Icons.login),
                    label: Text(
                      reconnect
                          ? 'Reconnect Google Drive'
                          : 'Continue with Google',
                    ),
                  ),
                  const SizedBox(height: 6),
                  OutlinedButton(
                    onPressed: busy ? null : () => _connect(DemoStore()),
                    child: const Text('Explore demo'),
                  ),
                  if (reconnect)
                    TextButton(
                      onPressed: busy ? null : _logout,
                      child: const Text('Sign out'),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _breadcrumbs(bool inDocument) {
    final color = Theme.of(context).colorScheme;
    final count = inDocument ? path.length : path.length - 1;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        notebookContentInset,
        8,
        notebookContentInset,
        0,
      ),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          reverse: true,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < count; i++) ...[
                TextButton(
                  onPressed: busy ? null : () => _run(() => _openAncestor(i)),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 160),
                    child: Text(
                      path[i].name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                if (i + 1 < count)
                  Icon(
                    Icons.chevron_right,
                    size: 16,
                    color: color.onSurfaceVariant,
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _folderList(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme;
    final needle = query.trim().toLowerCase();
    final visible =
        entries.where((entry) {
          final name = entry.name.toLowerCase();
          return (entry.isFolder ||
                  name.endsWith('.md') ||
                  name.endsWith('.json')) &&
              name.contains(needle);
        }).toList()..sort((a, b) {
          if (a.isFolder != b.isFolder) return a.isFolder ? -1 : 1;
          return a.name.toLowerCase().compareTo(b.name.toLowerCase());
        });

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          notebookContentInset,
          16,
          notebookContentInset,
          24,
        ),
        itemCount: visible.isEmpty ? 1 : visible.length,
        itemBuilder: (context, index) {
          if (visible.isEmpty) {
            return Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: color.surface,
                border: Border.all(color: color.outlineVariant),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                needle.isEmpty ? 'This folder is empty' : 'No matching files',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: color.onSurfaceVariant,
                ),
              ),
            );
          }
          final entry = visible[index];
          final isJson = entry.name.toLowerCase().endsWith('.json');
          final radius = BorderRadius.circular(12);
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Material(
              color: color.surface,
              borderRadius: radius,
              clipBehavior: Clip.antiAlias,
              child: Ink(
                decoration: BoxDecoration(
                  borderRadius: radius,
                  border: Border.all(color: color.outlineVariant),
                ),
                child: GestureDetector(
                  onLongPressStart: busy
                      ? null
                      : (details) => _showFileContextMenu(entry, details),
                  child: ListTile(
                    contentPadding: const EdgeInsetsDirectional.only(
                      start: 14,
                      end: 6,
                    ),
                    leading: DecoratedBox(
                      decoration: BoxDecoration(
                        color: entry.isFolder
                            ? color.primaryContainer
                            : color.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Icon(
                          entry.isFolder
                              ? Icons.folder_outlined
                              : isJson
                              ? Icons.data_object
                              : Icons.description_outlined,
                          size: 20,
                          color: entry.isFolder
                              ? color.onPrimaryContainer
                              : color.onSurfaceVariant,
                        ),
                      ),
                    ),
                    title: Text(
                      entry.isFolder ? entry.name : _fileTitle(entry.name),
                      style: theme.textTheme.titleSmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: entry.isFolder
                        ? null
                        : Text(isJson ? 'JSON · Structured' : 'Markdown'),
                    onTap: busy ? null : () => _open(entry),
                    trailing: PopupMenuButton<String>(
                      tooltip: 'Options for ${entry.name}',
                      enabled: !busy,
                      onSelected: (action) => _fileOption(action, entry),
                      itemBuilder: (context) => _fileMenuItems(entry),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  String _fileTitle(String name) =>
      name.replaceFirst(RegExp(r'\.(?:md|json)$', caseSensitive: false), '');

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme;
    final current = openFile;
    final size = MediaQuery.sizeOf(context);
    final safePadding = MediaQuery.paddingOf(context);
    final columnWidth = size.width - safePadding.horizontal;
    final gutter = columnWidth > notebookWidth
        ? (columnWidth - notebookWidth) / 2
        : 0.0;
    final showRefresh = columnWidth >= 600;
    final hasNavigation = store != null;
    final themeIcon = switch (widget.themeMode) {
      ThemeMode.system => Icons.brightness_auto_outlined,
      ThemeMode.light => Icons.light_mode_outlined,
      ThemeMode.dark => Icons.dark_mode_outlined,
    };
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
          automaticallyImplyLeading: false,
          shape: hasNavigation ? null : const Border(),
          leadingWidth: gutter + 54,
          actionsPadding: EdgeInsetsDirectional.only(end: gutter + 6),
          titleSpacing: 6,
          title: !hasNavigation
              ? null
              : search
              ? TextField(
                  controller: searchController,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: current == null ? 'Search files' : 'Search JSON',
                    isDense: true,
                    fillColor: color.surface,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                  ),
                  onChanged: (value) => setState(() => query = value),
                )
              : Text(
                  current == null ? path.last.name : _fileTitle(current.name),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
          leading: !hasNavigation
              ? null
              : Padding(
                  padding: EdgeInsetsDirectional.only(start: gutter + 6),
                  child: (current != null || path.length > 1)
                      ? IconButton(
                          tooltip: MaterialLocalizations.of(context)
                              .backButtonTooltip,
                          icon: const BackButtonIcon(),
                          onPressed: busy ? null : _back,
                        )
                      : IconButton(
                          tooltip: 'Folders',
                          icon: const Icon(Icons.menu),
                          onPressed: _openFolders,
                        ),
                ),
          actions: [
            if (!hasNavigation)
              IconButton(
                tooltip: 'Theme: ${widget.themeMode.name}',
                icon: Icon(themeIcon),
                onPressed: _cycleTheme,
              ),
            if (hasNavigation && (current == null || activeDocument != null))
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
                enabled: !busy,
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
                enabled: !busy,
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
            if (!search && hasNavigation && current == null && showRefresh)
              IconButton(
                tooltip: 'Refresh folder',
                icon: const Icon(Icons.refresh),
                onPressed: busy ? null : _refresh,
              ),
            if (!search && hasNavigation && current == null)
              PopupMenuButton<String>(
                tooltip: 'More',
                enabled: !busy,
                onSelected: _moreAction,
                itemBuilder: (_) => [
                  if (!showRefresh)
                    _menuOption('refresh', Icons.refresh, 'Refresh folder'),
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
                    _menuOption('logout', Icons.logout, 'Sign out')
                  else
                    _menuOption('exit-demo', Icons.logout, 'Exit demo'),
                ],
              ),
          ],
        ),
        body: SafeArea(
          top: false,
          child: Center(
            child: SizedBox(
              width: notebookWidth,
              child: Column(
                children: [
                  if (busy) const LinearProgressIndicator(),
                  if (error.isNotEmpty)
                    MaterialBanner(
                      content: SelectableText(error),
                      actions: [
                        if (_needsDriveReconnect)
                          TextButton(
                            onPressed: _login,
                            child: const Text('Reconnect Google Drive'),
                          ),
                        TextButton(
                          onPressed: () => setState(() => error = ''),
                          child: const Text('Dismiss'),
                        ),
                      ],
                    ),
                  if (path.length > 1 || current != null)
                    _breadcrumbs(current != null),
                  Expanded(
                    child: _restoringSession
                        ? const Center(
                            child: CircularProgressIndicator(
                              key: ValueKey('vault-session-loading'),
                              semanticsLabel: 'Restoring session',
                            ),
                          )
                        : !hasNavigation
                        ? _loginCard(context)
                        : current == null
                        ? _folderList(context)
                        : activeDocument != null
                        ? JsonDocumentView(
                            key: _documentKey,
                            documentId: current.id,
                            document: activeDocument!,
                            searchQuery: search ? query : '',
                            onSave: _saveDocument,
                          )
                        : ListView(
                            padding: const EdgeInsets.all(notebookContentInset),
                            children: [
                              Text(
                                'Markdown source (not rendered)',
                                style: theme.textTheme.labelLarge,
                              ),
                              const SizedBox(height: 8),
                              Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: color.surface,
                                  border: Border.all(
                                    color: color.outlineVariant,
                                  ),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: SelectableText(
                                  content,
                                  style: notebookContentStyle,
                                ),
                              ),
                            ],
                          ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
