import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';

import 'vault_document.dart';

/// A native view of the block-oriented Secrets Keep Markdown dialect.
/// Updates are persisted before the UI accepts a new document state.
class DocumentView extends StatefulWidget {
  const DocumentView({super.key, required this.document, required this.onSave});
  final VaultDocument document;
  final Future<bool> Function(VaultDocument) onSave;
  @override
  State<DocumentView> createState() => _DocumentViewState();
}

class _BlockDraft {
  const _BlockDraft(this.kind, this.value, this.level, this.language);
  final BlockKind kind;
  final String value;
  final int level;
  final String language;
}

class _AttachedCodeDraft {
  _AttachedCodeDraft({
    required this.key,
    this.start,
    required this.value,
    required this.language,
  });
  final int key;
  final int? start;
  String value;
  String language;
  ItemCodeEdit get asEdit =>
      ItemCodeEdit(start: start, value: value, language: language);
}

class _DocumentViewState extends State<DocumentView> {
  bool searching = false;
  String query = '';
  bool saving = false;
  final PageController _searchPages = PageController();
  int _matchIndex = 0;

  @override
  void dispose() {
    _searchPages.dispose();
    super.dispose();
  }

  void _showMatch(int target) {
    if (!_searchPages.hasClients) return;
    _searchPages.animateToPage(
      target,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
    );
  }

  Future<bool> _commit(VaultDocument updated) async {
    if (saving || updated.markdown == widget.document.markdown) return false;
    setState(() => saving = true);
    try {
      return await widget.onSave(updated);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<_BlockDraft?> _editDialog(
    BlockKind kind, {
    VaultBlock? existing,
    int level = 1,
  }) async {
    if (!mounted) return null;
    var draftValue = existing?.value ?? '';
    var draftLanguage = existing?.language ?? '';
    var requestedLevel = existing?.level ?? level;
    final result = await showDialog<_BlockDraft>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
            existing == null ? 'Add ${kind.name}' : 'Edit ${kind.name}',
          ),
          scrollable: true,
          content: SizedBox(
            width: 460,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (kind == BlockKind.heading)
                  DropdownButtonFormField<int>(
                    initialValue: requestedLevel,
                    decoration: const InputDecoration(
                      labelText: 'Heading level',
                    ),
                    items: [
                      for (var n = 1; n <= 6; n++)
                        DropdownMenuItem(value: n, child: Text('Level $n')),
                    ],
                    onChanged: (n) {
                      if (n != null) setDialogState(() => requestedLevel = n);
                    },
                  ),
                if (kind == BlockKind.code)
                  TextFormField(
                    initialValue: draftLanguage,
                    onChanged: (text) => draftLanguage = text,
                    decoration: const InputDecoration(
                      labelText: 'Code language (optional)',
                    ),
                  ),
                if (kind != BlockKind.divider)
                  TextFormField(
                    initialValue: draftValue,
                    onChanged: (text) => draftValue = text,
                    autofocus: true,
                    minLines: kind == BlockKind.code || kind == BlockKind.other
                        ? 6
                        : 1,
                    maxLines: kind == BlockKind.code || kind == BlockKind.other
                        ? 16
                        : 3,
                    style: kind == BlockKind.code
                        ? const TextStyle(fontFamily: 'monospace')
                        : null,
                    decoration: InputDecoration(
                      labelText: kind == BlockKind.item
                          ? 'Item name'
                          : 'Content',
                      alignLabelWithHint: true,
                    ),
                  ),
                if (kind == BlockKind.divider)
                  const Text('Insert a horizontal divider.'),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(
                context,
                _BlockDraft(kind, draftValue, requestedLevel, draftLanguage),
              ),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    return result;
  }

  Future<void> _add(BlockKind kind, {VaultBlock? parent}) async {
    final level = parent?.kind == BlockKind.heading && kind == BlockKind.heading
        ? math.min(parent!.level + 1, 6)
        : 1;
    final draft = kind == BlockKind.divider
        ? _BlockDraft(kind, '', level, '')
        : await _editDialog(kind, level: level);
    if (draft == null) return;
    try {
      await _commit(
        widget.document.add(
          kind,
          draft.value,
          parent: parent,
          level: draft.level,
          language: draft.language,
        ),
      );
    } on FormatException catch (e) {
      _message(e.message);
    }
  }

  Future<void> _editItem(VaultBlock item) async {
    final doc = widget.document;
    final original = doc.blocks
        .where(
          (candidate) =>
              candidate.kind == BlockKind.code &&
              doc.parentOf(candidate)?.id == item.id,
        )
        .toList();
    var itemName = item.value;
    var counter = original.length;
    final codes = <_AttachedCodeDraft>[
      for (var i = 0; i < original.length; i++)
        _AttachedCodeDraft(
          key: i,
          start: original[i].start,
          value: original[i].value,
          language: original[i].language,
        ),
    ];
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, redraw) => AlertDialog(
          title: const Text('Edit item'),
          scrollable: true,
          content: SizedBox(
            width: 480,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  initialValue: itemName,
                  autofocus: true,
                  onChanged: (text) => itemName = text,
                  decoration: const InputDecoration(labelText: 'Item name'),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    const Expanded(child: Text('Attached code blocks')),
                    IconButton(
                      tooltip: 'Add attached code',
                      icon: const Icon(Icons.add),
                      onPressed: () => redraw(
                        () => codes.add(
                          _AttachedCodeDraft(
                            key: counter++,
                            value: '',
                            language: '',
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                for (final code in codes)
                  Padding(
                    key: ValueKey('item-code-${code.key}'),
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: TextFormField(
                                key: ValueKey('language-${code.key}'),
                                initialValue: code.language,
                                onChanged: (text) => code.language = text,
                                decoration: const InputDecoration(
                                  labelText: 'Language',
                                  isDense: true,
                                ),
                              ),
                            ),
                            IconButton(
                              tooltip: 'Remove attached code',
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () => redraw(() => codes.remove(code)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        TextFormField(
                          key: ValueKey('code-${code.key}'),
                          initialValue: code.value,
                          onChanged: (text) => code.value = text,
                          minLines: 3,
                          maxLines: 10,
                          style: const TextStyle(fontFamily: 'monospace'),
                          decoration: const InputDecoration(
                            hintText: 'Code',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    if (result != true) return;
    try {
      await _commit(
        doc.editItem(item, itemName, codes.map((c) => c.asEdit).toList()),
      );
    } on FormatException catch (e) {
      _message(e.message);
    }
  }

  Future<void> _edit(VaultBlock block) async {
    if (block.kind == BlockKind.divider) return;
    if (block.kind == BlockKind.item) {
      await _editItem(block);
      return;
    }
    final draft = await _editDialog(block.kind, existing: block);
    if (draft == null) return;
    try {
      await _commit(
        widget.document.edit(
          block,
          draft.value,
          level: draft.level,
          language: draft.language,
        ),
      );
    } on FormatException catch (e) {
      _message(e.message);
    }
  }

  Future<void> _delete(VaultBlock block) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete ${block.kind.name}?'),
        content: Text(
          block.isContainer
              ? 'Attached content may also be removed. This action updates the file.'
              : 'This action updates the file.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (yes == true) await _commit(widget.document.delete(block));
  }

  Future<void> _move(VaultBlock block) async {
    final document = widget.document;
    final range = document.rangeOf(block);
    final targets = document.blocks
        .where(
          (target) => target.start < range.start || target.start >= range.end,
        )
        .toList();
    if (targets.isEmpty) return;
    final selected = await showDialog<({VaultBlock target, DropMode mode})>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Move block'),
        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
        content: SizedBox(
          width: 440,
          height: 390,
          child: ListView.builder(
            itemCount: targets.length,
            itemBuilder: (context, index) {
              final target = targets[index];
              void select(DropMode mode) =>
                  Navigator.pop(context, (target: target, mode: mode));
              return ListTile(
                dense: true,
                title: Text(
                  target.value.trim().isEmpty
                      ? target.kind.name
                      : target.value.split('\n').first,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(target.kind.name),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _action(
                      Icons.arrow_upward,
                      'Move before',
                      () => select(DropMode.before),
                    ),
                    if (target.isContainer)
                      _action(
                        Icons.subdirectory_arrow_right,
                        'Move inside',
                        () => select(DropMode.inside),
                      ),
                    _action(
                      Icons.arrow_downward,
                      'Move after',
                      () => select(DropMode.after),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
    if (selected != null) {
      await _commit(document.move(block, selected.target, selected.mode));
    }
  }

  Widget _action(IconData icon, String tooltip, VoidCallback callback) =>
      IconButton(
        tooltip: tooltip,
        onPressed: callback,
        icon: Icon(icon, size: 19),
        visualDensity: VisualDensity.compact,
        constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
        padding: const EdgeInsets.all(6),
      );

  void _message(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _copy(String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    _message('Copied');
  }

  /// A block's card contains its full descendant subtree, rather than
  /// painting sibling cards alongside it. Borders therefore enclose children.
  Widget _block(VaultBlock block, int index, List<Widget> children) {
    final document = widget.document;
    final color = Theme.of(context).colorScheme;
    final isHeading = block.kind == BlockKind.heading;
    final isItem = block.kind == BlockKind.item;
    final isCode = block.kind == BlockKind.code;
    final show = switch (block.kind) {
      BlockKind.heading ||
      BlockKind.item => MarkdownBody(data: block.raw.trim(), selectable: true),
      BlockKind.code => SelectableText(
        block.value,
        style: TextStyle(
          fontFamily: 'monospace',
          color: color.onSurface,
          fontSize: 13,
        ),
      ),
      BlockKind.divider => const Divider(),
      BlockKind.other => MarkdownBody(data: block.value, selectable: true),
    };
    BuildContext? targetContext;
    return DragTarget<int>(
      onWillAcceptWithDetails: (detail) {
        if (detail.data < 0 || detail.data >= document.blocks.length) {
          return false;
        }
        final source = document.blocks[detail.data];
        final range = document.rangeOf(source);
        return source.id != block.id &&
            !(block.start >= range.start && block.start < range.end);
      },
      onAcceptWithDetails: (detail) {
        final source = document.blocks[detail.data];
        final box = targetContext?.findRenderObject();
        final relativeY = box is RenderBox && box.size.height > 0
            ? box.globalToLocal(detail.offset).dy / box.size.height
            : 0.5;
        final mode = relativeY < 0.20
            ? DropMode.before
            : relativeY > 0.80
            ? DropMode.after
            : block.isContainer
            ? DropMode.inside
            : DropMode.before;
        _commit(document.move(source, block, mode));
      },
      builder: (target, candidates, rejected) {
        targetContext = target;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Card(
            key: ValueKey('block-${block.id}'),
            elevation: 0,
            clipBehavior: Clip.antiAlias,
            color: candidates.isNotEmpty
                ? color.primaryContainer
                : color.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: candidates.isNotEmpty
                    ? color.primary
                    : color.outlineVariant,
                width: isHeading ? 1.4 : 1,
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  LayoutBuilder(
                    builder: (context, limits) {
                      final handle = LongPressDraggable<int>(
                        data: index,
                        feedback: Material(
                          elevation: 4,
                          borderRadius: BorderRadius.circular(9),
                          color: color.surfaceContainerHighest,
                          child: Padding(
                            padding: const EdgeInsets.all(10),
                            child: Text(
                              block.value.split('\n').first,
                              style: TextStyle(color: color.onSurface),
                            ),
                          ),
                        ),
                        child: const Padding(
                          padding: EdgeInsets.only(right: 5),
                          child: Icon(Icons.drag_indicator, size: 19),
                        ),
                      );
                      final name = Text(
                        isHeading
                            ? 'H${block.level}'
                            : block.kind.name.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall
                            ?.copyWith(color: color.onSurfaceVariant),
                      );
                      final controls = <Widget>[
                        if (isCode)
                          _action(
                            Icons.copy_outlined,
                            'Copy code',
                            () => _copy(block.value),
                          ),
                        if (block.kind != BlockKind.divider)
                          _action(
                            Icons.edit_outlined,
                            'Edit block',
                            () => _edit(block),
                          ),
                        _action(
                          Icons.open_with,
                          'Move block',
                          () => _move(block),
                        ),
                        _action(
                          Icons.delete_outline,
                          'Delete block',
                          () => _delete(block),
                        ),
                      ];
                      if (limits.maxWidth >= 245) {
                        return Row(
                          children: [
                            handle,
                            Expanded(child: name),
                            ...controls,
                          ],
                        );
                      }
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              handle,
                              Expanded(child: name),
                            ],
                          ),
                          Align(
                            alignment: Alignment.centerRight,
                            child: SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: controls,
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                  if (block.kind != BlockKind.divider)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 6,
                      ),
                      child: isCode
                          ? Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: color.surfaceContainerHighest,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: show,
                            )
                          : show,
                    ),
                  if (isCode && block.language.isNotEmpty)
                    Text(
                      block.language,
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  if (isHeading || isItem)
                    Align(
                      alignment: Alignment.centerRight,
                      child: Wrap(
                        spacing: 1,
                        runSpacing: 0,
                        children: [
                          if (isHeading) ...[
                            _action(
                              Icons.account_tree_outlined,
                              'Add subheading',
                              () => _add(BlockKind.heading, parent: block),
                            ),
                            _action(
                              Icons.playlist_add,
                              'Add item',
                              () => _add(BlockKind.item, parent: block),
                            ),
                          ],
                          _action(
                            Icons.code,
                            'Add code',
                            () => _add(BlockKind.code, parent: block),
                          ),
                          if (isHeading) ...[
                            _action(
                              Icons.notes,
                              'Add Markdown',
                              () => _add(BlockKind.other, parent: block),
                            ),
                            _action(
                              Icons.horizontal_rule,
                              'Add divider',
                              () => _add(BlockKind.divider, parent: block),
                            ),
                          ],
                        ],
                      ),
                    ),
                  if (children.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Padding(
                      padding: const EdgeInsets.only(left: 9),
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          border: Border(
                            left: BorderSide(
                              color: color.outlineVariant,
                              width: 2,
                            ),
                          ),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.only(left: 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: children,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  /// Construct a forest from the source's containment ranges. Each child is
  /// rendered once *inside* its parent, including in filtered search results.
  Widget _blockTree(List<int> visibleIndices) {
    final blocks = widget.document.blocks;
    final children = <int?, List<int>>{null: []};
    final stack = <int>[];
    for (final index in visibleIndices) {
      final block = blocks[index];
      if (block.kind == BlockKind.other && block.raw.trim().isEmpty) continue;
      while (stack.isNotEmpty &&
          widget.document.rangeOf(blocks[stack.last]).end <= block.start) {
        stack.removeLast();
      }
      final parent = stack.isEmpty ? null : stack.last;
      children.putIfAbsent(parent, () => []).add(index);
      if (block.isContainer) {
        stack.add(index);
      }
    }
    Widget branch(int index) => _block(blocks[index], index, [
      for (final child in children[index] ?? const <int>[]) branch(child),
    ]);
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      children: [for (final index in children[null]!) branch(index)],
    );
  }

  @override
  Widget build(BuildContext context) {
    final blocks = widget.document.blocks;
    final needle = searching ? query.trim().toLowerCase() : '';
    final matched = needle.isEmpty
        ? <int>[]
        : [
            for (var i = 0; i < blocks.length; i++)
              if ((blocks[i].kind == BlockKind.heading ||
                      blocks[i].kind == BlockKind.item) &&
                  blocks[i].value.toLowerCase().contains(needle))
                i,
          ];
    final active = matched.isEmpty
        ? 0
        : _matchIndex.clamp(0, matched.length - 1);
    return Column(
      children: [
        if (saving) const LinearProgressIndicator(),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(
            children: [
              IconButton(
                tooltip: 'Find in document',
                onPressed: () {
                  setState(() {
                    searching = !searching;
                    query = '';
                    _matchIndex = 0;
                  });
                },
                icon: Icon(searching ? Icons.close : Icons.search),
              ),
              if (searching)
                Expanded(
                  child: TextField(
                    autofocus: true,
                    onChanged: (text) {
                      setState(() {
                        query = text;
                        _matchIndex = 0;
                      });
                      if (_searchPages.hasClients) _searchPages.jumpToPage(0);
                    },
                    decoration: const InputDecoration(
                      hintText: 'Find section or item',
                      isDense: true,
                      border: InputBorder.none,
                    ),
                  ),
                )
              else
                Expanded(
                  child: Text(
                    '${blocks.length} blocks',
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                ),
              if (needle.isNotEmpty) ...[
                Text(
                  matched.isEmpty
                      ? '0 / 0'
                      : '${active + 1} / ${matched.length}',
                  style: Theme.of(context).textTheme.labelSmall,
                ),
                IconButton(
                  tooltip: 'Previous match',
                  icon: const Icon(Icons.keyboard_arrow_up),
                  onPressed: matched.isEmpty
                      ? null
                      : () => _showMatch(
                          (active + matched.length - 1) % matched.length,
                        ),
                ),
                IconButton(
                  tooltip: 'Next match',
                  icon: const Icon(Icons.keyboard_arrow_down),
                  onPressed: matched.isEmpty
                      ? null
                      : () => _showMatch((active + 1) % matched.length),
                ),
              ],
              _action(
                Icons.account_tree_outlined,
                'New heading',
                () => _add(BlockKind.heading),
              ),
              _action(
                Icons.playlist_add,
                'New item',
                () => _add(BlockKind.item),
              ),
              _action(Icons.code, 'New code', () => _add(BlockKind.code)),
              _action(Icons.notes, 'New Markdown', () => _add(BlockKind.other)),
              _action(
                Icons.horizontal_rule,
                'New divider',
                () => _add(BlockKind.divider),
              ),
            ],
          ),
        ),
        Expanded(
          child: needle.isEmpty
              ? _blockTree(List<int>.generate(blocks.length, (index) => index))
              : matched.isEmpty
              ? const Center(child: Text('No matching sections or items'))
              : PageView.builder(
                  controller: _searchPages,
                  itemCount: matched.length,
                  onPageChanged: (value) => setState(() => _matchIndex = value),
                  itemBuilder: (context, page) {
                    final match = blocks[matched[page]];
                    final range = widget.document.rangeOf(match);
                    return _blockTree([
                      for (
                        var index = matched[page];
                        index < blocks.length;
                        index++
                      )
                        if (blocks[index].start >= range.start &&
                            blocks[index].start < range.end)
                          index,
                    ]);
                  },
                ),
        ),
      ],
    );
  }
}
