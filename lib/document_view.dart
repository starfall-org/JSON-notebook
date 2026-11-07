import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'json_document.dart';
import 'json_key_label.dart';
import 'json_search.dart';

class JsonDocumentView extends StatefulWidget {
  const JsonDocumentView({
    super.key,
    required this.document,
    required this.onSave,
    this.searchQuery = '',
    this.documentId = '',
  });
  final JsonDocument document;
  final Future<bool> Function(JsonDocument) onSave;
  final String searchQuery;
  final String documentId;

  @override
  JsonDocumentViewState createState() => JsonDocumentViewState();
}

class _JsonKeyDrag {
  _JsonKeyDrag(List<Object> path) : path = List<Object>.unmodifiable(path);
  final List<Object> path;
}

class _ValueField {
  _ValueField(this.id, this.text);
  final int id;
  String text;
}

class _Draft {
  const _Draft(
    this.name,
    this.fields, {
    this.delete = false,
    this.addChild = false,
  });
  final String name;
  final List<String> fields;
  final bool delete;
  final bool addChild;
}

class JsonDocumentViewState extends State<JsonDocumentView> {
  bool busy = false;
  final Set<String> collapsed = {};
  String? draggingId;
  String? hoverId;
  JsonDropPosition? hoverPosition;
  final _scrollController = ScrollController();
  final _viewportKey = GlobalKey();
  Timer? _scrollTimer;
  Timer? _expandTimer;
  Offset? _dragPointer;

  @override
  void dispose() {
    _scrollTimer?.cancel();
    _expandTimer?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant JsonDocumentView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.documentId != widget.documentId) {
      collapsed.clear();
      _finishDrag();
    } else if (oldWidget.searchQuery != widget.searchQuery) {
      _finishDrag();
    }
  }

  Future<void> addRootEntry() => add([]);

  Future<bool> save(JsonDocument next) async {
    if (busy || next.toJson() == widget.document.toJson()) return false;
    setState(() => busy = true);
    try {
      return await widget.onSave(next);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void showError(Object error) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('$error')));
  }

  Future<_Draft?> _editDialog({
    String name = '',
    Object? current = '',
    bool isNew = false,
    bool requireKey = false,
    bool appendField = false,
  }) async {
    var draftName = name;
    var nextFieldId = 0;
    final initialValues = current is List
        ? current.cast<String>()
        : current is String && current.isNotEmpty
        ? <String>[current]
        : <String>[];
    final fields = [
      for (final value in initialValues) _ValueField(nextFieldId++, value),
    ];
    if (appendField) fields.add(_ValueField(nextFieldId++, ''));
    String? validation;
    return showDialog<_Draft>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (dialog, update) => AlertDialog(
          title: Text(isNew ? 'Add entry' : 'Edit entry'),
          insetPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 24,
          ),
          scrollable: true,
          content: SizedBox(
            width: 440,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (requireKey)
                  TextFormField(
                    key: const ValueKey('json-key-input'),
                    initialValue: draftName,
                    onChanged: (value) => draftName = value,
                    decoration: const InputDecoration(labelText: 'Key'),
                  ),
                if (current is! Map<String, dynamic>) ...[
                  for (final field in fields)
                    Padding(
                      key: ValueKey('field-container-${field.id}'),
                      padding: const EdgeInsets.only(top: 8),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: TextFormField(
                              key: ValueKey('json-value-${field.id}'),
                              initialValue: field.text,
                              minLines: 1,
                              maxLines: 8,
                              onChanged: (value) => field.text = value,
                              decoration: const InputDecoration(
                                labelText: 'Value',
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: 'Remove value field',
                            icon: const Icon(Icons.close),
                            onPressed: () => update(() => fields.remove(field)),
                          ),
                        ],
                      ),
                    ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => update(
                        () => fields.add(_ValueField(nextFieldId++, '')),
                      ),
                      icon: const Icon(Icons.add),
                      label: const Text('Add value'),
                    ),
                  ),
                ],
                if (!isNew &&
                    (current is Map<String, dynamic> || current == ''))
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => Navigator.pop(
                        dialog,
                        const _Draft('', [], addChild: true),
                      ),
                      icon: const Icon(Icons.create_new_folder_outlined),
                      label: Text('Add to $name'),
                    ),
                  ),
                if (name.contains('](http')) JsonKeyLabel(rawKey: name),
                if (validation != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      validation!,
                      style: TextStyle(
                        color: Theme.of(dialog).colorScheme.error,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          actionsPadding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
          actions: [
            SizedBox(
              width: double.infinity,
              child: Row(
                key: const ValueKey('edit-dialog-actions'),
                children: [
                  if (!isNew)
                    TextButton(
                      onPressed: () => Navigator.pop(
                        dialog,
                        const _Draft('', [], delete: true),
                      ),
                      style: TextButton.styleFrom(
                        foregroundColor: Theme.of(dialog).colorScheme.error,
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        minimumSize: const Size(0, 36),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text('Delete'),
                    ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => Navigator.pop(dialog),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 7),
                      minimumSize: const Size(0, 36),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 4),
                  FilledButton(
                    onPressed: () {
                      if (requireKey && draftName.trim().isEmpty) {
                        update(() => validation = 'Key cannot be empty');
                        return;
                      }
                      Navigator.pop(
                        dialog,
                        _Draft(draftName.trim(), [
                          for (final field in fields) field.text,
                        ]),
                      );
                    },
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      minimumSize: const Size(0, 36),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text('Save'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> add(List<Object> path) async {
    final current = widget.document.at(path);
    if (current is List || current is String && current.isNotEmpty) {
      // Adding to a valued key appends one value through the same editor.
      await edit(
        path,
        path.isNotEmpty && path.last is String ? path.last as String : '',
        current,
        appendField: true,
      );
      return;
    }
    final draft = await _editDialog(isNew: true, requireKey: true);
    if (draft == null) return;
    try {
      final saved = await save(
        widget.document.addKey(path, draft.name, draft.fields),
      );
      if (saved && mounted) setState(() => collapsed.remove(jsonEncode(path)));
    } catch (error) {
      showError(error);
    }
  }

  Future<void> edit(
    List<Object> path,
    String name,
    Object? current, {
    bool appendField = false,
  }) async {
    if (path.isEmpty) return;
    final parent = widget.document.at(path.sublist(0, path.length - 1));
    final draft = await _editDialog(
      name: name,
      current: current,
      requireKey: parent is Map,
      appendField: appendField,
    );
    if (draft == null) return;
    if (draft.addChild) {
      await add(path);
      return;
    }
    if (draft.delete) {
      await delete(path, name.isEmpty ? 'value' : name);
      return;
    }
    try {
      final value = current is Map<String, dynamic>
          ? current
          : JsonDocument.valueFromFields(draft.fields);
      await save(
        widget.document.update(
          path,
          value,
          newKey: parent is Map ? draft.name : null,
        ),
      );
    } catch (error) {
      showError(error);
    }
  }

  Future<void> delete(List<Object> path, String label) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text('Delete $label?'),
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
    try {
      await save(widget.document.delete(path));
    } catch (error) {
      showError(error);
    }
  }

  Future<void> reorder(List<Object> path, int index, int offset) async {
    try {
      await save(widget.document.reorder(path, index, index + offset));
    } catch (error) {
      showError(error);
    }
  }

  bool get _dragEnabled => !busy && widget.searchQuery.trim().isEmpty;

  void _finishDrag() {
    _scrollTimer?.cancel();
    _expandTimer?.cancel();
    _dragPointer = null;
    if (mounted && (draggingId != null || hoverId != null)) {
      setState(() {
        draggingId = null;
        hoverId = null;
        hoverPosition = null;
      });
    }
  }

  void _startDrag(String id) {
    HapticFeedback.selectionClick();
    setState(() => draggingId = id);
    _scrollTimer?.cancel();
    _scrollTimer = Timer.periodic(const Duration(milliseconds: 16), (_) {
      if (!_dragEnabled || !_scrollController.hasClients) return;
      final box = _viewportKey.currentContext?.findRenderObject();
      final pointer = _dragPointer;
      if (box is! RenderBox || pointer == null) return;
      final y = box.globalToLocal(pointer).dy;
      const edge = 72.0;
      final speed = y < edge
          ? -12 * ((edge - y) / edge).clamp(0.0, 1.0)
          : y > box.size.height - edge
          ? 12 * ((y - box.size.height + edge) / edge).clamp(0.0, 1.0)
          : 0.0;
      if (speed == 0) return;
      final position = _scrollController.position;
      _scrollController.jumpTo(
        (position.pixels + speed).clamp(
          position.minScrollExtent,
          position.maxScrollExtent,
        ),
      );
    });
  }

  void _hover(
    _JsonKeyDrag source,
    List<Object> path,
    Object value,
    Offset offset,
    BuildContext? dropContext,
  ) {
    if (!_dragEnabled) return;
    final id = jsonEncode(path);
    final mode = _dropMode(value, offset, dropContext);
    if (!widget.document.canMoveKey(source.path, path, mode)) {
      _leaveTarget(id);
      return;
    }
    if (hoverId == id && hoverPosition == mode) return;
    _expandTimer?.cancel();
    setState(() {
      hoverId = id;
      hoverPosition = mode;
    });
    if (mode == JsonDropPosition.inside && collapsed.contains(id)) {
      _expandTimer = Timer(const Duration(milliseconds: 650), () {
        if (mounted && hoverId == id && hoverPosition == mode) {
          setState(() => collapsed.remove(id));
        }
      });
    }
  }

  void _leaveTarget(String id) {
    if (hoverId != id) return;
    _expandTimer?.cancel();
    setState(() {
      hoverId = null;
      hoverPosition = null;
    });
  }

  JsonDropPosition _dropMode(
    Object value,
    Offset globalPosition,
    BuildContext? dropContext,
  ) {
    final render = dropContext?.findRenderObject();
    if (render is! RenderBox || render.size.height == 0) {
      return JsonDropPosition.before;
    }
    final fraction =
        render.globalToLocal(globalPosition).dy / render.size.height;
    final canNest =
        value is Map<String, dynamic> || value is String && value.isEmpty;
    if (canNest) {
      if (fraction < 0.32) return JsonDropPosition.before;
      if (fraction > 0.68) return JsonDropPosition.after;
      return JsonDropPosition.inside;
    }
    return fraction < 0.5 ? JsonDropPosition.before : JsonDropPosition.after;
  }

  Future<void> _dropKey(
    _JsonKeyDrag source,
    List<Object> destination,
    JsonDropPosition mode,
  ) async {
    if (!_dragEnabled) return;
    try {
      final saved = await save(
        widget.document.moveKey(source.path, destination, mode),
      );
      if (saved && mode == JsonDropPosition.inside && mounted) {
        setState(() => collapsed.remove(jsonEncode(destination)));
      }
    } catch (error) {
      showError(error);
    }
  }

  Widget _draggable(
    List<Object> path,
    String label,
    String id,
    Widget child, {
    bool immediate = false,
  }) {
    final color = Theme.of(context).colorScheme;
    final feedback = Material(
      color: color.primaryContainer,
      borderRadius: BorderRadius.circular(10),
      elevation: 6,
      child: SizedBox(
        width: 230,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(Icons.drag_indicator, size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (immediate) {
      return Draggable<_JsonKeyDrag>(
        data: _JsonKeyDrag(path),
        dragAnchorStrategy: pointerDragAnchorStrategy,
        maxSimultaneousDrags: _dragEnabled && draggingId == null ? 1 : 0,
        feedback: feedback,
        onDragStarted: () => _startDrag(id),
        onDragEnd: (_) => _finishDrag(),
        onDragCompleted: _finishDrag,
        onDraggableCanceled: (_, _) => _finishDrag(),
        child: child,
      );
    }
    return LongPressDraggable<_JsonKeyDrag>(
      data: _JsonKeyDrag(path),
      delay: const Duration(milliseconds: 300),
      hapticFeedbackOnStart: false,
      dragAnchorStrategy: pointerDragAnchorStrategy,
      maxSimultaneousDrags: _dragEnabled && draggingId == null ? 1 : 0,
      feedback: feedback,
      onDragStarted: () => _startDrag(id),
      onDragEnd: (_) => _finishDrag(),
      onDragCompleted: _finishDrag,
      onDraggableCanceled: (_, _) => _finishDrag(),
      child: child,
    );
  }

  String _copyText(Object value) => value is String
      ? value
      : const JsonEncoder.withIndent('  ').convert(value);

  Future<void> _copy(Object value) async {
    await Clipboard.setData(ClipboardData(text: _copyText(value)));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Copied to clipboard')));
  }

  Future<void> _showEntry(
    List<Object> path,
    String label,
    Object value,
    int index,
    int count,
  ) async {
    final color = Theme.of(context).colorScheme;
    await showDialog<void>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: SelectableText(label),
        insetPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
        scrollable: true,
        content: SizedBox(
          width: 440,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (label.contains('](http')) JsonKeyLabel(rawKey: label),
              _values(path, value, color.surfaceContainerHighest),
              if (count > 1)
                Row(
                  children: [
                    IconButton(
                      tooltip: 'Move $label up',
                      icon: const Icon(Icons.arrow_upward),
                      onPressed: index == 0 || !_dragEnabled
                          ? null
                          : () {
                              Navigator.pop(dialog);
                              reorder(
                                path.sublist(0, path.length - 1),
                                index,
                                -1,
                              );
                            },
                    ),
                    IconButton(
                      tooltip: 'Move $label down',
                      icon: const Icon(Icons.arrow_downward),
                      onPressed: index + 1 == count || !_dragEnabled
                          ? null
                          : () {
                              Navigator.pop(dialog);
                              reorder(
                                path.sublist(0, path.length - 1),
                                index,
                                1,
                              );
                            },
                    ),
                  ],
                ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => _copy(value), child: const Text('Copy')),
          TextButton(
            onPressed: busy
                ? null
                : () {
                    Navigator.pop(dialog);
                    edit(path, label, value);
                  },
            child: const Text('Edit'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Widget _values(List<Object> path, Object value, Color background) {
    final strings = value is List
        ? value.cast<String>()
        : <String>[value as String];
    if (strings.isEmpty) return const SelectableText('[]');
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var index = 0; index < strings.length; index++)
            Padding(
              padding: EdgeInsets.only(top: index == 0 ? 0 : 6),
              child: Container(
                key: ValueKey(
                  'json-value-block-${jsonEncode([...path, index])}',
                ),
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(10, 4, 2, 4),
                decoration: BoxDecoration(
                  color: background,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: SelectableText(
                          strings[index],
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Copy value',
                      icon: const Icon(Icons.copy_outlined, size: 18),
                      padding: const EdgeInsets.all(6),
                      constraints: const BoxConstraints(
                        minWidth: 36,
                        minHeight: 36,
                      ),
                      onPressed: () => _copy(strings[index]),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget entry(
    List<Object> path,
    String label,
    Object value,
    int index,
    int count, {
    bool showAllChildren = false,
  }) {
    final color = Theme.of(context).colorScheme;
    final isObject = value is Map<String, dynamic>;
    final isBranch = isObject || value == '';
    final id = jsonEncode(path);
    final needle = JsonSearch.normalize(widget.searchQuery);
    final expanded = needle.isNotEmpty || !collapsed.contains(id);
    final selfMatches =
        needle.isNotEmpty && JsonSearch.keyMatches(label, needle);
    final includeAll = showAllChildren || selfMatches;
    final children = isObject
        ? value.entries
              .where(
                (child) =>
                    includeAll ||
                    JsonSearch.matches(child.key, child.value, needle),
              )
              .toList()
        : null;
    void toggleBranch() => setState(() {
      if (!collapsed.remove(id)) {
        collapsed.add(id);
      }
    });
    BuildContext? dropContext;
    final active = hoverId == id;
    final displayLabel = label.replaceAllMapped(
      RegExp(r'\[([^\]]+)\]\((https?://[^\s)]+)\)'),
      (match) => match.group(1)!,
    );
    return Column(
      key: ValueKey('json-$id'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DragTarget<_JsonKeyDrag>(
          key: ValueKey('json-drop-$id'),
          onWillAcceptWithDetails: (details) {
            if (!_dragEnabled) return false;
            final allowed =
                [
                  JsonDropPosition.before,
                  JsonDropPosition.after,
                  if (isObject || value == '') JsonDropPosition.inside,
                ].any(
                  (mode) =>
                      widget.document.canMoveKey(details.data.path, path, mode),
                );
            if (allowed) {
              _hover(details.data, path, value, details.offset, dropContext);
            }
            return allowed;
          },
          onMove: (details) =>
              _hover(details.data, path, value, details.offset, dropContext),
          onLeave: (_) => _leaveTarget(id),
          onAcceptWithDetails: (details) {
            final mode = _dropMode(value, details.offset, dropContext);
            if (widget.document.canMoveKey(details.data.path, path, mode)) {
              _dropKey(details.data, path, mode);
            }
            _leaveTarget(id);
          },
          builder: (context, candidates, rejected) => Builder(
            builder: (headerContext) {
              dropContext = headerContext;
              return _draggable(
                path,
                displayLabel,
                id,
                AnimatedOpacity(
                  opacity: draggingId == id ? 0.3 : 1,
                  duration: const Duration(milliseconds: 100),
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 3),
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    decoration: BoxDecoration(
                      color: active && hoverPosition == JsonDropPosition.inside
                          ? color.primaryContainer
                          : color.surface,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    foregroundDecoration: BoxDecoration(
                      border: Border(
                        top: BorderSide(
                          width: 3,
                          color:
                              active && hoverPosition == JsonDropPosition.before
                              ? color.primary
                              : Colors.transparent,
                        ),
                        bottom: BorderSide(
                          width: 3,
                          color:
                              active && hoverPosition == JsonDropPosition.after
                              ? color.primary
                              : Colors.transparent,
                        ),
                      ),
                    ),
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: busy || draggingId != null
                            ? null
                            : isBranch
                            ? toggleBranch
                            : () =>
                                  _showEntry(path, label, value, index, count),
                        child: Row(
                          children: [
                            _draggable(
                              path,
                              displayLabel,
                              id,
                              Semantics(
                                label: 'Drag $displayLabel',
                                child: Tooltip(
                                  message: 'Drag to move',
                                  child: SizedBox(
                                    width: 44,
                                    height: 52,
                                    child: Icon(
                                      Icons.drag_indicator,
                                      size: 22,
                                      color: _dragEnabled
                                          ? color.onSurfaceVariant
                                          : color.outlineVariant,
                                    ),
                                  ),
                                ),
                              ),
                              immediate: true,
                            ),
                            if (isBranch)
                              IconButton(
                                icon: Icon(
                                  expanded
                                      ? Icons.expand_more
                                      : Icons.chevron_right,
                                ),
                                tooltip: 'Toggle $label',
                                onPressed: busy || draggingId != null
                                    ? null
                                    : toggleBranch,
                                constraints: const BoxConstraints(
                                  minWidth: 40,
                                  minHeight: 48,
                                ),
                                padding: EdgeInsets.zero,
                              )
                            else
                              const SizedBox(width: 40),
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 12,
                                ),
                                child: Text(
                                  displayLabel,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.titleSmall,
                                ),
                              ),
                            ),
                            if (active &&
                                hoverPosition == JsonDropPosition.inside)
                              Padding(
                                padding: const EdgeInsets.only(left: 4),
                                child: Icon(
                                  Icons.subdirectory_arrow_right,
                                  color: color.primary,
                                  size: 20,
                                ),
                              ),
                            PopupMenuButton<String>(
                              tooltip: 'Options for $label',
                              enabled: !busy && draggingId == null,
                              icon: const Icon(Icons.more_vert),
                              onSelected: (action) {
                                switch (action) {
                                  case 'copy':
                                    _copy(value);
                                  case 'edit':
                                    edit(path, label, value);
                                  case 'delete':
                                    delete(path, label);
                                }
                              },
                              itemBuilder: (_) => const [
                                PopupMenuItem(
                                  value: 'copy',
                                  child: Text('Copy'),
                                ),
                                PopupMenuItem(
                                  value: 'edit',
                                  child: Text('Edit'),
                                ),
                                PopupMenuItem(
                                  value: 'delete',
                                  child: Text('Delete'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        if (isBranch && expanded)
          Padding(
            padding: const EdgeInsets.only(left: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (children == null || children.isEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(84, 4, 12, 12),
                    child: Text(
                      'No child entries',
                      style: Theme.of(context).textTheme.bodySmall
                          ?.copyWith(color: color.onSurfaceVariant),
                    ),
                  ),
                if (children != null)
                  for (var i = 0; i < children.length; i++)
                    entry(
                      [...path, children[i].key],
                      children[i].key,
                      children[i].value,
                      i,
                      children.length,
                      showAllChildren: includeAll,
                    ),
              ],
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final all = widget.document.data.entries.toList();
    final needle = JsonSearch.normalize(widget.searchQuery);
    final matches = all
        .where((item) => JsonSearch.matches(item.key, item.value, needle))
        .toList();
    return Listener(
      onPointerMove: (event) => _dragPointer = event.position,
      child: Column(
        children: [
          if (busy) const LinearProgressIndicator(),
          Expanded(
            key: _viewportKey,
            child: matches.isEmpty && needle.isNotEmpty
                ? const Center(child: Text('No matching entries'))
                : ListView(
                    key: ValueKey('json-results-$needle'),
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    children: [
                      for (final item in matches)
                        entry(
                          [item.key],
                          item.key,
                          item.value,
                          all.indexWhere((e) => e.key == item.key),
                          all.length,
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
