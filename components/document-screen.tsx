import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  Code2,
  GitBranch,
  Menu,
  Plus,
  Search,
  X,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { BlockEditor } from "@/components/block-editor";
import {
  BlockToolbar,
  type DragCallbacks,
  type ToolbarActionDescriptor,
} from "@/components/block-toolbar";
import {
  DocumentNodeView,
  type BlockActionType,
  type DropIndicator,
} from "@/components/document-blocks";
import { FileSidebar } from "@/components/file-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import {
  cacheFileContent,
  getEntry,
  queueFileSave,
  readFileContent,
  setSyncedContent,
} from "@/lib/drive";
import {
  blockMoveRange,
  buildDocumentTree,
  createEditStateForBlock,
  deleteWithOwnedContent,
  dragLabel,
  formatMarkdown,
  matchDocumentSections,
  moveBlockSource,
  parseMarkdownBlocks,
  selectStickyToolbarCandidate,
  sourceWithEdit,
  type EditState,
  type MarkdownBlock,
} from "@/lib/markdown-blocks";
import { queryClient, useFileDocumentQuery } from "@/lib/queries";
import { useAppStore } from "@/lib/store";
import { usePalette } from "@/lib/use-palette";
import { entryRoute, stripMarkdownExtension } from "@/lib/utils";

type MeasuredRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RegisteredNodeEntry = {
  ref: View | null;
  depth: number;
  block?: MarkdownBlock;
  isItemEditor?: boolean;
  actions: ToolbarActionDescriptor[];
  languageBadge?: string;
};

export function DocumentScreen({ fileId }: { fileId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const desktop = width > 800;
  const compact = width <= 480;
  const drawerWidth = Math.min(Math.round(width * 0.82), 300);

  const rootFolderId = useAppStore((s) => s.rootFolderId);
  const demoMode = useAppStore((s) => s.demoMode);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const activeBlockId = useAppStore((s) => s.activeBlockId);
  const setActiveBlockId = useAppStore((s) => s.setActiveBlockId);
  const showToast = useAppStore((s) => s.showToast);
  const { palette, isDark } = usePalette();

  const fileQuery = useFileDocumentQuery({
    fileId,
    rootFolderId,
    demo: demoMode,
    enabled: Boolean(fileId && rootFolderId),
  });

  const [editing, setEditing] = useState<EditState | null>(null);
  const editingRef = useRef<EditState | null>(null);
  editingRef.current = editing;

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Sticky floating toolbar state
  const [stickyToolbar, setStickyToolbar] = useState<{
    id: string;
    top: number;
    right: number;
  } | null>(null);

  // Drag & drop state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator>(null);
  const dropIndicatorRef = useRef<DropIndicator>(null);
  dropIndicatorRef.current = dropIndicator;

  const searchInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const headerRef = useRef<View>(null);
  const shellRef = useRef<View>(null);
  const scrollOffsetRef = useRef(0);
  const registryRef = useRef(new Map<string, RegisteredNodeEntry>());
  const dragRectsRef = useRef(new Map<string, MeasuredRect>());

  useEffect(() => {
    setEditing(null);
    setSearchOpen(false);
    setSearchQuery("");
    setActiveMatchIndex(0);
    setStickyToolbar(null);
    setActiveBlockId(null);
  }, [fileId, setActiveBlockId]);

  useEffect(() => {
    if (fileQuery.data && !fileQuery.data.insideSecrets) {
      router.replace((demoMode ? "/?demo=1" : "/") as never);
    }
  }, [fileQuery.data, demoMode, router]);

  useEffect(() => {
    if (fileQuery.isError) {
      showToast("Open failed");
      router.replace((demoMode ? "/?demo=1" : "/") as never);
    }
  }, [fileQuery.isError, demoMode, router, showToast]);

  const currentEntry = fileQuery.data?.entry ?? null;
  const currentContent = fileQuery.data?.content ?? "";

  const tree = useMemo(
    () => buildDocumentTree(currentContent),
    [currentContent],
  );

  const searchState = useMemo(() => {
    if (!searchOpen || !searchQuery.trim()) {
      return {
        active: false,
        matchedIds: [] as string[],
        matchedSet: new Set<string>(),
        visibleIds: new Set<string>(),
      };
    }
    const result = matchDocumentSections(
      tree,
      searchQuery,
      editing?.parentBlockId || editing?.blockId,
    );
    return {
      active: true,
      matchedIds: result.matchedIds,
      matchedSet: new Set(result.matchedIds),
      visibleIds: result.visibleBlockIds,
    };
  }, [searchOpen, searchQuery, tree, editing?.parentBlockId, editing?.blockId]);

  const currentMatchId = searchState.matchedIds.length
    ? searchState.matchedIds[
        ((activeMatchIndex % searchState.matchedIds.length) +
          searchState.matchedIds.length) %
          searchState.matchedIds.length
      ]
    : null;

  const navigateBack = useCallback(async () => {
    setEditing(null);
    const parentId = currentEntry?.parents?.[0];
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
  }, [currentEntry?.parents, rootFolderId, demoMode, router]);

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
      if (sidebarOpen) {
        setSidebarOpen(false);
        return true;
      }
      if (searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
        return true;
      }
      if (editingRef.current) {
        setEditing(null);
        return true;
      }
      void navigateBack();
      return true;
    });
    return () => sub.remove();
  }, [sidebarOpen, setSidebarOpen, searchOpen, navigateBack]);

  const persistContent = useCallback(
    async (rawSource: string) => {
      if (!currentEntry) return;
      const formatted = await formatMarkdown(rawSource);

      queryClient.setQueryData(
        ["file", demoMode ? "demo" : "drive", currentEntry.id],
        {
          entry: currentEntry,
          content: formatted,
          insideSecrets: true,
        },
      );
      await cacheFileContent(currentEntry.id, formatted);
      setEditing(null);

      queueFileSave({
        fileId: currentEntry.id,
        content: formatted,
        demo: demoMode,
        onRollback: (rollback) => {
          queryClient.setQueryData(
            ["file", demoMode ? "demo" : "drive", currentEntry.id],
            {
              entry: currentEntry,
              content: rollback,
              insideSecrets: true,
            },
          );
          setEditing(null);
          showToast("Save failed — reverted");
        },
      });
    },
    [currentEntry, demoMode, showToast],
  );

  const handleSaveEditing = useCallback(async () => {
    const draft = editingRef.current;
    if (!draft) return;
    try {
      const updated = sourceWithEdit(currentContent, draft);
      await persistContent(updated);
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save");
    }
  }, [currentContent, persistContent, showToast]);

  const handleDeleteEditing = useCallback(async () => {
    const draft = editingRef.current;
    if (!draft) return;
    if (draft.mode === "new") {
      setEditing(null);
      return;
    }
    const blocks = parseMarkdownBlocks(currentContent);
    const target = blocks.find((item) => item.id === draft.blockId);
    if (!target) {
      setEditing(null);
      return;
    }
    try {
      const updated = deleteWithOwnedContent(currentContent, target, blocks);
      await persistContent(updated);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete");
    }
  }, [currentContent, persistContent, showToast]);

  const handleBlockAction = useCallback(
    (action: BlockActionType, block: MarkdownBlock) => {
      if (action === "copy") {
        void Clipboard.setStringAsync(block.value || "").then(() => {
          if (Platform.OS !== "web") {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {},
            );
          }
          showToast("Copied");
        });
        return;
      }

      const blocks = parseMarkdownBlocks(currentContent);

      if (action === "edit") {
        setEditing(createEditStateForBlock(currentContent, block));
        return;
      }

      if (action === "child-branch" && block.type === "heading") {
        const range = blockMoveRange(block, blocks, currentContent.length);
        setEditing({
          mode: "new",
          type: "heading",
          insertAt: range.end,
          level: Math.min(6, (block.level || 1) + 1),
          indent: "",
          parentBlockId: block.id,
          value: "",
          language: "",
        });
        return;
      }

      if (action === "add-item" && block.type === "heading") {
        const range = blockMoveRange(block, blocks, currentContent.length);
        setEditing({
          mode: "new",
          type: "item",
          insertAt: range.end,
          indent: "",
          parentBlockId: block.id,
          value: "",
          language: "",
          itemCodes: [],
        });
        return;
      }

      if (action === "add-code" && block.type === "heading") {
        const range = blockMoveRange(block, blocks, currentContent.length);
        setEditing({
          mode: "new",
          type: "code",
          insertAt: range.end,
          indent: "",
          parentBlockId: block.id,
          value: "",
          language: "",
        });
        return;
      }

      if (action === "item-code" && block.type === "item") {
        const range = blockMoveRange(block, blocks, currentContent.length);
        setEditing({
          mode: "new",
          type: "code",
          insertAt: range.end,
          parentIndent: block.indent || "",
          parentBlockId: block.id,
          indent: (block.indent || "") + "  ",
          value: "",
          language: "",
        });
      }
    },
    [currentContent, showToast],
  );

  const startTopLevelBlock = (type: "heading" | "item" | "code") => {
    setEditing({
      mode: "new",
      type,
      insertAt: currentContent.length,
      level: type === "heading" ? 1 : undefined,
      indent: "",
      value: "",
      language: "",
      itemCodes: type === "item" ? [] : undefined,
    });
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 80);
  };

  const registerBlockNode = useCallback(
    (id: string, meta: RegisteredNodeEntry | null) => {
      if (!meta || !meta.ref) {
        registryRef.current.delete(id);
      } else {
        registryRef.current.set(id, meta);
      }
    },
    [],
  );

  // Measure registered blocks for sticky toolbar & drag drop
  const evaluateStickyToolbar = useCallback(() => {
    if (activeDragId || !shellRef.current || !headerRef.current) {
      setStickyToolbar(null);
      return;
    }

    shellRef.current.measureInWindow((shellX, shellY, shellW, shellH) => {
      headerRef.current?.measureInWindow((_hx, hy, _hw, hh) => {
        const entries = [...registryRef.current.entries()];
        if (!entries.length) {
          setStickyToolbar(null);
          return;
        }

        const measured: {
          id: string;
          top: number;
          bottom: number;
          right: number;
          height: number;
          toolbarHeight: number;
          depth: number;
          isItemEditor: boolean;
          searchHidden?: boolean;
        }[] = [];

        let pending = entries.length;
        for (const [id, entry] of entries) {
          if (!entry.ref) {
            pending -= 1;
            continue;
          }
          entry.ref.measureInWindow((bx, by, bw, bh) => {
            measured.push({
              id,
              top: by - shellY,
              bottom: by - shellY + bh,
              right: bx - shellX + bw,
              height: bh,
              toolbarHeight: 36,
              depth: entry.depth,
              isItemEditor: Boolean(entry.isItemEditor),
              searchHidden:
                searchState.active &&
                !entry.isItemEditor &&
                !searchState.visibleIds.has(id),
            });
            pending -= 1;
            if (pending <= 0) {
              const chosen = selectStickyToolbarCandidate({
                candidates: measured,
                headerBottom: hy - shellY + hh,
                viewportHeight: shellH || height,
                viewportWidth: shellW || width,
                coarsePointer: compact,
                dragging: false,
              });
              setStickyToolbar(chosen);
            }
          });
        }
      });
    });
  }, [activeDragId, compact, height, searchState.active, searchState.visibleIds, width]);

  const snapshotAllBlockRects = useCallback(() => {
    const map = new Map<string, MeasuredRect>();
    for (const [id, entry] of registryRef.current.entries()) {
      if (!entry.ref || entry.isItemEditor) continue;
      entry.ref.measureInWindow((x, y, w, h) => {
        if (w > 2 && h > 2) {
          map.set(id, { x, y, width: w, height: h });
        }
      });
    }
    dragRectsRef.current = map;
  }, []);

  const resolveDropAtPoint = useCallback(
    (sourceId: string, px: number, py: number): DropIndicator => {
      const blocks = parseMarkdownBlocks(currentContent);
      const source = blocks.find((b) => b.id === sourceId);
      if (!source) return null;

      const sourceRange = blockMoveRange(source, blocks, currentContent.length);
      const byId = new Map(blocks.map((b) => [b.id, b]));
      const isAllowed = (block: MarkdownBlock) =>
        block.id !== sourceId &&
        !(block.start >= sourceRange.start && block.start < sourceRange.end);

      const hits: {
        id: string;
        block: MarkdownBlock;
        rect: MeasuredRect;
        depth: number;
        area: number;
      }[] = [];

      for (const [id, rect] of dragRectsRef.current.entries()) {
        const block = byId.get(id);
        const reg = registryRef.current.get(id);
        if (!block || !reg || !isAllowed(block)) continue;
        if (
          px >= rect.x &&
          px <= rect.x + rect.width &&
          py >= rect.y &&
          py <= rect.y + rect.height
        ) {
          hits.push({
            id,
            block,
            rect,
            depth: reg.depth,
            area: rect.width * rect.height,
          });
        }
      }

      hits.sort((a, b) => b.depth - a.depth || a.area - b.area);
      const direct = hits[0];

      if (direct) {
        const edgeBand = Math.min(compact ? 30 : 22, Math.max(10, direct.rect.height * 0.25));
        if (py <= direct.rect.y + edgeBand) {
          return { targetId: direct.id, mode: "before" };
        }
        if (py >= direct.rect.y + direct.rect.height - edgeBand) {
          return { targetId: direct.id, mode: "after" };
        }
        if (
          direct.block.type === "heading" ||
          (direct.block.type === "item" &&
            (source.type === "code" || source.type === "other"))
        ) {
          return { targetId: direct.id, mode: "inside" };
        }
        return {
          targetId: direct.id,
          mode: py < direct.rect.y + direct.rect.height / 2 ? "before" : "after",
        };
      }

      // Snap to nearest allowed root block if dragged above/below document bounds
      const rootRects = [...dragRectsRef.current.entries()]
        .map(([id, rect]) => {
          const block = byId.get(id);
          const reg = registryRef.current.get(id);
          if (!block || !reg || reg.depth !== 0 || !isAllowed(block)) return null;
          return { id, rect };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => a.rect.y - b.rect.y);

      if (rootRects.length) {
        const first = rootRects[0];
        const last = rootRects[rootRects.length - 1];
        if (py < first.rect.y) return { targetId: first.id, mode: "before" };
        if (py > last.rect.y + last.rect.height) {
          return { targetId: last.id, mode: "after" };
        }
      }

      return null;
    },
    [compact, currentContent],
  );

  const dragCallbacks = useMemo<DragCallbacks>(
    () => ({
      onDragStart: (blockId, absX, absY) => {
        if (editingRef.current) return;
        snapshotAllBlockRects();
        setActiveDragId(blockId);
        setStickyToolbar(null);
        setGhostPos({ x: absX, y: absY });
        if (Platform.OS !== "web") {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
            () => {},
          );
        }
      },
      onDragMove: (blockId, absX, absY) => {
        setGhostPos({ x: absX, y: absY });
        setDropIndicator(resolveDropAtPoint(blockId, absX, absY));

        const edge = 72;
        if (absY < edge) {
          scrollOffsetRef.current = Math.max(0, scrollOffsetRef.current - 16);
          scrollViewRef.current?.scrollTo({
            y: scrollOffsetRef.current,
            animated: false,
          });
          snapshotAllBlockRects();
        } else if (absY > height - edge) {
          scrollOffsetRef.current += 16;
          scrollViewRef.current?.scrollTo({
            y: scrollOffsetRef.current,
            animated: false,
          });
          snapshotAllBlockRects();
        }
      },
      onDragEnd: (blockId) => {
        const target = dropIndicatorRef.current;
        setActiveDragId(null);
        setGhostPos(null);
        setDropIndicator(null);
        if (target) {
          const moved = moveBlockSource(
            currentContent,
            blockId,
            target.targetId,
            target.mode,
          );
          if (moved !== null) {
            void persistContent(moved);
          }
        }
      },
      onDragCancel: () => {
        setActiveDragId(null);
        setGhostPos(null);
        setDropIndicator(null);
      },
    }),
    [currentContent, height, persistContent, resolveDropAtPoint, snapshotAllBlockRects],
  );

  const activeDragBlock = useMemo(() => {
    if (!activeDragId) return null;
    return parseMarkdownBlocks(currentContent).find((b) => b.id === activeDragId) ?? null;
  }, [activeDragId, currentContent]);

  const stickyEntry = stickyToolbar
    ? registryRef.current.get(stickyToolbar.id)
    : undefined;

  const stickyActions: ToolbarActionDescriptor[] = useMemo(() => {
    if (!stickyToolbar || !stickyEntry) return [];
    if (stickyToolbar.id === "__item_editor__") {
      return [
        {
          key: "save-edit",
          icon: "save",
          label: "Save",
          onPress: () => void handleSaveEditing(),
        },
        {
          key: "cancel-edit",
          icon: "cancel",
          label: "Cancel",
          onPress: () => setEditing(null),
        },
        {
          key: "delete-edit",
          icon: "trash",
          label: "Delete",
          onPress: () => void handleDeleteEditing(),
        },
      ];
    }
    return stickyEntry.actions;
  }, [stickyToolbar, stickyEntry, handleSaveEditing, handleDeleteEditing]);

  const handleRefreshFile = async () => {
    if (!currentEntry) return;
    setRefreshing(true);
    try {
      const fresh = await readFileContent(currentEntry.id, demoMode);
      setSyncedContent(currentEntry.id, fresh);
      queryClient.setQueryData(
        ["file", demoMode ? "demo" : "drive", currentEntry.id],
        {
          entry: currentEntry,
          content: fresh,
          insideSecrets: true,
        },
      );
    } catch (error) {
      console.error("Manual file refresh failed", error);
      showToast("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: palette.bg }}>
      {desktop ? (
        <FileSidebar
          activeFileId={fileId}
          desktop
          drawerWidth={260}
        />
      ) : null}

      <View
        ref={shellRef}
        style={{ flex: 1, position: "relative", backgroundColor: palette.bg }}
      >
        {/* Sticky Document Topbar */}
        <View
          ref={headerRef}
          style={{
            paddingTop: Math.max(8, insets.top),
            backgroundColor: palette.topbar,
            zIndex: 20,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 860,
              alignSelf: "center",
              paddingHorizontal: compact ? 6 : 14,
            }}
          >
            <View
              style={{
                minHeight: compact ? 50 : 54,
                flexDirection: "row",
                alignItems: "center",
                gap: compact ? 4 : 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {!desktop ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    accessibilityLabel="Files"
                    onPress={() => setSidebarOpen(!sidebarOpen)}
                    style={{
                      width: compact ? 36 : 40,
                      height: 40,
                      borderRadius: 10,
                    }}
                  >
                    <Menu size={18} strokeWidth={1.8} color={palette.text} />
                  </Button>
                ) : null}

                <Button
                  variant="ghost"
                  size="icon"
                  accessibilityLabel="Back"
                  onPress={() => void navigateBack()}
                  style={{
                    width: compact ? 36 : 40,
                    height: 40,
                    borderRadius: 10,
                  }}
                >
                  <ChevronLeft size={19} strokeWidth={1.9} color={palette.text} />
                </Button>
              </View>

              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: palette.strong,
                  fontSize: compact ? 13 : 14,
                  fontWeight: "600",
                  textAlign: compact ? "left" : "center",
                }}
              >
                {currentEntry ? stripMarkdownExtension(currentEntry.name) : ""}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: compact ? 1 : 3,
                }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  accessibilityLabel="Search in file"
                  accessibilityState={{ expanded: searchOpen }}
                  onPress={() => {
                    const next = !searchOpen;
                    setSearchOpen(next);
                    if (!next) {
                      setSearchQuery("");
                      setActiveMatchIndex(0);
                    } else {
                      setTimeout(() => searchInputRef.current?.focus(), 30);
                    }
                  }}
                  style={{
                    width: compact ? 34 : 36,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: searchOpen ? palette.hover : "transparent",
                  }}
                >
                  <Search size={16} strokeWidth={1.8} color={palette.muted} />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  accessibilityLabel="Create branch"
                  onPress={() => startTopLevelBlock("heading")}
                  style={{ width: compact ? 34 : 36, height: 36, borderRadius: 8 }}
                >
                  <GitBranch size={16} strokeWidth={1.8} color={palette.muted} />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  accessibilityLabel="Add item"
                  onPress={() => startTopLevelBlock("item")}
                  style={{ width: compact ? 34 : 36, height: 36, borderRadius: 8 }}
                >
                  <Plus size={17} strokeWidth={1.8} color={palette.muted} />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  accessibilityLabel="Add code block"
                  onPress={() => startTopLevelBlock("code")}
                  style={{ width: compact ? 34 : 36, height: 36, borderRadius: 8 }}
                >
                  <Code2 size={16} strokeWidth={1.8} color={palette.muted} />
                </Button>
              </View>
            </View>

            {searchOpen ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 4,
                  marginBottom: 8,
                }}
              >
                <View style={{ flex: 1, position: "relative" }}>
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
                    <Search size={15} strokeWidth={1.8} color={palette.muted} />
                  </View>
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChangeText={(text) => {
                      setSearchQuery(text);
                      setActiveMatchIndex(0);
                    }}
                    placeholder="Search section titles…"
                    placeholderTextColor={palette.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Search section titles"
                    onSubmitEditing={() =>
                      setActiveMatchIndex((prev) => prev + 1)
                    }
                    onKeyPress={(event) => {
                      if (event.nativeEvent.key === "Escape") {
                        setSearchOpen(false);
                        setSearchQuery("");
                      }
                    }}
                    style={{
                      height: 40,
                      paddingLeft: 36,
                      paddingRight: 12,
                      borderRadius: 10,
                      borderColor: palette.line,
                      backgroundColor: palette.panel,
                      color: palette.text,
                      fontSize: 13.5,
                    }}
                  />
                </View>

                {searchQuery.trim() ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setActiveMatchIndex((prev) => prev + 1)}
                  >
                    <Text style={{ color: palette.muted, fontSize: 12 }}>
                      {searchState.matchedIds.length
                        ? `${
                            (activeMatchIndex % searchState.matchedIds.length) + 1
                          } / ${searchState.matchedIds.length}`
                        : "No matches"}
                    </Text>
                  </Pressable>
                ) : null}

                <Button
                  variant="ghost"
                  size="icon"
                  accessibilityLabel="Close search"
                  onPress={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                    setActiveMatchIndex(0);
                  }}
                  style={{ width: 34, height: 34, borderRadius: 8 }}
                >
                  <X size={16} strokeWidth={1.8} color={palette.muted} />
                </Button>
              </View>
            ) : null}
          </View>
        </View>

        {/* Pinned Sticky Toolbar for Long Blocks */}
        {stickyToolbar && stickyActions.length > 0 ? (
          <BlockToolbar
            actions={stickyActions}
            languageBadge={stickyEntry?.languageBadge}
            palette={palette}
            compact={compact}
            visible
            activeDragId={activeDragId}
            dragCallbacks={dragCallbacks}
            style={{
              position: "absolute",
              top: stickyToolbar.top,
              right: stickyToolbar.right,
              zIndex: 35,
            }}
          />
        ) : null}

        {/* Scrollable Document Body */}
        <ScrollView
          ref={scrollViewRef}
          scrollEnabled={!activeDragId}
          scrollEventThrottle={32}
          onScroll={(e) => {
            scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
            evaluateStickyToolbar();
          }}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{
            width: "100%",
            maxWidth: 740,
            alignSelf: "center",
            paddingHorizontal: compact ? 8 : 14,
            paddingTop: 12,
            paddingBottom: Math.max(96, insets.bottom + 40),
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefreshFile()}
              tintColor={palette.muted}
            />
          }
        >
          <Pressable
            onPress={() => setActiveBlockId(null)}
            style={{ flex: 1, overflow: "visible" }}
          >
            {fileQuery.isLoading && !currentEntry ? (
              <View style={{ gap: 14, paddingTop: 10 }}>
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-36 w-full rounded-xl" />
              </View>
            ) : (
              <>
                {editing?.mode === "new" && editing.insertAt === 0 ? (
                  <BlockEditor
                    editing={editing}
                    onChange={setEditing}
                    onSave={handleSaveEditing}
                    onCancel={() => setEditing(null)}
                    onDelete={handleDeleteEditing}
                    palette={palette}
                    compact={compact}
                    stickyToolbarHidden={
                      stickyToolbar?.id === "__item_editor__"
                    }
                    onRegisterNode={
                      editing.type === "item"
                        ? (ref) =>
                            registerBlockNode("__item_editor__", {
                              ref,
                              depth: 0,
                              isItemEditor: true,
                              actions: [],
                            })
                        : undefined
                    }
                  />
                ) : null}

                {tree.map((node) => (
                  <DocumentNodeView
                    key={node.block.id}
                    node={node}
                    depth={0}
                    editing={editing}
                    onChangeEditing={setEditing}
                    onSaveEditing={handleSaveEditing}
                    onCancelEditing={() => setEditing(null)}
                    onDeleteEditing={handleDeleteEditing}
                    onBlockAction={handleBlockAction}
                    activeBlockId={activeBlockId}
                    onActivateBlock={(id) =>
                      setActiveBlockId(activeBlockId === id ? null : id)
                    }
                    stickyBlockId={stickyToolbar?.id ?? null}
                    activeDragId={activeDragId}
                    dropIndicator={dropIndicator}
                    dragCallbacks={dragCallbacks}
                    registerBlockNode={registerBlockNode}
                    searchActive={searchState.active}
                    visibleSearchIds={searchState.visibleIds}
                    matchedSearchIds={searchState.matchedSet}
                    currentMatchId={currentMatchId}
                    palette={palette}
                    isDark={isDark}
                    compact={compact}
                  />
                ))}

                {editing?.mode === "new" &&
                !editing.parentBlockId &&
                currentContent.length > 0 &&
                editing.insertAt === currentContent.length ? (
                  <BlockEditor
                    editing={editing}
                    onChange={setEditing}
                    onSave={handleSaveEditing}
                    onCancel={() => setEditing(null)}
                    onDelete={handleDeleteEditing}
                    palette={palette}
                    compact={compact}
                    stickyToolbarHidden={
                      stickyToolbar?.id === "__item_editor__"
                    }
                    onRegisterNode={
                      editing.type === "item"
                        ? (ref) =>
                            registerBlockNode("__item_editor__", {
                              ref,
                              depth: 0,
                              isItemEditor: true,
                              actions: [],
                            })
                        : undefined
                    }
                  />
                ) : null}
              </>
            )}
          </Pressable>
        </ScrollView>

        {/* Mobile Drawer Sidebar */}
        {!desktop ? (
          <FileSidebar
            activeFileId={fileId}
            desktop={false}
            drawerWidth={drawerWidth}
          />
        ) : null}

        {/* Floating Drag Ghost Pill */}
        {activeDragBlock && ghostPos ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: Math.min(width - 180, Math.max(8, ghostPos.x - (desktop ? 260 : 0) + 12)),
              top: Math.max(8, ghostPos.y + 12),
              maxWidth: Math.min(280, Math.round(width * 0.7)),
              paddingHorizontal: 11,
              paddingVertical: 8,
              borderRadius: 9,
              borderWidth: 2,
              borderColor: palette.drop,
              backgroundColor: palette.panel,
              zIndex: 999,
              elevation: 12,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: palette.text,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {dragLabel(activeDragBlock)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
