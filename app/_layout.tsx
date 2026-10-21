import "@/global.css";

import { ThemeProvider } from "expo-router/react-navigation";
import { PortalHost } from "@rn-primitives/portal";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthGate } from "@/components/auth-gate";
import { ToastHost } from "@/components/toast-host";
import { queryClient } from "@/lib/queries";
import { NAV_THEME } from "@/lib/theme";
import { usePalette } from "@/lib/use-palette";

export { ErrorBoundary } from "expo-router";

function AppShell() {
  const { resolvedTheme, isDark, palette } = usePalette();

  return (
    <ThemeProvider value={NAV_THEME[resolvedTheme]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AuthGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.bg },
            animation: "fade_from_bottom",
          }}
        />
      </AuthGate>
      <ToastHost />
      <PortalHost />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppShell />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
