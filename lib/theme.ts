import { DarkTheme, DefaultTheme, type Theme } from "expo-router/react-navigation";
import { Platform } from "react-native";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const MONO_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
});

export const THEME = {
  light: {
    background: "hsl(60 9.1% 96.5%)",
    foreground: "hsl(60 2.9% 13.7%)",
    card: "hsl(0 0% 100%)",
    cardForeground: "hsl(60 2.9% 13.7%)",
    popover: "hsl(0 0% 100%)",
    popoverForeground: "hsl(60 2.9% 13.7%)",
    primary: "hsl(0 0% 6.7%)",
    primaryForeground: "hsl(0 0% 100%)",
    secondary: "hsl(60 9.7% 93.9%)",
    secondaryForeground: "hsl(0 0% 6.7%)",
    muted: "hsl(60 9.7% 93.9%)",
    mutedForeground: "hsl(60 2.6% 45.5%)",
    accent: "hsl(60 11.8% 92.9%)",
    accentForeground: "hsl(0 0% 6.7%)",
    destructive: "hsl(0 72% 51%)",
    border: "hsl(60 9.7% 86.3%)",
    input: "hsl(60 9.7% 86.3%)",
    ring: "hsl(60 4% 58.8%)",
    radius: "0.6875rem",
    chart1: "hsl(12 76% 61%)",
    chart2: "hsl(173 58% 39%)",
    chart3: "hsl(197 37% 24%)",
    chart4: "hsl(43 74% 66%)",
    chart5: "hsl(27 87% 67%)",
  },
  dark: {
    background: "hsl(0 0% 0%)",
    foreground: "hsl(0 0% 92.9%)",
    card: "hsl(0 0% 3.1%)",
    cardForeground: "hsl(0 0% 92.9%)",
    popover: "hsl(0 0% 3.1%)",
    popoverForeground: "hsl(0 0% 92.9%)",
    primary: "hsl(0 0% 100%)",
    primaryForeground: "hsl(0 0% 0%)",
    secondary: "hsl(0 0% 5.1%)",
    secondaryForeground: "hsl(0 0% 92.9%)",
    muted: "hsl(0 0% 5.1%)",
    mutedForeground: "hsl(0 0% 53.7%)",
    accent: "hsl(0 0% 8.5%)",
    accentForeground: "hsl(0 0% 100%)",
    destructive: "hsl(0 68% 58%)",
    border: "hsl(0 0% 14.1%)",
    input: "hsl(0 0% 14.1%)",
    ring: "hsl(0 0% 33.3%)",
    radius: "0.6875rem",
    chart1: "hsl(220 70% 50%)",
    chart2: "hsl(160 60% 45%)",
    chart3: "hsl(30 80% 55%)",
    chart4: "hsl(280 65% 60%)",
    chart5: "hsl(340 75% 55%)",
  },
};

export interface SecretsKeepPalette {
  bg: string;
  panel: string;
  panelTranslucent: string;
  itemPanelTranslucent: string;
  panel2: string;
  text: string;
  muted: string;
  line: string;
  line2: string;
  hover: string;
  actionHover: string;
  focus: string;
  strong: string;
  inverse: string;
  topbar: string;
  actionBg: string;
  codeBg: string;
  codeText: string;
  backdrop: string;
  drop: string;
  dropTint: string;
  sep: [string, string, string, string, string, string];
}

export const PALETTE: Record<ResolvedTheme, SecretsKeepPalette> = {
  light: {
    bg: "#f7f7f5",
    panel: "#ffffff",
    panelTranslucent: "rgba(255, 255, 255, 0.58)",
    itemPanelTranslucent: "rgba(255, 255, 255, 0.44)",
    panel2: "#f1f1ee",
    text: "#242422",
    muted: "#777771",
    line: "#dfdfd9",
    line2: "#c8c8c1",
    hover: "#efefeb",
    actionHover: "#e9e9e5",
    focus: "#9a9a92",
    strong: "#111111",
    inverse: "#ffffff",
    topbar: "rgba(247, 247, 245, 0.94)",
    actionBg: "rgba(255, 255, 255, 0.94)",
    codeBg: "#f3f3f0",
    codeText: "#272725",
    backdrop: "rgba(0, 0, 0, 0.28)",
    drop: "#111111",
    dropTint: "rgba(17, 17, 17, 0.09)",
    sep: ["#777777", "#999999", "#aaaaaa", "#bbbbbb", "#cccccc", "#d7d7d2"],
  },
  dark: {
    bg: "#000000",
    panel: "#080808",
    panelTranslucent: "rgba(8, 8, 8, 0.58)",
    itemPanelTranslucent: "rgba(8, 8, 8, 0.44)",
    panel2: "#0d0d0d",
    text: "#ededed",
    muted: "#898989",
    line: "#242424",
    line2: "#363636",
    hover: "#111111",
    actionHover: "#171717",
    focus: "#555555",
    strong: "#ffffff",
    inverse: "#000000",
    topbar: "rgba(0, 0, 0, 0.94)",
    actionBg: "rgba(0, 0, 0, 0.88)",
    codeBg: "#090909",
    codeText: "#e7e7e7",
    backdrop: "rgba(0, 0, 0, 0.72)",
    drop: "#ffffff",
    dropTint: "rgba(255, 255, 255, 0.12)",
    sep: ["#666666", "#4b4b4b", "#363636", "#323232", "#292929", "#242424"],
  },
};

export const NAV_THEME: Record<ResolvedTheme, Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: PALETTE.light.bg,
      border: PALETTE.light.line,
      card: PALETTE.light.panel,
      notification: THEME.light.destructive,
      primary: PALETTE.light.strong,
      text: PALETTE.light.text,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: PALETTE.dark.bg,
      border: PALETTE.dark.line,
      card: PALETTE.dark.panel,
      notification: THEME.dark.destructive,
      primary: PALETTE.dark.strong,
      text: PALETTE.dark.text,
    },
  },
};
