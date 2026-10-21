import * as SystemUI from "expo-system-ui";
import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { Appearance, Platform, useColorScheme as useRNColorScheme } from "react-native";
import { useAppStore } from "@/lib/store";
import { PALETTE, type ResolvedTheme, type ThemeMode } from "@/lib/theme";

export function usePalette() {
  const themeMode = useAppStore((s) => s.themeMode);
  const setStoreThemeMode = useAppStore((s) => s.setThemeMode);
  const { colorScheme, setColorScheme } = useColorScheme();
  const systemScheme = useRNColorScheme();

  const resolved: ResolvedTheme =
    themeMode === "light" || themeMode === "dark"
      ? themeMode
      : (systemScheme ?? colorScheme) === "dark"
        ? "dark"
        : "light";

  useEffect(() => {
    setColorScheme(themeMode);

    if (Platform.OS !== "web") {
      try {
        Appearance.setColorScheme?.(
          themeMode === "system" ? "unspecified" : themeMode,
        );
      } catch {
        // Ignore if unsupported by platform runtime.
      }
      void SystemUI.setBackgroundColorAsync(PALETTE[resolved].bg).catch(() => {});
    } else if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", resolved === "dark");
      if (themeMode === "system") {
        document.documentElement.removeAttribute("data-theme");
      } else {
        document.documentElement.dataset.theme = themeMode;
      }
      const themeMeta = document.querySelector<HTMLMetaElement>(
        'meta[name="theme-color"]',
      );
      if (themeMeta) {
        themeMeta.content = PALETTE[resolved].bg;
      }
    }
  }, [themeMode, resolved, setColorScheme]);

  const setThemeMode = (next: ThemeMode) => {
    setStoreThemeMode(next);
  };

  return {
    themeMode,
    setThemeMode,
    resolvedTheme: resolved,
    isDark: resolved === "dark",
    palette: PALETTE[resolved],
  };
}
