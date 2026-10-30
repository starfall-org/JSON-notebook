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
      builder: (context) => SimpleDialog(
        title: const Text('Move block'),
        children: [
          for (final target in targets)
            PopupMenuButton<DropMode>(
              onSelected: (mode) =>
                  Navigator.pop(context, (target: target, mode: mode)),
              itemBuilder: (_) => [
                const PopupMenuItem(
                  value: DropMode.before,
                  child: Text('Before'),
                ),
                if (target.isContainer)
                  const PopupMenuItem(
                    value: DropMode.inside,
                    child: Text('Inside'),
                  ),
                const PopupMenuItem(
                  value: DropMode.after,
                  child: Text('After'),
                ),
              ],
              child: ListTile(
                title: Text(
                  target.value.trim().isEmpty
                      ? target.kind.name
                      : target.value.split('\n').first,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(target.kind.name),
                trailing: const Icon(Icons.chevron_right),
              ),
            ),
        ],
      ),
    );
    if (selected != null) {
      await _commit(document.move(block, selected.target, selected.mode));
    }
  }

  void _message(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _copy(String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    _message('Copied');
  }

  Widget _block(VaultBlock block, int index) {
    final document = widget.document;
    final parent = document.parentOf(block);
    final depth = block.kind == BlockKind.heading
        ? block.level - 1
        : parent?.kind == BlockKind.heading
        ? math.min(parent!.level, 5)
        : parent?.kind == BlockKind.item
        ? 1
        : 0;
    final color = Theme.of(context).colorScheme;
    final isHeading = block.kind == BlockKind.heading;
    final isCode = block.kind == BlockKind.code;
    final label = block.kind.name;
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
        // Use the target block's own bounds, not the document viewport.
        // Top/bottom quarters indicate before/after; middle indicates inside
        // for a heading or item. A target can never receive its own subtree.
        final mode = relativeY < 0.25
            ? DropMode.before
            : relativeY > 0.75
            ? DropMode.after
            : block.isContainer
            ? DropMode.inside
            : DropMode.before;
        _commit(document.move(source, block, mode));
      },
      builder: (target, candidates, rejected) {
        targetContext = target;
        return Padding(
          padding: EdgeInsets.only(
            left: math.min(depth, 5) * 12.0,
            top: 4,
            bottom: 4,
          ),
          child: Card(
            color: candidates.isEmpty ? null : color.primaryContainer,
            elevation: 0,
            clipBehavior: Clip.antiAlias,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      LongPressDraggable<int>(
                        data: index,
                        feedback: Material(
                          elevation: 4,
                          borderRadius: BorderRadius.circular(8),
                          color: color.surfaceContainerHighest,
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Text(
                              block.value.split('\n').first,
                              style: TextStyle(color: color.onSurface),
                            ),
                          ),
                        ),
                        child: const Padding(
                          padding: EdgeInsets.only(right: 12),
                          child: Icon(Icons.drag_indicator, size: 19),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          label.toUpperCase(),
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(color: color.onSurfaceVariant),
                        ),
                      ),
                      if (isCode)
                        IconButton(
                          tooltip: 'Copy code',
                          onPressed: () => _copy(block.value),
                          icon: const Icon(Icons.copy, size: 19),
                        ),
                      PopupMenuButton<String>(
                        tooltip: 'Block actions',
                        onSelected: (action) {
                          switch (action) {
                            case 'edit':
                              _edit(block);
                            case 'delete':
                              _delete(block);
                            case 'move':
                              _move(block);
                            case 'heading':
                              _add(BlockKind.heading, parent: block);
                            case 'item':
                              _add(BlockKind.item, parent: block);
                            case 'code':
                              _add(BlockKind.code, parent: block);
                            case 'raw':
                              _add(BlockKind.other, parent: block);
                            case 'divider':
                              _add(BlockKind.divider, parent: block);
                          }
                        },
                        itemBuilder: (_) => [
                          if (block.kind != BlockKind.divider)
                            const PopupMenuItem(
                              value: 'edit',
                              child: Text('Edit'),
                            ),
                          if (isHeading)
                            const PopupMenuItem(
                              value: 'heading',
                              child: Text('Add subheading'),
                            ),
                          if (isHeading)
                            const PopupMenuItem(
                              value: 'item',
                              child: Text('Add item'),
                            ),
                          if (block.isContainer)
                            const PopupMenuItem(
                              value: 'code',
                              child: Text('Add code'),
                            ),
                          if (isHeading)
                            const PopupMenuItem(
                              value: 'raw',
                              child: Text('Add Markdown'),
                            ),
                          if (isHeading)
                            const PopupMenuItem(
                              value: 'divider',
                              child: Text('Add divider'),
                            ),
                          const PopupMenuItem(
                            value: 'move',
                            child: Text('Move'),
                          ),
                          const PopupMenuItem(
                            value: 'delete',
                            child: Text('Delete'),
                          ),
                        ],
                      ),
                    ],
                  ),
                  if (block.kind != BlockKind.divider)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(6, 2, 4, 6),
                      child: isHeading || block.kind == BlockKind.item
                          ? DefaultTextStyle.merge(
                              style: TextStyle(
                                fontWeight: isHeading
                                    ? FontWeight.w600
                                    : FontWeight.normal,
                              ),
                              child: show,
                            )
                          : (isCode
                                ? Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: color.surfaceContainerHighest,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: show,
                                  )
                                : show),
                    ),
                  if (isCode && block.language.isNotEmpty)
                    Text(
                      block.language,
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                ],
              ),
            ),
          ),
        );
      },
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
              PopupMenuButton<BlockKind>(
                tooltip: 'Add block',
                icon: const Icon(Icons.add),
                onSelected: (kind) => _add(kind),
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: BlockKind.heading,
                    child: Text('Heading'),
                  ),
                  PopupMenuItem(value: BlockKind.item, child: Text('Item')),
                  PopupMenuItem(value: BlockKind.code, child: Text('Code')),
                  PopupMenuItem(
                    value: BlockKind.other,
                    child: Text('Markdown'),
                  ),
                  PopupMenuItem(
                    value: BlockKind.divider,
                    child: Text('Divider'),
                  ),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: needle.isEmpty
              ? ListView.builder(
                  itemCount: blocks.length,
                  itemBuilder: (context, index) => _block(blocks[index], index),
                )
              : matched.isEmpty
              ? const Center(child: Text('No matching sections or items'))
              : PageView.builder(
                  controller: _searchPages,
                  itemCount: matched.length,
                  onPageChanged: (value) => setState(() => _matchIndex = value),
                  itemBuilder: (context, page) {
                    final match = blocks[matched[page]];
                    final range = widget.document.rangeOf(match);
                    final section = [
                      for (var i = matched[page]; i < blocks.length; i++)
                        if (blocks[i].start >= range.start &&
                            blocks[i].start < range.end)
                          i,
                    ];
                    return ListView.builder(
                      key: ValueKey('match-${match.id}'),
                      itemCount: section.length,
                      itemBuilder: (context, i) =>
                          _block(blocks[section[i]], section[i]),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
