import {
  Check,
  Code2,
  Copy,
  GitBranch,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react-native";
import React from "react";
import { Platform, Pressable, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Text } from "@/components/ui/text";
import { MONO_FONT, type SecretsKeepPalette } from "@/lib/theme";

export type ToolbarIconKind =
  | "edit"
  | "branch"
  | "plus"
  | "code"
  | "copy"
  | "move"
  | "save"
  | "cancel"
  | "trash";

const ICON_MAP = {
  edit: Pencil,
  branch: GitBranch,
  plus: Plus,
  code: Code2,
  copy: Copy,
  move: GripVertical,
  save: Check,
  cancel: X,
  trash: Trash2,
} as const;

export type ToolbarActionDescriptor = {
  key: string;
  icon: ToolbarIconKind;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  dragBlockId?: string;
};

export type DragCallbacks = {
  onDragStart: (blockId: string, absX: number, absY: number) => void;
  onDragMove: (blockId: string, absX: number, absY: number) => void;
  onDragEnd: (blockId: string, absX: number, absY: number) => void;
  onDragCancel: (blockId: string) => void;
};

function MoveHandleButton({
  blockId,
  label,
  palette,
  compact,
  active,
  dragCallbacks,
}: {
  blockId: string;
  label: string;
  palette: SecretsKeepPalette;
  compact: boolean;
  active: boolean;
  dragCallbacks: DragCallbacks;
}) {
  const size = compact ? 34 : 30;
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(Platform.OS === "web" ? 90 : 180)
    .onStart((e) => {
      dragCallbacks.onDragStart(blockId, e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      dragCallbacks.onDragMove(blockId, e.absoluteX, e.absoluteY);
    })
    .onEnd((e) => {
      dragCallbacks.onDragEnd(blockId, e.absoluteX, e.absoluteY);
    })
    .onFinalize((_e, success) => {
      if (!success) {
        dragCallbacks.onDragCancel(blockId);
      }
    });

  return (
    <GestureDetector gesture={pan}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={(state: { pressed: boolean; hovered?: boolean }) => ({
          width: size,
          height: size,
          borderRadius: 7,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: state.hovered || active ? palette.line2 : "transparent",
          backgroundColor:
            state.pressed || state.hovered || active
              ? palette.actionHover
              : "transparent",
        })}
      >
        <GripVertical
          size={compact ? 16 : 15}
          strokeWidth={1.8}
          color={active ? palette.strong : palette.muted}
        />
      </Pressable>
    </GestureDetector>
  );
}

export function BlockToolbar({
  actions,
  languageBadge,
  palette,
  compact = false,
  visible = true,
  activeDragId,
  dragCallbacks,
  style,
}: {
  actions: ToolbarActionDescriptor[];
  languageBadge?: string;
  palette: SecretsKeepPalette;
  compact?: boolean;
  visible?: boolean;
  activeDragId?: string | null;
  dragCallbacks?: DragCallbacks;
  style?: ViewStyle;
}) {
  const size = compact ? 34 : 30;

  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          padding: 3,
          borderRadius: 9,
          borderWidth: 1,
          borderColor: palette.line,
          backgroundColor: palette.actionBg,
          opacity: visible ? 1 : 0,
          zIndex: 15,
        },
        style,
      ]}
    >
      {languageBadge ? (
        <View
          style={{
            height: size - 2,
            justifyContent: "center",
            paddingHorizontal: 7,
            borderRightWidth: 1,
            borderRightColor: palette.line,
            maxWidth: 120,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: palette.muted,
              fontFamily: MONO_FONT,
              fontSize: 10,
              fontWeight: "600",
            }}
          >
            {languageBadge}
          </Text>
        </View>
      ) : null}

      {actions.map((action) => {
        if (action.dragBlockId && dragCallbacks) {
          return (
            <MoveHandleButton
              key={action.key}
              blockId={action.dragBlockId}
              label={action.label}
              palette={palette}
              compact={compact}
              active={activeDragId === action.dragBlockId}
              dragCallbacks={dragCallbacks}
            />
          );
        }

        const IconComponent = ICON_MAP[action.icon];
        return (
          <Pressable
            key={action.key}
            disabled={action.disabled}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={(e) => {
              e.stopPropagation?.();
              action.onPress?.();
            }}
            style={(state: { pressed: boolean; hovered?: boolean }) => ({
              width: size,
              height: size,
              borderRadius: 7,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: state.hovered ? palette.line2 : "transparent",
              backgroundColor:
                state.pressed || state.hovered
                  ? palette.actionHover
                  : "transparent",
              opacity: action.disabled ? 0.5 : 1,
            })}
          >
            <IconComponent
              size={compact ? 16 : 15}
              strokeWidth={1.8}
              color={palette.muted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
