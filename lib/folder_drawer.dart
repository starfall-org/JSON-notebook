import 'package:flutter/material.dart';

import 'vault_store.dart';

/// Directory tree with lazily loaded children. Only opened branches request
/// Drive listings, keeping network requests bounded on large vaults.
class FolderDrawer extends StatelessWidget {
  const FolderDrawer({
    super.key,
    required this.store,
    required this.root,
    required this.selectedId,
    required this.onFolder,
    required this.onFile,
  });
  final VaultStore store;
  final DriveEntry root;
  final String? selectedId;
  final ValueChanged<List<DriveEntry>> onFolder;
  final void Function(List<DriveEntry> path, DriveEntry file) onFile;

  @override
  Widget build(BuildContext context) => Drawer(
    child: SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            title: const Text('JSON Notebook'),
            leading: const Icon(Icons.folder_open),
            subtitle: const Text('Google Drive vault'),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              children: [
                FolderTreeNode(
                  key: ValueKey(root.id),
                  store: store,
                  entry: root,
                  path: [root],
                  initiallyOpen: true,
                  selectedId: selectedId,
                  onFolder: onFolder,
                  onFile: onFile,
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class FolderTreeNode extends StatefulWidget {
  const FolderTreeNode({
    super.key,
    required this.store,
    required this.entry,
    required this.path,
    required this.selectedId,
    required this.onFolder,
    required this.onFile,
    this.initiallyOpen = false,
  });
  final VaultStore store;
  final DriveEntry entry;
  final List<DriveEntry> path;
  final String? selectedId;
  final ValueChanged<List<DriveEntry>> onFolder;
  final void Function(List<DriveEntry> path, DriveEntry file) onFile;
  final bool initiallyOpen;
  @override
  State<FolderTreeNode> createState() => _FolderTreeNodeState();
}

class _FolderTreeNodeState extends State<FolderTreeNode> {
  bool expanded = false;
  Future<List<DriveEntry>>? children;
  @override
  void initState() {
    super.initState();
    expanded = widget.initiallyOpen;
    if (expanded) children = widget.store.children(widget.entry.id);
  }

  void _toggle() => setState(() {
    expanded = !expanded;
    if (expanded) children ??= widget.store.children(widget.entry.id);
  });

  @override
  Widget build(BuildContext context) {
    final depth = widget.path.length - 1;
    final childrenWidget = children;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: EdgeInsets.only(left: depth * 12.0),
          child: ListTile(
            dense: true,
            leading: IconButton(
              icon: Icon(expanded ? Icons.expand_more : Icons.chevron_right),
              onPressed: _toggle,
              tooltip: expanded ? 'Collapse' : 'Expand',
            ),
            title: Text(
              widget.entry.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            selected: widget.selectedId == widget.entry.id,
            onTap: () => widget.onFolder(widget.path),
            trailing: IconButton(
              onPressed: _toggle,
              icon: const Icon(Icons.folder_outlined),
              tooltip: 'Toggle tree',
            ),
          ),
        ),
        if (expanded && childrenWidget != null)
          FutureBuilder<List<DriveEntry>>(
            future: childrenWidget,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return Padding(
                  padding: EdgeInsets.only(left: (depth + 1) * 16.0),
                  child: TextButton.icon(
                    onPressed: () => setState(
                      () => children = widget.store.children(widget.entry.id),
                    ),
                    icon: const Icon(Icons.refresh),
                    label: const Text('Retry loading folder'),
                  ),
                );
              }
              if (!snapshot.hasData) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Center(
                    child: SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                );
              }
              final visible =
                  snapshot.data!
                      .where(
                        (entry) =>
                            entry.isFolder ||
                            entry.name.toLowerCase().endsWith('.md') ||
                            entry.name.toLowerCase().endsWith('.json'),
                      )
                      .toList()
                    ..sort((a, b) {
                      if (a.isFolder != b.isFolder) return a.isFolder ? -1 : 1;
                      return a.name.toLowerCase().compareTo(
                        b.name.toLowerCase(),
                      );
                    });
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final item in visible)
                    if (item.isFolder)
                      FolderTreeNode(
                        key: ValueKey(item.id),
                        store: widget.store,
                        entry: item,
                        path: [...widget.path, item],
                        selectedId: widget.selectedId,
                        onFolder: widget.onFolder,
                        onFile: widget.onFile,
                      )
                    else
                      Padding(
                        padding: EdgeInsets.only(left: (depth + 1) * 12.0),
                        child: ListTile(
                          dense: true,
                          leading: Icon(
                            item.name.endsWith('.json')
                                ? Icons.data_object
                                : Icons.description_outlined,
                            size: 20,
                          ),
                          title: Text(
                            item.name,
                            overflow: TextOverflow.ellipsis,
                            maxLines: 1,
                          ),
                          selected: widget.selectedId == item.id,
                          onTap: () => widget.onFile(widget.path, item),
                        ),
                      ),
                ],
              );
            },
          ),
      ],
    );
  }
}
