import 'dart:convert';

import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;

const folderMime = 'application/vnd.google-apps.folder';
const driveScope = 'https://www.googleapis.com/auth/drive';
const googleWebClientId =
    '1064411966305-6vuqla6hbp2aegichjdb3d748jqji4be.apps.googleusercontent.com';

class DriveEntry {
  const DriveEntry({
    required this.id,
    required this.name,
    required this.mimeType,
    this.parentId,
  });
  final String id, name, mimeType;
  final String? parentId;
  bool get isFolder => mimeType == folderMime;
  factory DriveEntry.fromJson(Map<String, dynamic> json) => DriveEntry(
    id: json['id'] as String,
    name: json['name'] as String,
    mimeType: json['mimeType'] as String,
    parentId: (json['parents'] as List?)?.firstOrNull as String?,
  );
}

abstract class VaultStore {
  Future<DriveEntry> root();
  Future<List<DriveEntry>> children(String folderId);
  Future<String> read(String fileId);
  Future<void> write(String fileId, String content);
  Future<DriveEntry> create(
    String folderId,
    String name, {
    bool folder = false,
  });
  Future<void> remove(String id);
  Future<void> rename(String id, String name);
}

class DemoStore implements VaultStore {
  final Map<String, DriveEntry> _entries = {
    'root': const DriveEntry(id: 'root', name: 'secrets', mimeType: folderMime),
    'cloud': const DriveEntry(
      id: 'cloud',
      name: 'cloud',
      mimeType: folderMime,
      parentId: 'root',
    ),
    'services': const DriveEntry(
      id: 'services',
      name: 'services.md',
      mimeType: 'text/markdown',
      parentId: 'root',
    ),
    'github': const DriveEntry(
      id: 'github',
      name: 'github.md',
      mimeType: 'text/markdown',
      parentId: 'root',
    ),
    'main': const DriveEntry(
      id: 'main',
      name: 'main.md',
      mimeType: 'text/markdown',
      parentId: 'cloud',
    ),
  };
  final Map<String, String> _content = {
    'services': '# Services\n\n## Production\n\n- **Notes**\n\n    ```env\n    API_URL=https://example.internal\n    TOKEN=demo-value\n    ```\n\n## Staging\n\n- **Notes**\n\n    ```text\n    Notes for staging.\n    ```',
    'github': '# GitHub\n\n## Personal\n\n- **Username**\n\n    ```text\n    demo-user\n    ```',
    'main': '# Cloud\n\n## Main project\n\n- **Region**\n\n    ```text\n    asia-southeast1\n    ```',
  };
  @override
  Future<DriveEntry> root() async => _entries['root']!;
  @override
  Future<List<DriveEntry>> children(String id) async =>
      _entries.values.where((e) => e.parentId == id).toList();
  @override
  Future<String> read(String id) async => _content[id] ?? '';
  @override
  Future<void> write(String id, String content) async {
    _content[id] = content;
  }

  @override
  Future<DriveEntry> create(
    String id,
    String name, {
    bool folder = false,
  }) async {
    final entry = DriveEntry(
      id: 'demo-${DateTime.now().microsecondsSinceEpoch}',
      name: name,
      mimeType: folder
          ? folderMime
          : name.toLowerCase().endsWith('.json')
          ? 'application/json'
          : 'text/markdown',
      parentId: id,
    );
    _entries[entry.id] = entry;
    return entry;
  }

  @override
  Future<void> remove(String id) async {
    _entries.remove(id);
    _content.remove(id);
  }

  @override
  Future<void> rename(String id, String name) async {
    final old = _entries[id]!;
    _entries[id] = DriveEntry(
      id: id,
      name: name,
      mimeType: old.mimeType,
      parentId: old.parentId,
    );
  }
}

class GoogleDriveStore implements VaultStore {
  GoogleDriveStore(this.account, {required this.signIn});
  GoogleSignInAccount account;
  final GoogleSignIn signIn;
  Future<GoogleSignInAccount?>? _refreshInFlight;
  final http.Client _client = http.Client();
  Future<http.Response> _call(
    String url, {
    String method = 'GET',
    String? body,
    String? contentType,
  }) async {
    Future<http.Response> sendRequest() async {
      final auth = await account.authentication;
      final token = auth.accessToken;
      if (token == null) {
        throw StateError('Google Drive authorization expired. Sign in again.');
      }
      final request = http.Request(method, Uri.parse(url));
      request.headers['Authorization'] = 'Bearer $token';
      if (contentType != null) request.headers['Content-Type'] = contentType;
      if (body != null) request.body = body;
      return http.Response.fromStream(await _client.send(request));
    }

    var response = await sendRequest();
    if (response.statusCode == 401) {
      // Google access tokens have short lifetimes. Silent reauthentication must
      // use the same sign-in instance, and concurrent requests share refresh.
      final future = _refreshInFlight ??= signIn.signInSilently();
      try {
        final refreshed = await future;
        if (refreshed == null) {
          throw StateError('Google session expired. Sign in again.');
        }
        account = refreshed;
        response = await sendRequest();
      } finally {
        if (identical(_refreshInFlight, future)) _refreshInFlight = null;
      }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError(
        'Google Drive (${response.statusCode}): ${response.body}',
      );
    }
    return response;
  }

  static String _listUrl(String q) =>
      Uri.https('www.googleapis.com', '/drive/v3/files', {
        'q': q,
        'fields': 'nextPageToken,files(id,name,mimeType,parents)',
        'pageSize': '1000',
      }).toString();
  @override
  Future<DriveEntry> root() async {
    final found = await _call(
      _listUrl(
        "name='secrets' and mimeType='$folderMime' and 'root' in parents and trashed=false",
      ),
    );
    final entries = (jsonDecode(found.body)['files'] as List)
        .cast<Map<String, dynamic>>();
    if (entries.isNotEmpty) return DriveEntry.fromJson(entries.first);
    return create('root', 'secrets', folder: true);
  }

  @override
  Future<List<DriveEntry>> children(String id) async {
    final result = <DriveEntry>[];
    String? next;
    do {
      final uri = Uri.parse(
        _listUrl("'${id.replaceAll("'", "\\'")}' in parents and trashed=false"),
      );
      final url = next == null
          ? uri
          : uri.replace(
              queryParameters: {...uri.queryParameters, 'pageToken': next},
            );
      final response = await _call(url.toString());
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      result.addAll(
        (data['files'] as List).map(
          (e) => DriveEntry.fromJson(e as Map<String, dynamic>),
        ),
      );
      next = data['nextPageToken'] as String?;
    } while (next != null && next.isNotEmpty);
    return result;
  }

  @override
  Future<String> read(String id) async => utf8.decode(
    (await _call(
      'https://www.googleapis.com/drive/v3/files/${Uri.encodeComponent(id)}?alt=media',
    )).bodyBytes,
  );
  @override
  Future<void> write(String id, String content) async {
    await _call(
      'https://www.googleapis.com/upload/drive/v3/files/${Uri.encodeComponent(id)}?uploadType=media',
      method: 'PATCH',
      body: content,
      contentType:
          content.trimLeft().startsWith('{"format":') ||
              content.contains('"format": "secrets-keep.blocks"')
          ? 'application/json; charset=utf-8'
          : 'text/markdown; charset=utf-8',
    );
  }

  @override
  Future<DriveEntry> create(
    String id,
    String name, {
    bool folder = false,
  }) async {
    final type = folder
        ? folderMime
        : name.toLowerCase().endsWith('.json')
        ? 'application/json'
        : 'text/markdown';
    final metadata = jsonEncode({
      'name': name,
      'mimeType': type,
      'parents': [id],
    });
    final response = await _call(
      'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents',
      method: 'POST',
      body: metadata,
      contentType: 'application/json',
    );
    return DriveEntry.fromJson(
      jsonDecode(response.body) as Map<String, dynamic>,
    );
  }

  @override
  Future<void> remove(String id) async {
    await _call(
      'https://www.googleapis.com/drive/v3/files/${Uri.encodeComponent(id)}',
      method: 'PATCH',
      body: jsonEncode({'trashed': true}),
      contentType: 'application/json',
    );
  }

  @override
  Future<void> rename(String id, String name) async {
    await _call(
      'https://www.googleapis.com/drive/v3/files/${Uri.encodeComponent(id)}',
      method: 'PATCH',
      body: jsonEncode({'name': name}),
      contentType: 'application/json',
    );
  }
}

class _CacheValue<T> {
  const _CacheValue(this.value, this.fetchedAt);
  final T value;
  final DateTime fetchedAt;
}

/// Cache only in process memory: credentials and secret contents must not be
/// serialized to unencrypted SharedPreferences. A failed background fetch can
/// fall back to a previously fetched value for navigation / reading.
class CachedVaultStore implements VaultStore {
  CachedVaultStore(this.source, {this.ttl = const Duration(seconds: 30)});

  final VaultStore source;
  final Duration ttl;
  final Map<String, _CacheValue<List<DriveEntry>>> _children = {};
  final Map<String, _CacheValue<String>> _files = {};
  final Map<String, Future<List<DriveEntry>>> _pendingLists = {};
  final Map<String, Future<String>> _pendingFiles = {};
  DriveEntry? _root;

  bool _fresh(DateTime time) => DateTime.now().difference(time) < ttl;

  @override
  Future<DriveEntry> root() async => _root ??= await source.root();

  @override
  Future<List<DriveEntry>> children(String folderId) {
    final cached = _children[folderId];
    if (cached != null && _fresh(cached.fetchedAt)) {
      return Future.value(List.of(cached.value));
    }
    return _fetchChildren(folderId);
  }

  Future<List<DriveEntry>> refreshChildren(String folderId) =>
      _fetchChildren(folderId, force: true);

  Future<List<DriveEntry>> _fetchChildren(
    String folderId, {
    bool force = false,
  }) {
    final current = _pendingLists[folderId];
    if (current != null) return current;
    final request = source
        .children(folderId)
        .then((value) {
          final copy = List<DriveEntry>.of(value);
          _children[folderId] = _CacheValue(copy, DateTime.now());
          return List<DriveEntry>.of(copy);
        })
        .catchError((Object error, StackTrace trace) {
          final cached = _children[folderId];
          if (!force && cached != null) {
            return List<DriveEntry>.of(cached.value);
          }
          Error.throwWithStackTrace(error, trace);
        })
        .whenComplete(() {
          _pendingLists.remove(folderId);
        });
    _pendingLists[folderId] = request;
    return request;
  }

  @override
  Future<String> read(String fileId) {
    final cached = _files[fileId];
    if (cached != null && _fresh(cached.fetchedAt)) {
      return Future.value(cached.value);
    }
    return _fetchFile(fileId);
  }

  Future<String> refreshFile(String fileId) => _fetchFile(fileId, force: true);

  Future<String> _fetchFile(String fileId, {bool force = false}) {
    final current = _pendingFiles[fileId];
    if (current != null) return current;
    final request = source
        .read(fileId)
        .then((value) {
          _files[fileId] = _CacheValue(value, DateTime.now());
          return value;
        })
        .catchError((Object error, StackTrace trace) {
          final cached = _files[fileId];
          if (!force && cached != null) return cached.value;
          Error.throwWithStackTrace(error, trace);
        })
        .whenComplete(() {
          _pendingFiles.remove(fileId);
        });
    _pendingFiles[fileId] = request;
    return request;
  }

  @override
  Future<void> write(String fileId, String content) async {
    await source.write(fileId, content);
    _files[fileId] = _CacheValue(content, DateTime.now());
  }

  @override
  Future<DriveEntry> create(
    String folderId,
    String name, {
    bool folder = false,
  }) async {
    final result = await source.create(folderId, name, folder: folder);
    _children.clear();
    return result;
  }

  @override
  Future<void> rename(String id, String name) async {
    await source.rename(id, name);
    _children.clear();
  }

  @override
  Future<void> remove(String id) async {
    await source.remove(id);
    _children.clear();
    _files.remove(id);
  }
}
