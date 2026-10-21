import React, { useState } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { BlockEditor } from "@/components/block-editor";
import {
  BlockToolbar,
  type DragCallbacks,
  type ToolbarActionDescriptor,
} from "@/components/block-toolbar";
import {
  CodeContentView,
  InlineMarkdownText,
  MarkdownContent,
} from "@/components/markdown-content";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import type {
  DocumentTreeNode,
  DropMode,
  EditState,
  MarkdownBlock,
} from "@/lib/markdown-blocks";
import { MONO_FONT, type SecretsKeepPalette } from "@/lib/theme";

export type BlockActionType =
  | "edit"
  | "child-branch"
  | "add-item"
  | "add-code"
  | "item-code"
  | "copy";

export type DropIndicator = {
  targetId: string;
  mode: DropMode;
} | null;

export type BlockRegistryCallback = (
  id: string,
  meta: {
    ref: View | null;
    depth: number;
    block?: MarkdownBlock;
    isItemEditor?: boolean;
    actions: ToolbarActionDescriptor[];
    languageBadge?: string;
  } | null,
) => void;

function DropBadge({
  mode,
  palette,
}: {
  mode: DropMode;
  palette: SecretsKeepPalette;
}) {
  const label =
    mode === "inside"
      ? "DROP INSIDE"
      : mode === "before"
        ? "DROP BEFORE"
        : "DROP AFTER";
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        right: 8,
        top: mode === "before" ? -15 : mode === "inside" ? 7 : undefined,
        bottom: mode === "after" ? -15 : undefined,
        zIndex: 25,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: palette.drop,
      }}
    >
      <Text
        style={{
          color: palette.inverse,
          fontFamily: MONO_FONT,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function getDropFrameStyle(
  isDragSource: boolean,
  dropMode: DropMode | null,
  palette: SecretsKeepPalette,
): ViewStyle {
  if (isDragSource) {
    return {
      opacity: 0.56,
      borderColor: palette.drop,
      borderStyle: "dashed",
    };
  }
  if (dropMode === "inside") {
    return {
      borderWidth: 3,
      borderColor: palette.drop,
      backgroundColor: palette.dropTint,
    };
  }
  if (dropMode === "before") {
    return {
      borderTopWidth: 4,
      borderTopColor: palette.drop,
    };
  }
  if (dropMode === "after") {
    return {
      borderBottomWidth: 4,
      borderBottomColor: palette.drop,
    };
  }
  return {};
}

export function buildToolbarActionsForBlock(
  block: MarkdownBlock,
  onBlockAction: (action: BlockActionType, block: MarkdownBlock) => void,
  canDrag: boolean,
): ToolbarActionDescriptor[] {
  if (block.type === "heading") {
    return [
      {
        key: "edit",
        icon: "edit",
        label: "Edit",
        onPress: () => onBlockAction("edit", block),
      },
      {
        key: "child-branch",
        icon: "branch",
        label: "Create branch",
        onPress: () => onBlockAction("child-branch", block),
      },
      {
        key: "add-item",
        icon: "plus",
        label: "Add item",
        onPress: () => onBlockAction("add-item", block),
      },
      {
        key: "add-code",
        icon: "code",
        label: "Add code block",
        onPress: () => onBlockAction("add-code", block),
      },
      ...(canDrag
        ? [
            {
              key: "move",
              icon: "move" as const,
              label: "Move",
              dragBlockId: block.id,
            },
          ]
        : []),
    ];
  }

  if (block.type === "item") {
    return [
      {
        key: "edit",
        icon: "edit",
        label: "Edit",
        onPress: () => onBlockAction("edit", block),
      },
      {
        key: "item-code",
        icon: "code",
        label: "Add code block",
        onPress: () => onBlockAction("item-code", block),
      },
      ...(canDrag
        ? [
            {
              key: "move",
              icon: "move" as const,
              label: "Move",
              dragBlockId: block.id,
            },
          ]
        : []),
    ];
  }

  if (block.type === "code") {
    return [
      {
        key: "copy",
        icon: "copy",
        label: "Copy",
        onPress: () => onBlockAction("copy", block),
      },
      {
        key: "edit",
        icon: "edit",
        label: "Edit",
        onPress: () => onBlockAction("edit", block),
      },
      ...(canDrag
        ? [
            {
              key: "move",
              icon: "move" as const,
              label: "Move",
              dragBlockId: block.id,
            },
          ]
        : []),
    ];
  }

  return [
    {
      key: "edit",
      icon: "edit",
      label: "Edit",
      onPress: () => onBlockAction("edit", block),
    },
    ...(canDrag
      ? [
          {
            key: "move",
            icon: "move" as const,
            label: "Move",
            dragBlockId: block.id,
          },
        ]
      : []),
  ];
}

export function DocumentNodeView({
  node,
  depth,
  editing,
  onChangeEditing,
  onSaveEditing,
  onCancelEditing,
  onDeleteEditing,
  onBlockAction,
  activeBlockId,
  onActivateBlock,
  stickyBlockId,
  activeDragId,
  dropIndicator,
  dragCallbacks,
  registerBlockNode,
  searchActive,
  visibleSearchIds,
  matchedSearchIds,
  currentMatchId,
  palette,
  isDark,
  compact,
}: {
  node: DocumentTreeNode;
  depth: number;
  editing: EditState | null;
  onChangeEditing: (next: EditState) => void;
  onSaveEditing: () => Promise<void>;
  onCancelEditing: () => void;
  onDeleteEditing: () => Promise<void>;
  onBlockAction: (action: BlockActionType, block: MarkdownBlock) => void;
  activeBlockId: string | null;
  onActivateBlock: (blockId: string) => void;
  stickyBlockId: string | null;
  activeDragId: string | null;
  dropIndicator: DropIndicator;
  dragCallbacks: DragCallbacks;
  registerBlockNode: BlockRegistryCallback;
  searchActive: boolean;
  visibleSearchIds: Set<string>;
  matchedSearchIds: Set<string>;
  currentMatchId: string | null;
  palette: SecretsKeepPalette;
  isDark: boolean;
  compact: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const { block } = node;

  if (searchActive && !visibleSearchIds.has(block.id)) {
    return null;
  }

  // Hide child code blocks currently absorbed into parent's multi-code item editor
  if (
    editing?.type === "item" &&
    editing.itemCodes?.some((code) => code.blockId === block.id)
  ) {
    return null;
  }

  const editingThis = editing?.mode === "edit" && editing.blockId === block.id;
  const canDrag = !editing;
  const actions = buildToolbarActionsForBlock(block, onBlockAction, canDrag);
  const isDragSource = activeDragId === block.id;
  const dropMode =
    dropIndicator?.targetId === block.id ? dropIndicator.mode : null;
  const isSearchMatch = searchActive && matchedSearchIds.has(block.id);
  const isCurrentMatch = searchActive && currentMatchId === block.id;
  const toolbarVisible =
    !activeDragId &&
    stickyBlockId !== block.id &&
    (hovered || activeBlockId === block.id);

  if (node.kind === "heading") {
    const level = Math.max(1, Math.min(6, block.level || 1));
    const borderWidths = compact ? [2, 2, 1, 1, 1, 1] : [3, 2, 1, 1, 1, 1];
    const headingSizes = compact
      ? [25, 21, 18, 16, 14, 14]
      : [31, 23, 18, 16, 14, 14];
    const fontSize = headingSizes[level - 1];

    return (
      <View
        ref={(ref) =>
          registerBlockNode(block.id, {
            ref,
            depth,
            block,
            actions,
          })
        }
        style={[
          {
            position: "relative",
            overflow: "visible",
            marginVertical: compact ? 8 : 10,
            padding: compact ? 9 : 12,
            borderRadius: compact ? 10 : 12,
            borderWidth: borderWidths[level - 1],
            borderColor: palette.sep[level - 1],
            backgroundColor: palette.panelTranslucent,
          },
          getDropFrameStyle(isDragSource, dropMode, palette),
        ]}
      >
        {dropMode ? <DropBadge mode={dropMode} palette={palette} /> : null}

        {editingThis ? (
          <BlockEditor
            editing={editing}
            onChange={onChangeEditing}
            onSave={onSaveEditing}
            onCancel={onCancelEditing}
            onDelete={onDeleteEditing}
            palette={palette}
            compact={compact}
          />
        ) : (
          <Pressable
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            onPress={(e) => {
              e.stopPropagation?.();
              onActivateBlock(block.id);
            }}
            style={{
              position: "relative",
              overflow: "visible",
              paddingRight: compact ? 4 : 8,
            }}
          >
            <View
              style={[
                {
                  alignSelf: "flex-start",
                  borderRadius: 5,
                  paddingHorizontal: isSearchMatch ? 4 : 0,
                  backgroundColor: isSearchMatch ? palette.hover : "transparent",
                  borderWidth: isCurrentMatch ? 2 : 0,
                  borderColor: isCurrentMatch ? palette.focus : "transparent",
                },
              ]}
            >
              <InlineMarkdownText
                source={block.value || ""}
                palette={palette}
                style={{
                  color: palette.strong,
                  fontSize,
                  lineHeight: Math.round(fontSize * 1.24),
                  fontWeight: "700",
                  letterSpacing: -0.4,
                }}
              />
            </View>

            <BlockToolbar
              actions={actions}
              palette={palette}
              compact={compact}
              visible={toolbarVisible}
              activeDragId={activeDragId}
              dragCallbacks={dragCallbacks}
              style={{
                position: "absolute",
                top: -26,
                right: -4,
              }}
            />
          </Pressable>
        )}

        {node.children.length > 0 ||
        (editing?.mode === "new" &&
          editing.parentBlockId === block.id &&
          editing.insertAt === node.rangeEnd) ? (
          <View style={{ marginTop: compact ? 6 : 8, overflow: "visible" }}>
            {node.children.map((child) => (
              <DocumentNodeView
                key={child.block.id}
                node={child}
                depth={depth + 1}
                editing={editing}
                onChangeEditing={onChangeEditing}
                onSaveEditing={onSaveEditing}
                onCancelEditing={onCancelEditing}
                onDeleteEditing={onDeleteEditing}
                onBlockAction={onBlockAction}
                activeBlockId={activeBlockId}
                onActivateBlock={onActivateBlock}
                stickyBlockId={stickyBlockId}
                activeDragId={activeDragId}
                dropIndicator={dropIndicator}
                dragCallbacks={dragCallbacks}
                registerBlockNode={registerBlockNode}
                searchActive={searchActive}
                visibleSearchIds={visibleSearchIds}
                matchedSearchIds={matchedSearchIds}
                currentMatchId={currentMatchId}
                palette={palette}
                isDark={isDark}
                compact={compact}
              />
            ))}

            {editing?.mode === "new" &&
            editing.parentBlockId === block.id &&
            editing.insertAt === node.rangeEnd ? (
              <BlockEditor
                editing={editing}
                onChange={onChangeEditing}
                onSave={onSaveEditing}
                onCancel={onCancelEditing}
                onDelete={onDeleteEditing}
                palette={palette}
                compact={compact}
                stickyToolbarHidden={stickyBlockId === "__item_editor__"}
                onRegisterNode={
                  editing.type === "item"
                    ? (ref) =>
                        registerBlockNode("__item_editor__", {
                          ref,
                          depth: depth + 1,
                          isItemEditor: true,
                          actions: [],
                        })
                    : undefined
                }
              />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  if (node.kind === "item") {
    return (
      <View
        ref={(ref) =>
          registerBlockNode(block.id, {
            ref,
            depth,
            block,
            actions,
          })
        }
        style={[
          {
            position: "relative",
            overflow: "visible",
            marginVertical: compact ? 7 : 8,
            padding: compact ? 8 : 10,
            borderRadius: compact ? 9 : 10,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: palette.line2,
            backgroundColor: palette.itemPanelTranslucent,
          },
          getDropFrameStyle(isDragSource, dropMode, palette),
        ]}
      >
        {dropMode ? <DropBadge mode={dropMode} palette={palette} /> : null}

        {editingThis ? (
          <BlockEditor
            editing={editing}
            onChange={onChangeEditing}
            onSave={onSaveEditing}
            onCancel={onCancelEditing}
            onDelete={onDeleteEditing}
            palette={palette}
            compact={compact}
            stickyToolbarHidden={stickyBlockId === "__item_editor__"}
            onRegisterNode={(ref) =>
              registerBlockNode("__item_editor__", {
                ref,
                depth: depth + 1,
                isItemEditor: true,
                actions: [],
              })
            }
          />
        ) : (
          <Pressable
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            onPress={(e) => {
              e.stopPropagation?.();
              onActivateBlock(block.id);
            }}
            style={{ position: "relative", overflow: "visible" }}
          >
            <View
              style={[
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingLeft: 4,
                  borderRadius: 5,
                  paddingHorizontal: isSearchMatch ? 6 : 4,
                  backgroundColor: isSearchMatch ? palette.hover : "transparent",
                  borderWidth: isCurrentMatch ? 2 : 0,
                  borderColor: isCurrentMatch ? palette.focus : "transparent",
                },
              ]}
            >
              <Text style={{ color: palette.muted, fontSize: 15 }}>•</Text>
              <InlineMarkdownText
                source={block.value || ""}
                palette={palette}
                style={{
                  color: palette.strong,
                  fontSize: compact ? 15 : 15.5,
                  lineHeight: 24,
                  fontWeight: "700",
                }}
              />
            </View>

            <BlockToolbar
              actions={actions}
              palette={palette}
              compact={compact}
              visible={toolbarVisible}
              activeDragId={activeDragId}
              dragCallbacks={dragCallbacks}
              style={{
                position: "absolute",
                top: -24,
                right: -2,
              }}
            />
          </Pressable>
        )}

        {node.children.length > 0 ||
        (editing?.mode === "new" &&
          editing.parentBlockId === block.id &&
          editing.insertAt === node.rangeEnd) ? (
          <View style={{ marginTop: compact ? 6 : 8, overflow: "visible" }}>
            {node.children.map((child) => (
              <DocumentNodeView
                key={child.block.id}
                node={child}
                depth={depth + 1}
                editing={editing}
                onChangeEditing={onChangeEditing}
                onSaveEditing={onSaveEditing}
                onCancelEditing={onCancelEditing}
                onDeleteEditing={onDeleteEditing}
                onBlockAction={onBlockAction}
                activeBlockId={activeBlockId}
                onActivateBlock={onActivateBlock}
                stickyBlockId={stickyBlockId}
                activeDragId={activeDragId}
                dropIndicator={dropIndicator}
                dragCallbacks={dragCallbacks}
                registerBlockNode={registerBlockNode}
                searchActive={searchActive}
                visibleSearchIds={visibleSearchIds}
                matchedSearchIds={matchedSearchIds}
                currentMatchId={currentMatchId}
                palette={palette}
                isDark={isDark}
                compact={compact}
              />
            ))}

            {editing?.mode === "new" &&
            editing.parentBlockId === block.id &&
            editing.insertAt === node.rangeEnd ? (
              <BlockEditor
                editing={editing}
                onChange={onChangeEditing}
                onSave={onSaveEditing}
                onCancel={onCancelEditing}
                onDelete={onDeleteEditing}
                palette={palette}
                compact={compact}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  // Leaf blocks: editing mode first
  if (editingThis) {
    return (
      <BlockEditor
        editing={editing}
        onChange={onChangeEditing}
        onSave={onSaveEditing}
        onCancel={onCancelEditing}
        onDelete={onDeleteEditing}
        palette={palette}
        compact={compact}
      />
    );
  }

  if (block.type === "code") {
    const language = (block.language || "").trim();
    const nestedMargin =
      depth === 0 && !compact && (block.indent || "").length >= 2 ? 24 : 0;

    return (
      <Pressable
        ref={(ref) =>
          registerBlockNode(block.id, {
            ref,
            depth,
            block,
            actions,
            languageBadge: language || undefined,
          })
        }
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPress={(e) => {
          e.stopPropagation?.();
          onActivateBlock(block.id);
        }}
        style={[
          {
            position: "relative",
            overflow: "visible",
            marginVertical: 8,
            marginLeft: nestedMargin,
          },
          getDropFrameStyle(isDragSource, dropMode, palette),
        ]}
      >
        {dropMode ? <DropBadge mode={dropMode} palette={palette} /> : null}

        <CodeContentView
          code={block.value || ""}
          language={language}
          palette={palette}
          isDark={isDark}
          compact={compact}
        />

        <BlockToolbar
          actions={actions}
          languageBadge={language || undefined}
          palette={palette}
          compact={compact}
          visible={toolbarVisible}
          activeDragId={activeDragId}
          dragCallbacks={dragCallbacks}
          style={{
            position: "absolute",
            top: -16,
            right: compact ? 8 : 10,
          }}
        />
      </Pressable>
    );
  }

  if (block.type === "divider") {
    return (
      <Pressable
        ref={(ref) =>
          registerBlockNode(block.id, {
            ref,
            depth,
            block,
            actions,
          })
        }
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPress={(e) => {
          e.stopPropagation?.();
          onActivateBlock(block.id);
        }}
        style={[
          {
            position: "relative",
            overflow: "visible",
            marginVertical: 16,
            paddingVertical: 6,
          },
          getDropFrameStyle(isDragSource, dropMode, palette),
        ]}
      >
        {dropMode ? <DropBadge mode={dropMode} palette={palette} /> : null}
        <Separator style={{ backgroundColor: palette.line2 }} />
        <BlockToolbar
          actions={actions}
          palette={palette}
          compact={compact}
          visible={toolbarVisible}
          activeDragId={activeDragId}
          dragCallbacks={dragCallbacks}
          style={{
            position: "absolute",
            top: -12,
            right: 8,
          }}
        />
      </Pressable>
    );
  }

  // Raw Markdown ("other") block
  return (
    <Pressable
      ref={(ref) =>
        registerBlockNode(block.id, {
          ref,
          depth,
          block,
          actions,
        })
      }
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={(e) => {
        e.stopPropagation?.();
        onActivateBlock(block.id);
      }}
      style={[
        {
          position: "relative",
          overflow: "visible",
          marginVertical: 4,
        },
        getDropFrameStyle(isDragSource, dropMode, palette),
      ]}
    >
      {dropMode ? <DropBadge mode={dropMode} palette={palette} /> : null}
      <MarkdownContent
        source={block.value ?? block.raw}
        palette={palette}
        isDark={isDark}
        compact={compact}
      />
      <BlockToolbar
        actions={actions}
        palette={palette}
        compact={compact}
        visible={toolbarVisible}
        activeDragId={activeDragId}
        dragCallbacks={dragCallbacks}
        style={{
          position: "absolute",
          top: -16,
          right: 0,
        }}
      />
    </Pressable>
  );
}
