import 'dart:convert';

import 'json_document.dart';

/// Importer for the legacy Secrets Keep Markdown hierarchy. Markdown is NOT
/// interpreted or rendered at runtime: it is only read during explicit import.
/// Unsupported syntax is rejected rather than silently losing secret data.
class MarkdownToJson {
  static JsonDocument convert(String markdown) =>
      JsonDocument.parse(jsonEncode(_parse(markdown)));

  static Map<String, dynamic> _parse(String source) {
    final root = <String, dynamic>{};
    final headings = <_Heading>[];
    _Item? currentItem;
    final lines = source.replaceAll('\r\n', '\n').split('\n');

    void put(Map<String, dynamic> parent, String key, dynamic value, int line) {
      final name = key.trim();
      if (name.isEmpty) throw FormatException('Empty name at line $line');
      if (parent.containsKey(name)) {
        throw FormatException('Duplicate key "$name" at line $line');
      }
      parent[name] = value;
    }

    Map<String, dynamic> headingContainer(_Heading heading, int line) {
      final value = heading.parent[heading.key];
      if (value is Map<String, dynamic>) return value;
      throw FormatException(
        '"${heading.key}" has a value and cannot contain children (line $line)',
      );
    }

    void code(String value, int line) {
      if (currentItem != null) {
        (currentItem.parent[currentItem.key] as List).add(value);
        return;
      }
      if (headings.isEmpty) {
        throw FormatException('Code outside any heading at line $line');
      }
      final heading = headings.last;
      final existing = heading.parent[heading.key];
      if (existing is Map && existing.isEmpty) {
        heading.parent[heading.key] = value;
      } else if (existing is String) {
        heading.parent[heading.key] = [existing, value];
      } else if (existing is List) {
        existing.add(value);
      } else {
        throw FormatException(
          'Cannot mix code and nested entries under "${heading.key}" at line $line',
        );
      }
    }

    for (var i = 0; i < lines.length; i++) {
      final line = lines[i];
      if (line.trim().isEmpty) continue;
      final headingMatch = RegExp(r'^\s{0,3}(#{1,6})\s+(.+?)\s*$')
          .firstMatch(line);
      if (headingMatch != null) {
        final level = headingMatch.group(1)!.length;
        final name = headingMatch.group(2)!.trim();
        while (headings.isNotEmpty && headings.last.level >= level) {
          headings.removeLast();
        }
        currentItem = null;
        final parent = headings.isEmpty
            ? root
            : headingContainer(headings.last, i + 1);
        put(parent, name, <String, dynamic>{}, i + 1);
        headings.add(_Heading(level, parent, name));
        continue;
      }
      final itemMatch = RegExp(r'^\s*-\s+(.+?)\s*$').firstMatch(line);
      if (itemMatch != null) {
        if (headings.isEmpty) {
          throw FormatException('Item without heading at line ${i + 1}');
        }
        var name = itemMatch.group(1)!.trim();
        if (name.startsWith('**') && name.endsWith('**') && name.length > 4) {
          name = name.substring(2, name.length - 2).trim();
        }
        final parent = headingContainer(headings.last, i + 1);
        put(parent, name, <String>[], i + 1);
        currentItem = _Item(parent, name);
        continue;
      }
      // Inline fenced content, e.g. ```e``` and ```f```, becomes ["e", "f"].
      final inline = RegExp(r'^\s*(`{3,})(.*?)\1\s*$').firstMatch(line);
      if (inline != null) {
        code(inline.group(2)!, i + 1);
        continue;
      }
      final fence = RegExp(r'^\s*(`{3,})([^`]*)$').firstMatch(line);
      if (fence != null) {
        final marker = fence.group(1)!;
        final start = i + 1;
        final collected = <String>[];
        var closed = false;
        while (++i < lines.length) {
          if (lines[i].trim() == marker) {
            closed = true;
            break;
          }
          collected.add(lines[i]);
        }
        if (!closed) {
          throw FormatException('Unclosed code fence at line $start');
        }
        while (collected.isNotEmpty && collected.last == '') {
          collected.removeLast();
        }
        final nonblank = collected
            .where((line) => line.trim().isNotEmpty)
            .toList();
        final indent = nonblank.isEmpty
            ? 0
            : nonblank
                  .map((line) => line.length - line.trimLeft().length)
                  .reduce((a, b) => a < b ? a : b);
        code(
          collected
              .map(
                (line) => line.length >= indent ? line.substring(indent) : line,
              )
              .join('\n'),
          start,
        );
        continue;
      }
      throw FormatException(
        'Unsupported Markdown at line ${i + 1}: ${line.trim()}',
      );
    }
    dynamic normalize(dynamic value) {
      if (value is Map<String, dynamic>) {
        if (value.isEmpty) return '';
        return <String, dynamic>{
          for (final entry in value.entries) entry.key: normalize(entry.value),
        };
      }
      if (value is List) {
        if (value.isEmpty) return '';
        if (value.length == 1) return value.first;
        return List<String>.from(value);
      }
      return value;
    }

    return <String, dynamic>{
      for (final entry in root.entries) entry.key: normalize(entry.value),
    };
  }
}

class _Heading {
  _Heading(this.level, this.parent, this.key);
  final int level;
  final Map<String, dynamic> parent;
  final String key;
}

class _Item {
  _Item(this.parent, this.key);
  final Map<String, dynamic> parent;
  final String key;
}
