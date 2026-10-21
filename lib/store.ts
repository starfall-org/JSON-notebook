import { create } from "zustand";
import { THEME_KEY } from "@/lib/config";
import { readStringItem, writeStringItem } from "@/lib/storage";
import type { ThemeMode } from "@/lib/theme";

export type AuthStatus = "booting" | "authenticated" | "unauthenticated";

type AppStore = {
  authStatus: AuthStatus;
  demoMode: boolean;
  rootFolderId: string;
  themeMode: ThemeMode;
  sidebarOpen: boolean;
  sidebarExpanded: Record<string, boolean>;
  activeBlockId: string | null;
  toastMessage: string | null;
  toastKey: number;

  setAuthReady: (params: {
    authenticated: boolean;
    demoMode: boolean;
    rootFolderId?: string;
  }) => void;
  setRootFolderId: (rootFolderId: string) => void;
  setThemeMode: (mode: ThemeMode) => void;
  hydrateThemeMode: () => Promise<ThemeMode>;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebarFolder: (folderId: string) => boolean;
  resetSessionUi: () => void;
  setActiveBlockId: (blockId: string | null) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppStore>((set, get) => ({
  authStatus: "booting",
  demoMode: false,
  rootFolderId: "",
  themeMode: "system",
  sidebarOpen: false,
  sidebarExpanded: {},
  activeBlockId: null,
  toastMessage: null,
  toastKey: 0,

  setAuthReady: ({ authenticated, demoMode, rootFolderId }) =>
    set({
      authStatus: authenticated ? "authenticated" : "unauthenticated",
      demoMode,
      rootFolderId: rootFolderId ?? "",
    }),

  setRootFolderId: (rootFolderId) => set({ rootFolderId }),

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    void writeStringItem(THEME_KEY, mode);
  },

  hydrateThemeMode: async () => {
    const raw = await readStringItem(THEME_KEY);
    const mode: ThemeMode = raw === "light" || raw === "dark" ? raw : "system";
    set({ themeMode: mode });
    return mode;
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  toggleSidebarFolder: (folderId) => {
    const next = !get().sidebarExpanded[folderId];
    set((state) => ({
      sidebarExpanded: {
        ...state.sidebarExpanded,
        [folderId]: next,
      },
    }));
    return next;
  },

  resetSessionUi: () =>
    set({
      authStatus: "unauthenticated",
      demoMode: false,
      rootFolderId: "",
      sidebarOpen: false,
      sidebarExpanded: {},
      activeBlockId: null,
    }),

  setActiveBlockId: (blockId) => set({ activeBlockId: blockId }),

  showToast: (message) => {
    if (toastTimer) clearTimeout(toastTimer);
    const nextKey = get().toastKey + 1;
    set({ toastMessage: message, toastKey: nextKey });
    toastTimer = setTimeout(() => {
      if (get().toastKey === nextKey) {
        set({ toastMessage: null });
      }
    }, 1600);
  },

  clearToast: () => set({ toastMessage: null }),
}));
