import 'dart:convert';

import 'json_document.dart';

/// Importer for the legacy Secrets Keep Markdown hierarchy. Markdown is NOT
/// interpreted or rendered at runtime: it is only read during explicit import.
/// Unsupported presentation markup is removed while keeping text content.
/// Structural conflicts and malformed code fences still fail conversion.
class MarkdownToJson {
  static JsonDocument convert(String markdown) =>
      JsonDocument.parse(jsonEncode(_parse(markdown)));

  static Map<String, dynamic> _parse(String source) {
    final root = <String, dynamic>{};
    final headings = <_Heading>[];
    _Item? currentItem;
    final lines = source.replaceAll('\r\n', '\n').split('\n');
    final pendingText = <String>[];
    var pendingStart = 0;

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
        heading.parent[heading.key] = <String>[value];
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

    void flushText() {
      while (pendingText.isNotEmpty && pendingText.last.isEmpty) {
        pendingText.removeLast();
      }
      if (pendingText.isNotEmpty) {
        code(pendingText.join('\n'), pendingStart);
        pendingText.clear();
      }
    }

    void addText(String text, int line) {
      if (text.isEmpty) return;
      if (pendingText.isEmpty) pendingStart = line;
      pendingText.add(text);
    }

    for (var i = 0; i < lines.length; i++) {
      final line = lines[i];
      if (line.trim().isEmpty) {
        if (pendingText.isNotEmpty) pendingText.add('');
        continue;
      }
      final headingMatch = RegExp(r'^\s{0,3}(#{1,6})\s+(.+?)\s*$')
          .firstMatch(line);
      if (headingMatch != null) {
        flushText();
        final level = headingMatch.group(1)!.length;
        final name = _plainText(headingMatch.group(2)!, preserveLinks: true);
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
        flushText();
        if (headings.isEmpty) {
          throw FormatException('Item without heading at line ${i + 1}');
        }
        final name = _plainText(itemMatch.group(1)!, preserveLinks: true);
        final parent = headingContainer(headings.last, i + 1);
        put(parent, name, <String>[], i + 1);
        currentItem = _Item(parent, name);
        continue;
      }
      // Inline fenced content, e.g. ```e``` and ```f```, becomes ["e", "f"].
      final inline = RegExp(r'^\s*(`{3,})(.*?)\1\s*$').firstMatch(line);
      if (inline != null) {
        flushText();
        code(inline.group(2)!, i + 1);
        continue;
      }
      final fence = RegExp(r'^\s*(`{3,})([^`]*)$').firstMatch(line);
      if (fence != null) {
        flushText();
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
      // GFM tables are presentation markup, not JSON structure. Keep every
      // data cell and its column heading as readable text; discard only the
      // separator row and pipe/padding syntax.
      final header = _tableCells(line);
      if (header != null &&
          i + 1 < lines.length &&
          _isTableSeparator(lines[i + 1], header.length)) {
        flushText();
        final start = i + 1;
        i++; // Consume the Markdown alignment separator, not its content.
        final rows = <String>[];
        while (i + 1 < lines.length) {
          final cells = _tableCells(lines[i + 1]);
          if (cells == null) break;
          i++;
          final parts = <String>[];
          for (var column = 0; column < cells.length; column++) {
            final value = _plainText(cells[column]);
            final heading = column < header.length
                ? _plainText(header[column])
                : '';
            parts.add(heading.isEmpty ? value : '$heading: $value');
          }
          rows.add(parts.join('; '));
        }
        if (rows.isEmpty) {
          addText(header.map(_plainText).join('; '), start);
        } else {
          addText(rows.join('\n'), start);
        }
        continue;
      }
      // Ignore visual separators, HTML-only layout wrappers and spacing.
      if (_isDecorationOnly(line)) continue;
      addText(_plainText(line), i + 1);
    }
    flushText();
    dynamic normalize(dynamic value) {
      if (value is Map<String, dynamic>) {
        if (value.isEmpty) return '';
        return <String, dynamic>{
          for (final entry in value.entries) entry.key: normalize(entry.value),
        };
      }
      if (value is List) {
        if (value.isEmpty) return '';
        // A single code block remains a one-element array, not a scalar.
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

/// Removes presentation markup from non-code text only. Credentials within
/// fenced code are never passed through this transformation.
String _plainText(String source, {bool preserveLinks = false}) {
  var text = source
      .trim()
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&#160;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>');
  // Remove only recognized layout HTML wrappers. An arbitrary value like
  // <API_TOKEN> is data, not markup, and must not be silently discarded.
  text = text.replaceAll(
    RegExp(
      r'</?(?:div|span|p|table|thead|tbody|tr|td|th|br|hr|center)\b[^>]*>',
      caseSensitive: false,
    ),
    ' ',
  );
  text = text.replaceFirst(RegExp(r'^>+\s*'), '');
  // Preserve URL targets, which can carry important data.
  if (!preserveLinks) {
    text = text.replaceAllMapped(
      RegExp(r'!?\[([^\]]+)\]\(([^)]+)\)'),
      (match) => '${match.group(1)} (${match.group(2)})',
    );
  }
  // Remove balanced formatting marks, not underscore characters in secrets.
  text = text.replaceAllMapped(
    RegExp(r'\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|`([^`]+)`'),
    (match) =>
        match.group(1) ?? match.group(2) ?? match.group(3) ?? match.group(4)!,
  );
  text = text.replaceAllMapped(
    RegExp(r'(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)'),
    (match) => match.group(1)!,
  );
  text = text.replaceAllMapped(
    RegExp(r'(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)'),
    (match) => match.group(1)!,
  );
  text = text.replaceAllMapped(
    RegExp(r'\\([\\`*_{}\[\]()#+.!|>~-])'),
    (match) => match.group(1)!,
  );
  return text.replaceAll(RegExp(r'[ \t]+'), ' ').trim();
}

/// Split GFM table cells, respecting escaped pipe characters and inline code.
List<String>? _tableCells(String line) {
  var raw = line.trim();
  if (!raw.contains('|')) return null;
  if (raw.startsWith('|')) raw = raw.substring(1);
  if (raw.endsWith('|') && !raw.endsWith(r'\|')) {
    raw = raw.substring(0, raw.length - 1);
  }
  final cells = <String>[];
  final buffer = StringBuffer();
  var inCode = false;
  for (var i = 0; i < raw.length; i++) {
    final character = raw[i];
    if (character == '`') inCode = !inCode;
    if (character == r'\' && i + 1 < raw.length && raw[i + 1] == '|') {
      buffer.write('|');
      i++;
    } else if (character == '|' && !inCode) {
      cells.add(buffer.toString().trim());
      buffer.clear();
    } else {
      buffer.write(character);
    }
  }
  cells.add(buffer.toString().trim());
  return cells.length >= 2 ? cells : null;
}

bool _isTableSeparator(String line, int columns) {
  final cells = _tableCells(line);
  return cells != null &&
      cells.length == columns &&
      cells.every((part) => RegExp(r'^:?-{3,}:?$').hasMatch(part));
}

bool _isDecorationOnly(String line) {
  final text = line.trim();
  if (RegExp(r'^([-*_]\s*){3,}$').hasMatch(text)) return true;
  return RegExp(
    r'^</?(?:div|span|p|table|thead|tbody|tr|td|th|br|hr)\b[^>]*>\s*$',
    caseSensitive: false,
  ).hasMatch(text);
}
