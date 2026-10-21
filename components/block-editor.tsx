import { Code2, Plus, Trash2 } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import {
  BlockToolbar,
  type ToolbarActionDescriptor,
} from "@/components/block-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EditState, ItemCodeDraft } from "@/lib/markdown-blocks";
import { MONO_FONT, type SecretsKeepPalette } from "@/lib/theme";

export function BlockEditor({
  editing,
  onChange,
  onSave,
  onCancel,
  onDelete,
  palette,
  compact = false,
  stickyToolbarHidden = false,
  onRegisterNode,
}: {
  editing: EditState;
  onChange: (next: EditState) => void;
  onSave: () => Promise<void> | void;
  onCancel: () => void;
  onDelete: () => Promise<void> | void;
  palette: SecretsKeepPalette;
  compact?: boolean;
  stickyToolbarHidden?: boolean;
  onRegisterNode?: (ref: View | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const primaryInputRef = useRef<TextInput>(null);
  const codeDraftRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      primaryInputRef.current?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, [editing.blockId, editing.mode]);

  const editActions: ToolbarActionDescriptor[] = [
    {
      key: "save-edit",
      icon: "save",
      label: "Save",
      disabled: saving,
      onPress: async () => {
        setSaving(true);
        try {
          await onSave();
        } finally {
          setSaving(false);
        }
      },
    },
    {
      key: "cancel-edit",
      icon: "cancel",
      label: "Cancel",
      disabled: saving,
      onPress: onCancel,
    },
    {
      key: "delete-edit",
      icon: "trash",
      label: "Delete",
      disabled: saving,
      onPress: async () => {
        setSaving(true);
        try {
          await onDelete();
        } finally {
          setSaving(false);
        }
      },
    },
  ];

  const handleModeChange = (kind: string | undefined) => {
    if (kind !== "code" && kind !== "other") return;
    onChange({
      ...editing,
      type: kind,
      indent: editing.parentIndent !== undefined ? editing.parentIndent + "  " : "",
    });
  };

  const updateItemCode = (index: number, patch: Partial<ItemCodeDraft>) => {
    const nextCodes = [...(editing.itemCodes || [])];
    nextCodes[index] = { ...nextCodes[index], ...patch };
    onChange({ ...editing, itemCodes: nextCodes });
  };

  const addItemCodeDraft = () => {
    const nextCodes = [
      ...(editing.itemCodes || []),
      {
        value: "",
        language: "",
        indent: (editing.indent || "") + "  ",
      },
    ];
    onChange({ ...editing, itemCodes: nextCodes });
    setTimeout(() => {
      codeDraftRefs.current[nextCodes.length - 1]?.focus();
    }, 30);
  };

  const removeNewItemCodeDraft = (index: number) => {
    const target = editing.itemCodes?.[index];
    if (!target || target.blockId) return;
    const nextCodes = [...(editing.itemCodes || [])];
    nextCodes.splice(index, 1);
    onChange({ ...editing, itemCodes: nextCodes });
  };

  const nestedOffset = !compact && (editing.indent || "").length >= 2 ? 24 : 0;

  if (editing.type === "code" || editing.type === "other") {
    return (
      <View
        ref={onRegisterNode}
        style={{
          position: "relative",
          marginVertical: 10,
          marginLeft: editing.type === "code" ? nestedOffset : 0,
          padding: compact ? 8 : 10,
          paddingTop: 18,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: palette.line2,
          backgroundColor: palette.panel,
        }}
      >
        {/* Top-frame toolbar with optional language input */}
        <View
          style={{
            position: "absolute",
            top: -16,
            right: compact ? 6 : 8,
            zIndex: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            padding: 3,
            borderRadius: 9,
            borderWidth: 1,
            borderColor: palette.line,
            backgroundColor: palette.actionBg,
          }}
        >
          {editing.type === "code" ? (
            <Input
              value={editing.language || ""}
              onChangeText={(text) =>
                onChange({
                  ...editing,
                  language: text.replace(/\s+/g, "-"),
                })
              }
              placeholder="language"
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Code language"
              style={{
                width: compact ? 88 : 104,
                height: 30,
                paddingHorizontal: 8,
                paddingVertical: 0,
                borderRadius: 7,
                borderColor: palette.line,
                backgroundColor: palette.panel2,
                color: palette.text,
                fontFamily: MONO_FONT,
                fontSize: 11,
                fontWeight: "600",
              }}
            />
          ) : null}
          <BlockToolbar
            actions={editActions}
            palette={palette}
            compact={compact}
            style={{ borderWidth: 0, padding: 0, backgroundColor: "transparent" }}
          />
        </View>

        {/* Code / Markdown ToggleGroup */}
        <ToggleGroup
          type="single"
          value={editing.type}
          onValueChange={handleModeChange}
          accessibilityLabel="Content type"
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            gap: 3,
            marginBottom: 8,
            padding: 3,
            borderRadius: 9,
            borderWidth: 1,
            borderColor: palette.line,
            backgroundColor: palette.panel2,
          }}
        >
          <ToggleGroupItem
            value="code"
            style={{
              height: 30,
              paddingHorizontal: 9,
              borderRadius: 6,
              backgroundColor:
                editing.type === "code" ? palette.strong : "transparent",
            }}
          >
            <Code2
              size={14}
              strokeWidth={1.8}
              color={editing.type === "code" ? palette.inverse : palette.muted}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: editing.type === "code" ? palette.inverse : palette.muted,
              }}
            >
              Code
            </Text>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="other"
            style={{
              height: 30,
              paddingHorizontal: 9,
              borderRadius: 6,
              backgroundColor:
                editing.type === "other" ? palette.strong : "transparent",
            }}
          >
            <Text
              style={{
                fontFamily: MONO_FONT,
                fontSize: 10,
                fontWeight: "800",
                color: editing.type === "other" ? palette.inverse : palette.muted,
              }}
            >
              MD
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: editing.type === "other" ? palette.inverse : palette.muted,
              }}
            >
              Markdown
            </Text>
          </ToggleGroupItem>
        </ToggleGroup>

        <Textarea
          ref={primaryInputRef}
          value={editing.value}
          onChangeText={(value) => onChange({ ...editing, value })}
          placeholder={editing.type === "code" ? "code" : "Raw Markdown"}
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          style={{
            minHeight: compact ? 132 : 152,
            borderRadius: 9,
            borderColor: palette.line,
            backgroundColor: palette.bg,
            color: palette.text,
            fontFamily: MONO_FONT,
            fontSize: compact ? 12 : 13,
            lineHeight: 20,
            paddingHorizontal: 12,
            paddingVertical: 11,
          }}
        />
      </View>
    );
  }

  if (editing.type === "item") {
    return (
      <View
        ref={onRegisterNode}
        style={{
          position: "relative",
          marginVertical: 10,
          padding: compact ? 8 : 10,
          paddingTop: 18,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: palette.line2,
          backgroundColor: palette.panel,
          gap: 10,
        }}
      >
        <BlockToolbar
          actions={editActions}
          palette={palette}
          compact={compact}
          visible={!stickyToolbarHidden}
          style={{
            position: "absolute",
            top: -16,
            right: compact ? 6 : 8,
          }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            style={{
              color: palette.muted,
              fontFamily: MONO_FONT,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            - **
          </Text>
          <Input
            ref={primaryInputRef}
            value={editing.value}
            onChangeText={(value) => onChange({ ...editing, value })}
            placeholder="Item name"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Item name"
            style={{
              flex: 1,
              height: 40,
              borderRadius: 8,
              borderColor: palette.line,
              backgroundColor: palette.bg,
              color: palette.text,
              fontSize: 14,
            }}
          />
          {!compact ? (
            <Text
              style={{
                color: palette.muted,
                fontFamily: MONO_FONT,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              **
            </Text>
          ) : null}
        </View>

        {/* Owned + newly drafted code blocks */}
        <View style={{ gap: 12 }}>
          {(editing.itemCodes || []).map((code, index) => (
            <View key={code.blockId ?? `new-${index}`} style={{ gap: 6 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text style={{ color: palette.muted, fontSize: 12 }}>
                  {index + 1}
                </Text>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Input
                    value={code.language}
                    onChangeText={(lang) =>
                      updateItemCode(index, {
                        language: lang.replace(/\s+/g, "-"),
                      })
                    }
                    placeholder="language"
                    placeholderTextColor={palette.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={`Code ${index + 1} language`}
                    style={{
                      width: compact ? 92 : 104,
                      height: 32,
                      paddingHorizontal: 8,
                      paddingVertical: 0,
                      borderRadius: 7,
                      borderColor: palette.line,
                      backgroundColor: palette.panel2,
                      color: palette.text,
                      fontFamily: MONO_FONT,
                      fontSize: 11,
                      fontWeight: "600",
                    }}
                  />
                  {!code.blockId ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      accessibilityLabel={`Remove code block ${index + 1}`}
                      onPress={() => removeNewItemCodeDraft(index)}
                      style={{ width: 34, height: 34, borderRadius: 8 }}
                    >
                      <Trash2
                        size={15}
                        strokeWidth={1.8}
                        color={palette.muted}
                      />
                    </Button>
                  ) : null}
                </View>
              </View>

              <Textarea
                ref={(el) => {
                  codeDraftRefs.current[index] = el;
                }}
                value={code.value}
                onChangeText={(value) => updateItemCode(index, { value })}
                placeholder="code"
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                style={{
                  minHeight: compact ? 120 : 140,
                  borderRadius: 9,
                  borderColor: palette.line,
                  backgroundColor: palette.bg,
                  color: palette.text,
                  fontFamily: MONO_FONT,
                  fontSize: compact ? 12 : 13,
                  lineHeight: 20,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                }}
              />
            </View>
          ))}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add code block"
            onPress={addItemCodeDraft}
            style={(state: { pressed: boolean; hovered?: boolean }) => ({
              alignSelf: "flex-start",
              width: 40,
              height: 40,
              borderRadius: 8,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: palette.line2,
              backgroundColor:
                state.pressed || state.hovered ? palette.hover : palette.panel,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Plus size={16} strokeWidth={1.8} color={palette.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  // Heading editor
  const level = Math.max(1, Math.min(6, editing.level || 1));
  return (
    <View
      ref={onRegisterNode}
      style={{
        position: "relative",
        marginVertical: 10,
        padding: compact ? 8 : 10,
        paddingTop: 18,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: palette.line2,
        backgroundColor: palette.panel,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <BlockToolbar
        actions={editActions}
        palette={palette}
        compact={compact}
        style={{
          position: "absolute",
          top: -16,
          right: compact ? 6 : 8,
        }}
      />

      <Text
        style={{
          color: palette.muted,
          fontFamily: MONO_FONT,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {"#".repeat(level)}
      </Text>
      <Input
        ref={primaryInputRef}
        value={editing.value}
        onChangeText={(value) => onChange({ ...editing, value })}
        placeholder="Branch heading"
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Heading title"
        style={{
          flex: 1,
          height: 40,
          borderRadius: 8,
          borderColor: palette.line,
          backgroundColor: palette.bg,
          color: palette.text,
          fontSize: 15,
          fontWeight: "600",
        }}
      />
    </View>
  );
}
