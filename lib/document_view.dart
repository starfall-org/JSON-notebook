import 'dart:convert';

import 'package:flutter/material.dart';

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

class _ValueField {
  _ValueField(this.id, this.text);
  final int id;
  String text;
}

class _Draft {
  const _Draft(this.name, this.fields, {this.delete = false});
  final String name;
  final List<String> fields;
  final bool delete;
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
          actions: [
            if (!isNew)
              TextButton.icon(
                onPressed: () =>
                    Navigator.pop(dialog, const _Draft('', [], delete: true)),
                icon: const Icon(Icons.delete_outline),
                label: const Text('Delete'),
                style: TextButton.styleFrom(
                  foregroundColor: Theme.of(dialog).colorScheme.error,
                ),
              ),
            TextButton(
              onPressed: () => Navigator.pop(dialog),
              child: const Text('Cancel'),
            ),
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
              child: const Text('Save'),
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
    final draft = await editDialog(isNew: true, requireKey: true);
    if (draft == null) return;
    try {
      await save(widget.document.addKey(path, draft.name, draft.fields));
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
    final draft = await editDialog(
      name: name,
      current: current,
      requireKey: parent is Map,
      appendField: appendField,
    );
    if (draft == null) return;
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

  Widget action(IconData icon, String tooltip, VoidCallback callback) =>
      IconButton(
        icon: Icon(icon, size: 18),
        tooltip: tooltip,
        onPressed: busy ? null : callback,
        constraints: const BoxConstraints(minWidth: 30, minHeight: 32),
        padding: const EdgeInsets.all(4),
        visualDensity: VisualDensity.compact,
      );

  Widget _values(Object value, Color background) {
    final strings = value is List
        ? value.cast<String>()
        : <String>[value as String];
    if (strings.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final text in strings)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: SelectableText(
                text,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
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
    int count,
  ) {
    final color = Theme.of(context).colorScheme;
    final isObject = value is Map<String, dynamic>;
    final id = jsonEncode(path);
    final expanded = !collapsed.contains(id);
    final parent = path.sublist(0, path.length - 1);
    final children = isObject ? value.entries.toList() : null;
    return Card(
      key: ValueKey('json-$id'),
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
            // Title and actions are always on one line; key gets remaining width.
            Row(
              children: [
                if (isObject)
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
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
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
                action(Icons.add, 'Add to $label', () => add(path)),
                action(
                  Icons.edit_outlined,
                  'Edit $label',
                  () => edit(path, label, value),
                ),
              ],
            ),
            if (!isObject) _values(value, color.surfaceContainerHighest),
            if (isObject && expanded)
              Padding(
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
                    if (children?.isEmpty ?? false)
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
    final all = widget.document.data.entries.toList();
    final entries = all
        .where(
          (entry) =>
              filter.isEmpty ||
              entry.key.toLowerCase().contains(filter.toLowerCase()),
        )
        .toList();
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
                  onChanged: (text) => setState(() => filter = text),
                ),
              ),
              action(Icons.add, 'Add entry', () => add([])),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            children: [for (final entry in entries) entryWidget(entry, all)],
          ),
        ),
      ],
    );
  }

  Widget entryWidget(
    MapEntry<String, dynamic> item,
    List<MapEntry<String, dynamic>> all,
  ) => entry(
    [item.key],
    item.key,
    item.value,
    all.indexWhere((entry) => entry.key == item.key),
    all.length,
  );
}
