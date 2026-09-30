import React, { useCallback, useEffect, useRef } from "react";
import { BackHandler, Linking, Platform, useColorScheme } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import { login, logout, restoreSession, getAccessToken, LoginRequired } from "./auth";
import LegacyUI from "./LegacyUI";
import type { AuthOperation, AuthResult } from "./native-bridge";

export default function App() {
  const handle = useRef<{ back(): void }>(null);
  const dark = useColorScheme() === "dark";
  const nativeAuth = useCallback(async (operation: AuthOperation, force = false): Promise<AuthResult> => {
    try {
      if (operation === "restore") return { signedIn: Boolean(await restoreSession()) };
      if (operation === "logout") { await logout(); return {}; }
      if (operation === "login" && !await login()) return { error: "Sign in cancelled" };
      return { token: await getAccessToken(force), signedIn: true };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Google sign-in failed",
        loginRequired: error instanceof LoginRequired
      };
    }
  }, []);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handle.current?.back();
      return true;
    });
    return () => subscription.remove();
  }, []);
  return <SafeAreaProvider>
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? "#000000" : "#f7f7f5" }}>
      <StatusBar style={dark ? "light" : "dark"} />
      <LegacyUI
        ref={handle}
        native={Platform.OS !== "web"}
        nativeAuth={nativeAuth}
        copy={async text => { await Clipboard.setStringAsync(text); }}
        exit={async () => { BackHandler.exitApp(); }}
        dom={{
          style: { flex: 1 }, useExpoDOMWebView: false,
          allowUniversalAccessFromFileURLs: true,
          onShouldStartLoadWithRequest: request => {
            if (request.url.startsWith("file:///android_asset/www.bundle/") ||
                request.url.startsWith("http://localhost:") ||
                request.url.startsWith("http://127.0.0.1:") || request.url === "about:blank") return true;
            if (/^https?:/.test(request.url)) void Linking.openURL(request.url);
            return false;
          }
        }}
      />
    </SafeAreaView>
  </SafeAreaProvider>;
}
