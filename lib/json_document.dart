import 'dart:convert';

/// A vault document is a plain JSON object: no Markdown block wrapper.
class JsonDocument {
  JsonDocument._(this.data);
  final Map<String, dynamic> data;

  factory JsonDocument.empty() => JsonDocument._(<String, dynamic>{});

  factory JsonDocument.parse(String source) {
    final parsed = jsonDecode(source);
    if (parsed is! Map<String, dynamic>) {
      throw const FormatException('The root of a vault must be a JSON object');
    }
    return JsonDocument._(parsed);
  }

  /// Canonical, readable, consistently indented (2 spaces), with final newline.
  String toJson() => '${const JsonEncoder.withIndent('  ').convert(data)}\n';

  Object? at(List<Object> path) => _lookup(data, path);

  static dynamic _lookup(dynamic root, List<Object> path) {
    var current = root;
    for (final part in path) {
      if (current is Map<String, dynamic> &&
          part is String &&
          current.containsKey(part)) {
        current = current[part];
      } else if (current is List &&
          part is int &&
          part >= 0 &&
          part < current.length) {
        current = current[part];
      } else {
        throw StateError('Invalid JSON path: $path');
      }
    }
    return current;
  }

  JsonDocument _change(void Function(Map<String, dynamic>) operation) {
    final copy = jsonDecode(jsonEncode(data)) as Map<String, dynamic>;
    operation(copy);
    return JsonDocument._(copy);
  }

  JsonDocument add(List<Object> parentPath, String? key, Object? value) =>
      _change((copy) {
        final parent = _lookup(copy, parentPath);
        if (parent is Map<String, dynamic>) {
          final name = key?.trim() ?? '';
          if (name.isEmpty) {
            throw const FormatException('A JSON object key cannot be empty');
          }
          if (parent.containsKey(name)) {
            throw FormatException('Key already exists: $name');
          }
          parent[name] = value;
        } else if (parent is List) {
          parent.add(value);
        } else {
          throw const FormatException(
            'Select an object or array to add a child',
          );
        }
      });

  JsonDocument update(List<Object> path, Object? value, {String? newKey}) =>
      _change((copy) {
        if (path.isEmpty) {
          throw const FormatException('Cannot replace the root object');
        }
        final parent = _lookup(copy, path.sublist(0, path.length - 1));
        final key = path.last;
        if (parent is Map<String, dynamic> &&
            key is String &&
            parent.containsKey(key)) {
          final requested = newKey?.trim() ?? key;
          if (requested.isEmpty) {
            throw const FormatException('Key cannot be empty');
          }
          if (requested != key && parent.containsKey(requested)) {
            throw FormatException('Key already exists: $requested');
          }
          if (requested == key) {
            parent[key] = value;
            return;
          }
          final replacement = <String, dynamic>{};
          for (final entry in parent.entries) {
            replacement[entry.key == key ? requested : entry.key] =
                entry.key == key ? value : entry.value;
          }
          parent
            ..clear()
            ..addAll(replacement);
        } else if (parent is List &&
            key is int &&
            key >= 0 &&
            key < parent.length) {
          parent[key] = value;
        } else {
          throw StateError('Invalid JSON path: $path');
        }
      });

  JsonDocument delete(List<Object> path) => _change((copy) {
    if (path.isEmpty) {
      throw const FormatException('Cannot delete the root object');
    }
    final parent = _lookup(copy, path.sublist(0, path.length - 1));
    final key = path.last;
    if (parent is Map<String, dynamic> &&
        key is String &&
        parent.containsKey(key)) {
      parent.remove(key);
    } else if (parent is List &&
        key is int &&
        key >= 0 &&
        key < parent.length) {
      parent.removeAt(key);
    } else {
      throw StateError('Invalid JSON path: $path');
    }
  });

  /// Reorder within the same object/array without changing its contents.
  JsonDocument reorder(List<Object> parentPath, int from, int to) => _change((
    copy,
  ) {
    final parent = _lookup(copy, parentPath);
    if (parent is List) {
      if (from < 0 || from >= parent.length || to < 0 || to >= parent.length) {
        throw RangeError('Index out of bounds');
      }
      final moved = parent.removeAt(from);
      parent.insert(to, moved);
    } else if (parent is Map<String, dynamic>) {
      final entries = parent.entries.toList();
      if (from < 0 ||
          from >= entries.length ||
          to < 0 ||
          to >= entries.length) {
        throw RangeError('Index out of bounds');
      }
      final moved = entries.removeAt(from);
      entries.insert(to, moved);
      parent
        ..clear()
        ..addEntries(entries);
    } else {
      throw const FormatException('Only objects and arrays can be reordered');
    }
  });
}
