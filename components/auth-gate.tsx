import { useGlobalSearchParams } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { LoginScreen } from "@/components/login-screen";
import { LoginRequired, restoreSession } from "@/lib/auth";
import { ensureRootFolder, onAuthExpired } from "@/lib/drive";
import { useAppStore } from "@/lib/store";
import { usePalette } from "@/lib/use-palette";

function isWebDemoLocation(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("demo");
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const searchParams = useGlobalSearchParams<{ demo?: string }>();
  const authStatus = useAppStore((s) => s.authStatus);
  const demoMode = useAppStore((s) => s.demoMode);
  const setAuthReady = useAppStore((s) => s.setAuthReady);
  const resetSessionUi = useAppStore((s) => s.resetSessionUi);
  const hydrateThemeMode = useAppStore((s) => s.hydrateThemeMode);
  const showToast = useAppStore((s) => s.showToast);
  const { palette } = usePalette();

  const urlWantsDemo =
    searchParams.demo !== undefined || isWebDemoLocation();

  useEffect(() => {
    void hydrateThemeMode();
  }, [hydrateThemeMode]);

  useEffect(() => {
    onAuthExpired(() => {
      resetSessionUi();
    });
    return () => onAuthExpired(null);
  }, [resetSessionUi]);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (urlWantsDemo) {
        const rootFolderId = await ensureRootFolder(true);
        if (!active) return;
        setAuthReady({
          authenticated: true,
          demoMode: true,
          rootFolderId,
        });
        return;
      }

      if (authStatus === "authenticated") {
        return;
      }

      try {
        const restored = await restoreSession();
        if (!active) return;
        if (!restored) {
          setAuthReady({ authenticated: false, demoMode: false });
          return;
        }
        const rootFolderId = await ensureRootFolder(false);
        if (!active) return;
        setAuthReady({
          authenticated: true,
          demoMode: false,
          rootFolderId,
        });
      } catch (error) {
        if (!active) return;
        if (
          error instanceof LoginRequired &&
          error.message.startsWith("Redirecting to ")
        ) {
          return;
        }
        console.error("Bootstrap auth failed", error);
        setAuthReady({ authenticated: false, demoMode: false });
        if (!(error instanceof LoginRequired)) {
          showToast(error instanceof Error ? error.message : "Open failed");
        }
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [urlWantsDemo]);

  if (authStatus === "booting") {
    return (
      <View
        style={{ flex: 1, backgroundColor: palette.bg }}
        className="flex-1 items-center justify-center"
      >
        <ActivityIndicator size="small" color={palette.strong} />
      </View>
    );
  }

  if (authStatus === "unauthenticated") {
    return <LoginScreen />;
  }

  return <>{children}</>;
}
