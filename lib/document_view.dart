import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'json_document.dart';

class JsonDocumentView extends StatefulWidget {
  const JsonDocumentView({
    super.key,
    required this.document,
    required this.onSave,
  });
  final JsonDocument document;
  final Future<bool> Function(JsonDocument) onSave;
  @override
  State<JsonDocumentView> createState() => _JsonDocumentViewState();
}

class _Draft {
  const _Draft(this.name, this.value);
  final String name;
  final Object? value;
}

class _JsonDocumentViewState extends State<JsonDocumentView> {
  bool busy = false;
  final Set<String> collapsed = {};
  final search = TextEditingController();
  String filter = '';

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  static String kind(Object? value) => switch (value) {
    Map() => 'Object',
    List() => 'Array',
    String() => 'String',
    bool() => 'Boolean',
    num() => 'Number',
    null => 'Null',
    _ => 'Unknown',
  };

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

  Future<_Draft?> editDialog({
    String name = '',
    Object? current,
    bool isNew = false,
    bool requireKey = false,
  }) async {
    var draftName = name;
    var type = isNew ? 'String' : kind(current);
    var raw = !isNew && current is! Map && current is! List
        ? (current is String ? current : jsonEncode(current))
        : '';
    String? validation;
    return showDialog<_Draft>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: Text(isNew ? 'Add JSON entry' : 'Edit JSON entry'),
          scrollable: true,
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (requireKey)
                  TextFormField(
                    initialValue: draftName,
                    onChanged: (s) => draftName = s,
                    decoration: const InputDecoration(labelText: 'Key'),
                  ),
                DropdownButtonFormField<String>(
                  initialValue: type,
                  decoration: const InputDecoration(labelText: 'Value type'),
                  items:
                      const [
                            'String',
                            'Object',
                            'Array',
                            'Number',
                            'Boolean',
                            'Null',
                          ]
                          .map(
                            (type) => DropdownMenuItem(
                              value: type,
                              child: Text(type),
                            ),
                          )
                          .toList(),
                  onChanged: (v) {
                    if (v != null) {
                      update(() {
                        type = v;
                        validation = null;
                      });
                    }
                  },
                ),
                if (type == 'String' || type == 'Number' || type == 'Boolean')
                  TextFormField(
                    key: ValueKey('value-$type'),
                    initialValue: raw,
                    minLines: type == 'String' ? 2 : 1,
                    maxLines: type == 'String' ? 8 : 1,
                    onChanged: (s) => raw = s,
                    decoration: InputDecoration(
                      labelText: type == 'String' ? 'Text' : 'Value',
                    ),
                  ),
                if (validation != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      validation!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                try {
                  if (requireKey && draftName.trim().isEmpty) {
                    throw const FormatException('Key cannot be empty');
                  }
                  final Object? value = switch (type) {
                    'String' => raw,
                    'Object' =>
                      current is Map<String, dynamic> && !isNew
                          ? current
                          : <String, dynamic>{},
                    'Array' =>
                      current is List && !isNew ? current : <dynamic>[],
                    'Number' => num.parse(raw.trim()),
                    'Boolean' => switch (raw.trim().toLowerCase()) {
                      'true' => true,
                      'false' => false,
                      _ => throw const FormatException('Enter true or false'),
                    },
                    'Null' => null,
                    _ => throw const FormatException('Invalid JSON type'),
                  };
                  Navigator.pop(context, _Draft(draftName.trim(), value));
                } catch (e) {
                  update(() => validation = '$e');
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> add(List<Object> parentPath) async {
    final parent = widget.document.at(parentPath);
    final draft = await editDialog(isNew: true, requireKey: parent is Map);
    if (draft == null) return;
    try {
      await save(widget.document.add(parentPath, draft.name, draft.value));
    } catch (e) {
      showError(e);
    }
  }

  Future<void> edit(List<Object> path, String label, Object? current) async {
    final parent = widget.document.at(path.sublist(0, path.length - 1));
    final draft = await editDialog(
      name: label,
      current: current,
      requireKey: parent is Map,
    );
    if (draft == null) return;
    try {
      await save(
        widget.document.update(
          path,
          draft.value,
          newKey: parent is Map ? draft.name : null,
        ),
      );
    } catch (e) {
      showError(e);
    }
  }

  Future<void> delete(List<Object> path, String label) async {
    final yes = await showDialog<bool>(
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
    if (yes != true) return;
    try {
      await save(widget.document.delete(path));
    } catch (e) {
      showError(e);
    }
  }

  Future<void> reorder(List<Object> path, int index, int offset) async {
    try {
      await save(widget.document.reorder(path, index, index + offset));
    } catch (e) {
      showError(e);
    }
  }

  Widget action(IconData icon, String tooltip, VoidCallback callback) =>
      IconButton(
        icon: Icon(icon, size: 19),
        tooltip: tooltip,
        onPressed: busy ? null : callback,
        constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
        padding: const EdgeInsets.all(5),
        visualDensity: VisualDensity.compact,
      );

  Widget entry(
    List<Object> path,
    String label,
    Object? value,
    int index,
    int count,
  ) {
    final color = Theme.of(context).colorScheme;
    final nested = value is Map<String, dynamic> || value is List;
    final id = jsonEncode(path);
    final expanded = !collapsed.contains(id);
    final parent = path.sublist(0, path.length - 1);
    final children = value is Map<String, dynamic>
        ? value.entries.toList()
        : null;
    final array = value is List ? value : null;
    return Card(
      key: ValueKey('json-${jsonEncode(path)}'),
      elevation: 0,
      color: color.surface,
      margin: const EdgeInsets.symmetric(vertical: 2),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: color.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                if (nested)
                  action(
                    expanded ? Icons.expand_more : Icons.chevron_right,
                    'Toggle $label',
                    () => setState(() {
                      if (!collapsed.remove(id)) collapsed.add(id);
                    }),
                  ),
                Expanded(
                  child: Text(
                    label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
              ],
            ),
            Row(
              children: [
                Text(
                  kind(value),
                  style: Theme.of(context).textTheme.labelSmall,
                ),
                const Spacer(),
                if (index > 0)
                  action(
                    Icons.arrow_upward,
                    'Move $label up',
                    () => reorder(parent, index, -1),
                  ),
                if (index + 1 < count)
                  action(
                    Icons.arrow_downward,
                    'Move $label down',
                    () => reorder(parent, index, 1),
                  ),
                if (nested)
                  action(Icons.add, 'Add child to $label', () => add(path)),
                action(
                  Icons.edit_outlined,
                  'Edit $label',
                  () => edit(path, label, value),
                ),
                action(
                  Icons.delete_outline,
                  'Delete $label',
                  () => delete(path, label),
                ),
              ],
            ),
            if (value is String)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: SelectableText(
                        value,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 13,
                        ),
                      ),
                    ),
                    action(Icons.copy_outlined, 'Copy $label', () {
                      Clipboard.setData(ClipboardData(text: value));
                    }),
                  ],
                ),
              ),
            if (value != null && value is! String && !nested)
              SelectableText(jsonEncode(value)),
            if (nested && expanded)
              Padding(
                // Each level needs only a few pixels beyond the parent border.
                // The child Card already draws its own outline; a second
                // indented border wastes horizontal space on deep JSON trees.
                padding: const EdgeInsets.only(left: 1),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (children != null)
                      for (var i = 0; i < children.length; i++)
                        entry(
                          [...path, children[i].key],
                          children[i].key,
                          children[i].value,
                          i,
                          children.length,
                        ),
                    if (array != null)
                      for (var i = 0; i < array.length; i++)
                        entry(
                          [...path, i],
                          '[${i + 1}]',
                          array[i],
                          i,
                          array.length,
                        ),
                    if ((children?.isEmpty ?? array?.isEmpty ?? false))
                      const Padding(
                        padding: EdgeInsets.all(8),
                        child: Text('Empty'),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final entries = widget.document.data.entries
        .where(
          (e) =>
              filter.isEmpty ||
              e.key.toLowerCase().contains(filter.toLowerCase()),
        )
        .toList();
    final all = widget.document.data.entries.toList();
    return Column(
      children: [
        if (busy) const LinearProgressIndicator(),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: search,
                  decoration: const InputDecoration(
                    hintText: 'Search keys',
                    border: InputBorder.none,
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (s) => setState(() => filter = s),
                ),
              ),
              action(Icons.add, 'Add JSON key', () => add([])),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            children: [
              for (final e in entries)
                entry(
                  [e.key],
                  e.key,
                  e.value,
                  all.indexWhere((x) => x.key == e.key),
                  all.length,
                ),
            ],
          ),
        ),
      ],
    );
  }
}
