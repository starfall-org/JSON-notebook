import 'dart:convert';
import 'dart:math' as math;

/// Structured, lossless representation of the managed Markdown dialect.
/// Unknown Markdown remains a raw node; conversion never discards it.
enum BlockKind { heading, item, code, other, divider }

enum DropMode { before, inside, after }

class VaultBlock {
  const VaultBlock({
    required this.kind,
    required this.start,
    required this.end,
    required this.raw,
    required this.value,
    this.level = 0,
    this.indent = '',
    this.language = '',
  });

  final BlockKind kind;
  final int start, end, level;
  final String raw, value, indent, language;
  String get id => '${kind.name}-$start';
  bool get isContainer => kind == BlockKind.heading || kind == BlockKind.item;
  Map<String, Object> toJson() => {
    'type': kind.name,
    'start': start,
    'end': end,
    'raw': raw,
    'value': value,
    if (kind == BlockKind.heading) 'level': level,
    if (indent.isNotEmpty) 'indent': indent,
    if (language.isNotEmpty) 'language': language,
  };
}

/// One attached code block in an item editor. [start] is null for a new code.
class ItemCodeEdit {
  const ItemCodeEdit({this.start, required this.value, this.language = ''});
  final int? start;
  final String value;
  final String language;
}

class VaultDocument {
  VaultDocument(String source)
    : markdown = source,
      blocks = parseBlocks(source);
  final String markdown;
  final List<VaultBlock> blocks;
  final Map<int, ({int start, int end})> _ranges = {};

  static const formatId = 'secrets-keep.blocks';
  static const formatVersion = 1;

  /// A JSON representation retaining the *entire* source Markdown for
  /// guaranteed re-export, plus individually typed/editable blocks.
  String toJson() => const JsonEncoder.withIndent('  ').convert({
    'format': formatId,
    'version': formatVersion,
    'sourceMarkdown': markdown,
    'blocks': blocks.map((b) => b.toJson()).toList(),
  });

  static VaultDocument fromJson(String json) {
    final data = jsonDecode(json);
    if (data is! Map<String, dynamic> ||
        data['format'] != formatId ||
        data['version'] != formatVersion ||
        data['sourceMarkdown'] is! String ||
        data['blocks'] is! List) {
      throw const FormatException('Not a Secrets Keep block JSON document');
    }
    final document = VaultDocument(data['sourceMarkdown'] as String);
    final given = data['blocks'] as List;
    if (given.length != document.blocks.length) {
      throw const FormatException(
        'Block count differs from the Markdown source',
      );
    }
    for (var i = 0; i < given.length; i++) {
      if (given[i] is! Map) {
        throw const FormatException('Invalid block structure');
      }
      final value = given[i] as Map;
      final expected = document.blocks[i];
      if (value['type'] != expected.kind.name ||
          value['start'] != expected.start ||
          value['end'] != expected.end ||
          value['raw'] != expected.raw ||
          value['value'] != expected.value ||
          (expected.kind == BlockKind.heading &&
              value['level'] != expected.level) ||
          (value['indent'] ?? '') != expected.indent ||
          (value['language'] ?? '') != expected.language) {
        throw const FormatException(
          'Structured blocks do not match the Markdown source',
        );
      }
    }
    return document;
  }

  VaultBlock at(int index) => blocks[index];
  static bool _divider(String line) {
    if (line.length - line.trimLeft().length > 3) return false;
    final value = line.trim();
    return RegExp(r'^(?:\*(?:[ \t]*\*){2,}|-(?:[ \t]*-){2,}|_(?:[ \t]*_){2,})$')
        .hasMatch(value);
  }

  static bool _managed(String line) =>
      RegExp(r'^ {0,3}#{1,6}[ \t]+.+').hasMatch(line) ||
      RegExp(r'^\s*-\s+\*\*.+?\*\*\s*$').hasMatch(line) ||
      RegExp(r'^\s*`{3,}[^`]*$').hasMatch(line) ||
      _divider(line);

  static List<VaultBlock> parseBlocks(String source) {
    final parsed = <VaultBlock>[];
    var pos = 0;
    int nextLineEnd(int offset) {
      final next = source.indexOf('\n', offset);
      return next < 0 ? source.length : next + 1;
    }

    String lineAt(int start, int end) =>
        source.substring(start, end).replaceFirst(RegExp(r'\n$'), '');

    while (pos < source.length) {
      final end = nextLineEnd(pos);
      final line = lineAt(pos, end);
      final heading = RegExp(r'^ {0,3}(#{1,6})[ \t]+(.+?)\s*$')
          .firstMatch(line);
      if (heading != null) {
        parsed.add(
          VaultBlock(
            kind: BlockKind.heading,
            start: pos,
            end: end,
            raw: source.substring(pos, end),
            level: heading.group(1)!.length,
            value: heading.group(2)!,
          ),
        );
        pos = end;
        continue;
      }
      if (_divider(line)) {
        parsed.add(
          VaultBlock(
            kind: BlockKind.divider,
            start: pos,
            end: end,
            raw: source.substring(pos, end),
            value: line.trim(),
          ),
        );
        pos = end;
        continue;
      }
      final item = RegExp(r'^(\s*)-\s+\*\*(.+?)\*\*\s*$').firstMatch(line);
      if (item != null) {
        parsed.add(
          VaultBlock(
            kind: BlockKind.item,
            start: pos,
            end: end,
            raw: source.substring(pos, end),
            indent: item.group(1)!,
            value: item.group(2)!,
          ),
        );
        pos = end;
        continue;
      }
      final opening = RegExp(r'^(\s*)(`{3,})([^`]*)$').firstMatch(line);
      if (opening != null) {
        final indent = opening.group(1)!;
        final marker = opening.group(2)!;
        final language = opening.group(3)!.trim();
        final codeStart = end;
        var scan = end;
        var closeStart = source.length;
        var closeEnd = source.length;
        while (scan < source.length) {
          final scanEnd = nextLineEnd(scan);
          if (lineAt(scan, scanEnd) == '$indent$marker') {
            closeStart = scan;
            closeEnd = scanEnd;
            break;
          }
          scan = scanEnd;
        }
        var text = source
            .substring(codeStart, closeStart)
            .split('\n')
            .map(
              (line) => line.startsWith(indent)
                  ? line.substring(indent.length)
                  : line,
            )
            .join('\n');
        if (text.endsWith('\n')) text = text.substring(0, text.length - 1);
        parsed.add(
          VaultBlock(
            kind: BlockKind.code,
            start: pos,
            end: closeEnd,
            raw: source.substring(pos, closeEnd),
            indent: indent,
            language: language,
            value: text,
          ),
        );
        pos = closeEnd;
        continue;
      }
      var scan = end;
      while (scan < source.length) {
        final scanEnd = nextLineEnd(scan);
        if (_managed(lineAt(scan, scanEnd))) break;
        scan = scanEnd;
      }
      final raw = source.substring(pos, scan);
      final lines = raw.replaceFirst(RegExp(r'\n$'), '').split('\n');
      final nonBlank = lines.where((line) => line.trim().isNotEmpty).toList();
      final spaces = nonBlank.isEmpty
          ? 0
          : nonBlank
                .map(
                  (line) =>
                      line.length -
                      line.replaceFirst(RegExp(r'^ *'), '').length,
                )
                .reduce(math.min);
      final indent = ' ' * spaces;
      final text = lines
          .map(
            (line) => line.trim().isNotEmpty && line.startsWith(indent)
                ? line.substring(indent.length)
                : line,
          )
          .join('\n')
          .trimRight();
      parsed.add(
        VaultBlock(
          kind: BlockKind.other,
          start: pos,
          end: scan,
          raw: raw,
          indent: indent,
          value: text,
        ),
      );
      pos = scan;
    }
    assert(parsed.map((b) => b.raw).join() == source);
    return parsed;
  }

  ({int start, int end}) rangeOf(VaultBlock block) {
    if (_ranges.containsKey(block.start)) return _ranges[block.start]!;
    final result = _computeRange(block);
    _ranges[block.start] = result;
    return result;
  }

  ({int start, int end}) _computeRange(VaultBlock block) {
    if (block.kind == BlockKind.heading) {
      var end = markdown.length;
      for (final next in blocks) {
        if (next.start <= block.start) continue;
        if (next.kind == BlockKind.divider ||
            (next.kind == BlockKind.heading && next.level <= block.level)) {
          end = next.start;
          break;
        }
      }
      return (start: block.start, end: end);
    }
    if (block.kind == BlockKind.item) {
      var end = block.end;
      final startIndex = blocks.indexOf(block);
      for (var i = startIndex + 1; i < blocks.length; i++) {
        final next = blocks[i];
        if (next.kind == BlockKind.other && next.raw.trim().isEmpty) {
          if (i + 1 < blocks.length &&
              (blocks[i + 1].kind == BlockKind.code ||
                  blocks[i + 1].kind == BlockKind.other) &&
              blocks[i + 1].indent.length >= block.indent.length + 2) {
            end = next.end;
            continue;
          }
          break;
        }
        if ((next.kind == BlockKind.code || next.kind == BlockKind.other) &&
            next.indent.length >= block.indent.length + 2) {
          end = next.end;
          continue;
        }
        break;
      }
      return (start: block.start, end: end);
    }
    return (start: block.start, end: block.end);
  }

  VaultBlock? parentOf(VaultBlock block) {
    VaultBlock? owner;
    for (final candidate in blocks) {
      if (!candidate.isContainer || candidate.start >= block.start) continue;
      if (rangeOf(candidate).end <= block.start) continue;
      if (owner == null || candidate.start > owner.start) owner = candidate;
    }
    return owner;
  }

  String _replace(List<({int start, int end, String text})> operations) {
    var output = markdown;
    operations.sort((a, b) => b.start.compareTo(a.start));
    for (final op in operations) {
      output = output.replaceRange(op.start, op.end, op.text);
    }
    return output;
  }

  static String serialize(
    BlockKind kind,
    String value, {
    int level = 1,
    String indent = '',
    String language = '',
  }) {
    final text = value.replaceAll('\r\n', '\n');
    switch (kind) {
      case BlockKind.heading:
        if (text.trim().isEmpty) {
          throw const FormatException('Heading cannot be blank');
        }
        return '${'#' * level.clamp(1, 6)} ${text.trim()}\n';
      case BlockKind.item:
        if (text.trim().isEmpty) {
          throw const FormatException('Item cannot be blank');
        }
        return '$indent- **${text.trim()}**\n';
      case BlockKind.code:
        var maxTicks = 2;
        for (final match in RegExp(r'`+').allMatches(text)) {
          maxTicks = math.max(maxTicks, match.group(0)!.length);
        }
        final fence = '`' * (maxTicks + 1);
        final body = text.replaceFirst(RegExp(r'\n$'), '');
        final content = body.isEmpty
            ? ''
            : '${body.split('\n').map((line) => '$indent$line').join('\n')}\n';
        return '$indent$fence${language.trim().replaceAll(RegExp(r'\s+'), '-')}\n$content$indent$fence\n';
      case BlockKind.other:
        if (text.trim().isEmpty) {
          throw const FormatException('Content cannot be blank');
        }
        return '${text.trimRight().split('\n').map((line) => line.isEmpty ? '' : '$indent$line').join('\n')}\n';
      case BlockKind.divider:
        return '---\n';
    }
  }

  static String _insert(String source, int at, String text) {
    final left = source.substring(0, at).replaceFirst(RegExp(r'\n*$'), '');
    final right = source.substring(at).replaceFirst(RegExp(r'^\n*'), '');
    return '$left${left.isNotEmpty ? '\n\n' : ''}${text.trimRight()}${right.isNotEmpty ? '\n\n$right' : '\n'}';
  }

  VaultDocument add(
    BlockKind kind,
    String value, {
    VaultBlock? parent,
    int? at,
    int level = 1,
    String language = '',
  }) {
    var indent = '';
    if (parent != null) {
      at = rangeOf(parent).end;
      if (parent.kind == BlockKind.heading && kind == BlockKind.heading) {
        level = math.min(parent.level + 1, 6);
      } else if (parent.kind == BlockKind.item && kind == BlockKind.code) {
        indent = '${parent.indent}  ';
      }
    }
    return VaultDocument(
      _insert(
        markdown,
        at ?? markdown.length,
        serialize(
          kind,
          value,
          indent: indent,
          level: level,
          language: language,
        ),
      ),
    );
  }

  VaultDocument edit(
    VaultBlock block,
    String value, {
    int? level,
    String? language,
  }) => VaultDocument(
    _replace([
      (
        start: block.start,
        end: block.end,
        text: serialize(
          block.kind,
          value,
          indent: block.indent,
          level: level ?? block.level,
          language: language ?? block.language,
        ),
      ),
    ]),
  );

  /// Edit an item and all its directly attached code blocks in one save.
  /// Non-code children and unrelated branches are never rewritten.
  /// Any code omitted from [codes] is removed, while newly added codes are
  /// inserted after the last owned child. Offsets are applied in reverse order.
  VaultDocument editItem(
    VaultBlock item,
    String name,
    List<ItemCodeEdit> codes,
  ) {
    if (item.kind != BlockKind.item || !blocks.contains(item)) {
      throw const FormatException('Not an item in this document');
    }
    final owned = blocks
        .where((b) => b.kind == BlockKind.code && parentOf(b)?.id == item.id)
        .toList();
    final byStart = {for (final b in owned) b.start: b};
    final referenced = <int>{};
    final operations = <({int start, int end, String text})>[
      (
        start: item.start,
        end: item.end,
        text: serialize(BlockKind.item, name, indent: item.indent),
      ),
    ];
    final newCodes = <String>[];
    for (final code in codes) {
      if (code.start == null) {
        newCodes.add(
          serialize(
            BlockKind.code,
            code.value,
            language: code.language,
            indent: '${item.indent}  ',
          ),
        );
        continue;
      }
      final original = byStart[code.start];
      if (original == null || !referenced.add(code.start!)) {
        throw const FormatException('Invalid or duplicated item code block');
      }
      operations.add((
        start: original.start,
        end: original.end,
        text: serialize(
          BlockKind.code,
          code.value,
          indent: original.indent,
          language: code.language,
        ),
      ));
    }
    for (final original in owned) {
      if (!referenced.contains(original.start)) {
        operations.add((start: original.start, end: original.end, text: ''));
      }
    }
    // Insert only after the owned range (never into a sibling block). Adding
    // multiple code blocks here is a single operation to preserve their order.
    if (newCodes.isNotEmpty) {
      final at = rangeOf(item).end;
      operations.add((
        start: at,
        end: at,
        text: '\n\n${newCodes.map((s) => s.trimRight()).join('\n\n')}\n',
      ));
    }
    return VaultDocument(_replace(operations));
  }

  VaultDocument delete(VaultBlock block) {
    final ops = <({int start, int end, String text})>[
      (start: block.start, end: block.end, text: ''),
    ];
    if (block.isContainer) {
      for (final item in blocks) {
        if (item.start <= block.start || item.start >= rangeOf(block).end) {
          continue;
        }
        if (parentOf(item)?.id == block.id &&
            (item.kind == BlockKind.code || item.kind == BlockKind.other)) {
          ops.add((start: item.start, end: item.end, text: ''));
        }
        if (block.kind == BlockKind.heading && item.kind == BlockKind.heading) {
          final reduced = math.max(1, item.level - 1);
          ops.add((
            start: item.start,
            end: item.end,
            text: item.raw.replaceFirst(
              RegExp(r'^ {0,3}#{1,6}'),
              '#' * reduced,
            ),
          ));
        }
      }
    }
    return VaultDocument(_replace(ops));
  }

  VaultDocument move(VaultBlock block, VaultBlock target, DropMode mode) {
    final sourceRange = rangeOf(block);
    if (block.id == target.id ||
        (target.start >= sourceRange.start && target.start < sourceRange.end)) {
      return this;
    }
    final targetRange = rangeOf(target);
    var insertAt = mode == DropMode.before ? target.start : targetRange.end;
    var moving = markdown.substring(sourceRange.start, sourceRange.end);
    if (block.kind == BlockKind.heading) {
      final owner = _headingFor(target);
      final desired = target.kind == BlockKind.heading
          ? (mode == DropMode.inside
                ? math.min(6, target.level + 1)
                : target.level)
          : (owner == null ? 1 : math.min(6, owner.level + 1));
      final children = blocks
          .where(
            (b) =>
                b.kind == BlockKind.heading &&
                b.start >= sourceRange.start &&
                b.start < sourceRange.end,
          )
          .toList();
      final minLevel = children.map((b) => b.level).reduce(math.min);
      final maxLevel = children.map((b) => b.level).reduce(math.max);
      final delta = (desired - block.level).clamp(1 - minLevel, 6 - maxLevel);
      for (final h in children.reversed) {
        final a = h.start - sourceRange.start;
        final b = h.end - sourceRange.start;
        moving = moving.replaceRange(
          a,
          b,
          h.raw.replaceFirst(RegExp(r'^ {0,3}#{1,6}'), '#' * (h.level + delta)),
        );
      }
    }
    if (block.kind == BlockKind.code) {
      final targetParent =
          mode == DropMode.inside && target.kind == BlockKind.item
          ? target
          : _itemFor(target);
      final newIndent = targetParent == null ? '' : '${targetParent.indent}  ';
      moving = moving
          .split('\n')
          .map((line) {
            if (line.isEmpty) return line;
            final naked = line.startsWith(block.indent)
                ? line.substring(block.indent.length)
                : line;
            return '$newIndent$naked';
          })
          .join('\n');
    }
    final remaining = markdown.replaceRange(
      sourceRange.start,
      sourceRange.end,
      '',
    );
    if (insertAt > sourceRange.end) {
      insertAt -= sourceRange.end - sourceRange.start;
    }
    return VaultDocument(_insert(remaining, insertAt, moving));
  }

  VaultBlock? _headingFor(VaultBlock block) {
    VaultBlock? parent = block.kind == BlockKind.heading ? block : null;
    for (final candidate in blocks) {
      if (candidate.kind != BlockKind.heading ||
          candidate.start >= block.start) {
        continue;
      }
      if (rangeOf(candidate).end <= block.start) continue;
      if (parent == null || candidate.start > parent.start) parent = candidate;
    }
    return parent;
  }

  VaultBlock? _itemFor(VaultBlock block) {
    VaultBlock? parent;
    for (final candidate in blocks) {
      if (candidate.kind != BlockKind.item || candidate.start >= block.start) {
        continue;
      }
      if (rangeOf(candidate).end <= block.start) continue;
      if (parent == null || candidate.start > parent.start) parent = candidate;
    }
    return parent;
  }
}
