import { useRouter } from "expo-router";
import {
  ChevronLeft,
  FileText,
  Folder,
  LogOut,
  Monitor,
  Moon,
  Search,
  Sun,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { logout } from "@/lib/auth";
import { FOLDER_MIME } from "@/lib/config";
import {
  buildVisibleFolderListing,
  clearAllDriveCaches,
  getEntry,
  type DriveEntry,
} from "@/lib/drive";
import { queryClient, useFolderListingQuery } from "@/lib/queries";
import { useAppStore } from "@/lib/store";
import type { ThemeMode } from "@/lib/theme";
import { usePalette } from "@/lib/use-palette";
import { entryRoute, stripMarkdownExtension } from "@/lib/utils";

export function FolderScreen({ folderId }: { folderId?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width <= 420;
  const searchInputRef = useRef<TextInput>(null);

  const rootFolderId = useAppStore((s) => s.rootFolderId);
  const demoMode = useAppStore((s) => s.demoMode);
  const resetSessionUi = useAppStore((s) => s.resetSessionUi);
  const showToast = useAppStore((s) => s.showToast);
  const { palette, themeMode, setThemeMode } = usePalette();

  const resolvedFolderId = folderId || rootFolderId;
  const isRoot = !folderId || folderId === rootFolderId;

  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const folderQuery = useFolderListingQuery({
    folderId: resolvedFolderId,
    rootFolderId,
    demo: demoMode,
    enabled: Boolean(resolvedFolderId && rootFolderId),
  });

  useEffect(() => {
    setSearchOpen(false);
    setFilter("");
  }, [resolvedFolderId]);

  useEffect(() => {
    if (folderQuery.data && !folderQuery.data.insideSecrets) {
      router.replace((demoMode ? "/?demo=1" : "/") as never);
    }
  }, [folderQuery.data, demoMode, router]);

  useEffect(() => {
    if (folderQuery.isError && !isRoot) {
      showToast("Open failed");
      router.replace((demoMode ? "/?demo=1" : "/") as never);
    }
  }, [folderQuery.isError, isRoot, demoMode, router, showToast]);

  const navigateBack = useCallback(async () => {
    if (isRoot) return;
    const parentId = folderQuery.data?.folder.parents?.[0];
    if (!parentId || parentId === rootFolderId) {
      router.push((demoMode ? "/?demo=1" : "/") as never);
      return;
    }
    try {
      const parent = await getEntry(parentId, demoMode);
      router.push(entryRoute(parent, rootFolderId, demoMode) as never);
    } catch {
      router.push((demoMode ? "/?demo=1" : "/") as never);
    }
  }, [isRoot, folderQuery.data?.folder.parents, rootFolderId, demoMode, router]);

  useEffect(() => {
    if (Platform.OS === "web") {
      const onKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.matches?.("input,textarea,[contenteditable=true]")) return;
        if (event.key === "/") {
          event.preventDefault();
          setSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 20);
        }
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }

    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (searchOpen) {
        setSearchOpen(false);
        setFilter("");
        return true;
      }
      if (!isRoot) {
        void navigateBack();
        return true;
      }
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, [isRoot, navigateBack, searchOpen]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error", error);
    }
    await clearAllDriveCaches();
    queryClient.clear();
    resetSessionUi();
    router.replace("/");
  };

  const handleRefresh = async () => {
    if (!resolvedFolderId) return;
    setRefreshing(true);
    try {
      const fresh = await buildVisibleFolderListing(resolvedFolderId, demoMode);
      queryClient.setQueryData(
        ["folder", demoMode ? "demo" : "drive", resolvedFolderId],
        {
          folder: folderQuery.data?.folder ?? {
            id: resolvedFolderId,
            name: isRoot ? "secrets" : "",
            mimeType: FOLDER_MIME,
          },
          entries: fresh,
          insideSecrets: true,
        },
      );
    } catch (error) {
      console.error("Manual folder refresh failed", error);
      showToast("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const toggleSearch = () => {
    const next = !searchOpen;
    setSearchOpen(next);
    if (!next) {
      setFilter("");
    } else {
      setTimeout(() => searchInputRef.current?.focus(), 30);
    }
  };

  const entries = folderQuery.data?.entries ?? [];
  const filteredEntries = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(needle));
  }, [entries, filter]);

  const folderTitle = isRoot
    ? "Secrets Keep"
    : folderQuery.data?.folder.name || "Folder";

  const openEntry = (entry: DriveEntry) => {
    router.push(entryRoute(entry, rootFolderId, demoMode) as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* Sticky Folder Topbar */}
      <View
        style={{
          paddingTop: Math.max(10, insets.top),
          backgroundColor: palette.topbar,
          zIndex: 10,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 760,
            alignSelf: "center",
            paddingHorizontal: compact ? 8 : 14,
          }}
        >
          <View
            style={{
              minHeight: 52,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            {!isRoot ? (
              <Button
                variant="ghost"
                size="icon"
                accessibilityLabel="Back"
                onPress={() => void navigateBack()}
                style={{ width: 40, height: 40, borderRadius: 10 }}
              >
                <ChevronLeft size={19} strokeWidth={1.9} color={palette.text} />
              </Button>
            ) : !compact ? (
              <View style={{ width: 40, height: 40 }} />
            ) : null}

            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: palette.strong,
                fontSize: 14,
                fontWeight: "600",
                textAlign: isRoot && compact ? "left" : "center",
                paddingLeft: isRoot && compact ? 4 : 0,
              }}
            >
              {folderTitle}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: compact ? 2 : 4,
              }}
            >
              <Button
                variant="ghost"
                size="icon"
                accessibilityLabel="Search"
                accessibilityState={{ expanded: searchOpen }}
                onPress={toggleSearch}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: searchOpen ? palette.hover : "transparent",
                }}
              >
                <Search size={17} strokeWidth={1.8} color={palette.text} />
              </Button>

              {isRoot ? (
                <>
                  <ToggleGroup
                    type="single"
                    value={themeMode}
                    onValueChange={(value) => {
                      if (
                        value === "system" ||
                        value === "light" ||
                        value === "dark"
                      ) {
                        setThemeMode(value as ThemeMode);
                      }
                    }}
                    accessibilityLabel="Theme"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: compact ? 1 : 2,
                      padding: 2,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: palette.line,
                      backgroundColor: palette.panel,
                    }}
                  >
                    {(
                      [
                        { mode: "system", label: "System theme", IconComp: Monitor },
                        { mode: "light", label: "Light theme", IconComp: Sun },
                        { mode: "dark", label: "Dark theme", IconComp: Moon },
                      ] as const
                    ).map(({ mode, label, IconComp }) => {
                      const active = themeMode === mode;
                      return (
                        <ToggleGroupItem
                          key={mode}
                          value={mode}
                          accessibilityLabel={label}
                          className="px-0"
                          style={{
                            width: compact ? 30 : 32,
                            height: 32,
                            minWidth: compact ? 30 : 32,
                            borderRadius: 7,
                            backgroundColor: active
                              ? palette.strong
                              : "transparent",
                          }}
                        >
                          <IconComp
                            size={15}
                            strokeWidth={1.8}
                            color={active ? palette.inverse : palette.muted}
                          />
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>

                  <Button
                    variant="ghost"
                    size="icon"
                    accessibilityLabel="Logout"
                    onPress={() => void handleLogout()}
                    style={{ width: 38, height: 38, borderRadius: 10 }}
                  >
                    <LogOut size={17} strokeWidth={1.8} color={palette.text} />
                  </Button>
                </>
              ) : null}
            </View>
          </View>

          {searchOpen ? (
            <View style={{ position: "relative", marginBottom: 10 }}>
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 12,
                  top: 0,
                  bottom: 0,
                  zIndex: 2,
                  justifyContent: "center",
                }}
              >
                <Search size={16} strokeWidth={1.8} color={palette.muted} />
              </View>
              <Input
                ref={searchInputRef}
                value={filter}
                onChangeText={setFilter}
                placeholder="Search files…"
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search"
                onKeyPress={(event) => {
                  if (event.nativeEvent.key === "Escape") {
                    setSearchOpen(false);
                    setFilter("");
                  }
                }}
                style={{
                  height: 42,
                  paddingLeft: 36,
                  paddingRight: 12,
                  borderRadius: 11,
                  borderColor: palette.line,
                  backgroundColor: palette.panel,
                  color: palette.text,
                  fontSize: 14,
                }}
              />
            </View>
          ) : null}
        </View>
      </View>

      {/* Main Folder Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
          paddingHorizontal: compact ? 8 : 14,
          paddingTop: 6,
          paddingBottom: Math.max(80, insets.bottom + 32),
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={palette.muted}
          />
        }
      >
        {folderQuery.isLoading && !entries.length ? (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: palette.line,
              backgroundColor: palette.panel,
              overflow: "hidden",
            }}
          >
            {[0, 1, 2].map((idx) => (
              <View
                key={idx}
                style={{
                  height: compact ? 60 : 54,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 11,
                  paddingHorizontal: 14,
                  borderBottomWidth: idx < 2 ? 1 : 0,
                  borderBottomColor: palette.line,
                }}
              >
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-40 rounded" />
              </View>
            ))}
          </View>
        ) : filteredEntries.length > 0 ? (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: palette.line,
              backgroundColor: palette.panel,
              overflow: "hidden",
            }}
          >
            {filteredEntries.map((entry, idx) => {
              const isFolder = entry.mimeType === FOLDER_MIME;
              const isLast = idx === filteredEntries.length - 1;
              return (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  onPress={() => openEntry(entry)}
                  style={(state: { pressed: boolean; hovered?: boolean }) => ({
                    minHeight: compact ? 60 : 54,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 11,
                    paddingHorizontal: compact ? 12 : 14,
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: palette.line,
                    backgroundColor: state.pressed
                      ? palette.actionHover
                      : state.hovered
                        ? palette.hover
                        : "transparent",
                  })}
                >
                  {isFolder ? (
                    <Folder size={18} strokeWidth={1.8} color={palette.muted} />
                  ) : (
                    <FileText size={18} strokeWidth={1.8} color={palette.muted} />
                  )}
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      color: palette.text,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {isFolder ? entry.name : stripMarkdownExtension(entry.name)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: palette.line,
              backgroundColor: palette.panel,
              paddingVertical: 28,
              paddingHorizontal: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ color: palette.muted, fontSize: 13 }}>
              {filter.trim() ? "No matching files" : "No Markdown files"}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
