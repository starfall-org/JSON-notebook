import { useRouter } from "expo-router";
import { ChevronRight, FileText, Folder } from "lucide-react-native";
import React, { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { FOLDER_MIME } from "@/lib/config";
import type { DriveEntry } from "@/lib/drive";
import { useSidebarFolderQuery } from "@/lib/queries";
import { useAppStore } from "@/lib/store";
import { usePalette } from "@/lib/use-palette";
import { entryRoute, stripMarkdownExtension } from "@/lib/utils";

function SidebarBranch({
  folderId,
  depth,
  activeFileId,
  onSelectFile,
}: {
  folderId: string;
  depth: number;
  activeFileId: string;
  onSelectFile: (entry: DriveEntry) => void;
}) {
  const demoMode = useAppStore((s) => s.demoMode);
  const sidebarExpanded = useAppStore((s) => s.sidebarExpanded);
  const toggleSidebarFolder = useAppStore((s) => s.toggleSidebarFolder);
  const { palette } = usePalette();

  const query = useSidebarFolderQuery({
    folderId,
    demo: demoMode,
    enabled: Boolean(folderId),
  });

  if (query.isLoading && !query.data) {
    return (
      <View
        style={{
          minHeight: 30,
          justifyContent: "center",
          paddingLeft: 44 + depth * 16,
          paddingRight: 8,
        }}
      >
        <Text style={{ color: palette.muted, fontSize: 11 }}>Loading…</Text>
      </View>
    );
  }

  const entries = query.data ?? [];
  if (!entries.length) {
    return (
      <View
        style={{
          minHeight: 30,
          justifyContent: "center",
          paddingLeft: 44 + depth * 16,
          paddingRight: 8,
        }}
      >
        <Text style={{ color: palette.muted, fontSize: 11 }}>Empty</Text>
      </View>
    );
  }

  return (
    <View>
      {entries.map((entry) => {
        const isFolder = entry.mimeType === FOLDER_MIME;
        if (isFolder) {
          const expanded = Boolean(sidebarExpanded[entry.id]);
          return (
            <View key={entry.id}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => toggleSidebarFolder(entry.id)}
                style={(state: { pressed: boolean; hovered?: boolean }) => ({
                  minHeight: 36,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  paddingRight: 8,
                  paddingLeft: 8 + depth * 16,
                  borderRadius: 7,
                  backgroundColor: state.pressed
                    ? palette.actionHover
                    : state.hovered
                      ? palette.hover
                      : "transparent",
                })}
              >
                <View
                  style={{
                    width: 14,
                    alignItems: "center",
                    transform: [{ rotate: expanded ? "90deg" : "0deg" }],
                  }}
                >
                  <ChevronRight size={13} strokeWidth={1.9} color={palette.muted} />
                </View>
                <Folder size={15} strokeWidth={1.8} color={palette.muted} />
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    color: palette.text,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {entry.name}
                </Text>
              </Pressable>
              {expanded ? (
                <SidebarBranch
                  folderId={entry.id}
                  depth={depth + 1}
                  activeFileId={activeFileId}
                  onSelectFile={onSelectFile}
                />
              ) : null}
            </View>
          );
        }

        const isCurrent = entry.id === activeFileId;
        return (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            onPress={() => onSelectFile(entry)}
            style={(state: { pressed: boolean; hovered?: boolean }) => ({
              minHeight: 36,
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              paddingRight: 8,
              paddingLeft: 8 + depth * 16,
              borderRadius: 7,
              backgroundColor: isCurrent
                ? palette.actionHover
                : state.pressed
                  ? palette.actionHover
                  : state.hovered
                    ? palette.hover
                    : "transparent",
            })}
          >
            <View style={{ width: 14 }} />
            <FileText size={15} strokeWidth={1.8} color={palette.muted} />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: isCurrent ? palette.strong : palette.text,
                fontSize: 12,
                fontWeight: isCurrent ? "700" : "600",
              }}
            >
              {stripMarkdownExtension(entry.name)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FileSidebar({
  activeFileId,
  desktop,
  drawerWidth,
}: {
  activeFileId: string;
  desktop: boolean;
  drawerWidth: number;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rootFolderId = useAppStore((s) => s.rootFolderId);
  const demoMode = useAppStore((s) => s.demoMode);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const { palette } = usePalette();

  const progress = useSharedValue(sidebarOpen ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(sidebarOpen ? 1 : 0, { duration: 180 });
  }, [sidebarOpen, progress]);

  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * (drawerWidth + 16) }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const handleSelectFile = (entry: DriveEntry) => {
    setSidebarOpen(false);
    if (entry.id === activeFileId) return;
    router.push(entryRoute(entry, rootFolderId, demoMode) as never);
  };

  const content = (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.panel,
        borderRightWidth: 1,
        borderRightColor: palette.line,
        paddingTop: Math.max(10, insets.top),
        paddingBottom: Math.max(14, insets.bottom),
        paddingHorizontal: 8,
      }}
    >
      <View
        style={{
          minHeight: 42,
          justifyContent: "center",
          paddingHorizontal: 10,
        }}
      >
        <Text
          style={{
            color: palette.strong,
            fontSize: 13,
            fontWeight: "700",
          }}
        >
          Secrets Keep
        </Text>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 4 }}
        showsVerticalScrollIndicator={false}
      >
        {rootFolderId ? (
          <SidebarBranch
            folderId={rootFolderId}
            depth={0}
            activeFileId={activeFileId}
            onSelectFile={handleSelectFile}
          />
        ) : null}
      </ScrollView>
    </View>
  );

  if (desktop) {
    return <View style={{ width: 260, flexShrink: 0 }}>{content}</View>;
  }

  return (
    <View
      pointerEvents={sidebarOpen ? "auto" : "none"}
      style={StyleSheet.absoluteFill}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: palette.backdrop, zIndex: 39 },
          backdropAnimatedStyle,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sidebar"
          onPress={() => setSidebarOpen(false)}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: drawerWidth,
            zIndex: 40,
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 24,
            shadowOffset: { width: 8, height: 0 },
            elevation: 16,
          },
          drawerAnimatedStyle,
        ]}
      >
        {content}
      </Animated.View>
    </View>
  );
}
