import 'dart:convert';

enum JsonDropPosition { before, inside, after }

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
    _validateLeaves(parsed);
    return JsonDocument._(parsed);
  }

  /// All primitive values are strings; objects and arrays are only structural
  /// containers. Reject unsupported values instead of modifying existing data.
  static void _validateLeaves(Object? value) {
    if (value is String) return;
    if (value is Map<String, dynamic>) {
      for (final child in value.values) {
        _validateLeaves(child);
      }
      return;
    }
    if (value is List) {
      for (final child in value) {
        _validateLeaves(child);
      }
      return;
    }
    throw const FormatException(
      'Only string values are supported in this vault',
    );
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
    _validateLeaves(copy);
    return JsonDocument._(copy);
  }

  /// Build a leaf from the number of value fields entered in Add/Edit.
  /// Zero fields: empty string. One: string. Two or more: string list.
  static Object valueFromFields(List<String> fields) => switch (fields.length) {
    0 => '',
    1 => fields.single,
    _ => List<String>.of(fields),
  };

  /// Insert a child key. An empty string may be promoted to a container on
  /// first child insertion; nonempty values cannot be replaced implicitly.
  JsonDocument addKey(
    List<Object> parentPath,
    String key,
    List<String> fields,
  ) => _change((copy) {
    var parent = _lookup(copy, parentPath);
    if (parent is String && parent.isEmpty && parentPath.isNotEmpty) {
      final ancestor = _lookup(
        copy,
        parentPath.sublist(0, parentPath.length - 1),
      );
      final parentKey = parentPath.last;
      if (ancestor is! Map<String, dynamic> || parentKey is! String) {
        throw const FormatException('Cannot create a child here');
      }
      parent = <String, dynamic>{};
      ancestor[parentKey] = parent;
    }
    if (parent is! Map<String, dynamic>) {
      throw const FormatException(
        'Edit values here; this key cannot contain children',
      );
    }
    final name = key.trim();
    if (name.isEmpty) {
      throw const FormatException('Key cannot be empty');
    }
    if (parent.containsKey(name)) {
      throw FormatException('Key already exists: $name');
    }
    parent[name] = valueFromFields(fields);
  });

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

  /// Check whether [sourcePath] can move to [targetPath] without losing data.
  /// Only named object entries can be dragged; array values remain atomic.
  bool canMoveKey(
    List<Object> sourcePath,
    List<Object> targetPath,
    JsonDropPosition position,
  ) {
    if (sourcePath.isEmpty ||
        targetPath.isEmpty ||
        sourcePath.any((part) => part is! String) ||
        targetPath.any((part) => part is! String)) {
      return false;
    }
    // A key cannot contain itself or any of its descendants.
    if (targetPath.length >= sourcePath.length &&
        _samePath(sourcePath, targetPath.take(sourcePath.length).toList())) {
      return false;
    }
    try {
      final sourceParentPath = sourcePath.sublist(0, sourcePath.length - 1);
      final sourceParent = _lookup(data, sourceParentPath);
      final target = _lookup(data, targetPath);
      final destinationPath = position == JsonDropPosition.inside
          ? targetPath
          : targetPath.sublist(0, targetPath.length - 1);
      final destination = _lookup(data, destinationPath);
      final sourceKey = sourcePath.last as String;
      if (sourceParent is! Map<String, dynamic> ||
          !sourceParent.containsKey(sourceKey)) {
        return false;
      }
      if (position == JsonDropPosition.inside &&
          destination is! Map<String, dynamic> &&
          destination != '') {
        return false;
      }
      if (position != JsonDropPosition.inside &&
          (destination is! Map<String, dynamic> || target == null)) {
        return false;
      }
      if (destination is Map<String, dynamic> &&
          !_samePath(sourceParentPath, destinationPath) &&
          destination.containsKey(sourceKey)) {
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  static bool _samePath(List<Object> a, List<Object> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  /// Move one entire key subtree. Validation occurs before cloning, and
  /// insertion always retains the original key/value pair unchanged.
  JsonDocument moveKey(
    List<Object> sourcePath,
    List<Object> targetPath,
    JsonDropPosition position,
  ) {
    if (!canMoveKey(sourcePath, targetPath, position)) {
      throw const FormatException(
        'Cannot move this key to the selected location',
      );
    }
    return _change((copy) {
      final sourceParentPath = sourcePath.sublist(0, sourcePath.length - 1);
      final sourceParent =
          _lookup(copy, sourceParentPath) as Map<String, dynamic>;
      final sourceKey = sourcePath.last as String;
      final sourceValue = sourceParent.remove(sourceKey);
      if (position == JsonDropPosition.inside) {
        var destination = _lookup(copy, targetPath);
        if (destination is String && destination.isEmpty) {
          final targetParent = _lookup(
            copy,
            targetPath.sublist(0, targetPath.length - 1),
          ) as Map<String, dynamic>;
          destination = <String, dynamic>{};
          targetParent[targetPath.last as String] = destination;
        }
        (destination as Map<String, dynamic>)[sourceKey] = sourceValue;
      } else {
        final targetKey = targetPath.last as String;
        final destination = _lookup(
          copy,
          targetPath.sublist(0, targetPath.length - 1),
        ) as Map<String, dynamic>;
        final ordered = <String, dynamic>{};
        for (final entry in destination.entries) {
          if (position == JsonDropPosition.before && entry.key == targetKey) {
            ordered[sourceKey] = sourceValue;
          }
          ordered[entry.key] = entry.value;
          if (position == JsonDropPosition.after && entry.key == targetKey) {
            ordered[sourceKey] = sourceValue;
          }
        }
        destination
          ..clear()
          ..addAll(ordered);
      }
    });
  }

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
