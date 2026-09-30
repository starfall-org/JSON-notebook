import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Linking, Platform, Pressable, Text, View, useColorScheme } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import { login, logout, restoreSession, getAccessToken, LoginRequired } from "./auth";
import LegacyUI from "./LegacyUI";
import type { AuthOperation, AuthResult } from "./native-bridge";

export default function App() {
  const handle = useRef<{ back(): void }>(null);
  const dark = useColorScheme() === "dark";
  const [startupError, setStartupError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const ready = useRef(false);
  useEffect(() => {
    ready.current = false;
    if (Platform.OS === "web") return;
    const timer = setTimeout(() => {
      if (!ready.current) setStartupError("Không thể mở giao diện. Vui lòng thử lại.");
    }, 15000);
    return () => clearTimeout(timer);
  }, [attempt]);
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
        key={attempt}
        ref={handle}
        native={Platform.OS !== "web"}
        nativeAuth={nativeAuth}
        reportStartup={async error => {
          ready.current = true;
          setStartupError(error || "");
        }}
        copy={async text => { await Clipboard.setStringAsync(text); }}
        exit={async () => { BackHandler.exitApp(); }}
        dom={{
          style: { flex: 1 }, containerStyle: { flex: 1 }, useExpoDOMWebView: true,
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
      {!!startupError && <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: dark ? "#000" : "#f7f7f5", gap: 16 }}>
        <Text style={{ color: dark ? "#ededed" : "#242422", textAlign: "center" }}>{startupError}</Text>
        <Pressable accessibilityRole="button" onPress={() => { setStartupError(""); setAttempt(x => x + 1); }} style={{ padding: 12, borderWidth: 1, borderRadius: 10, borderColor: dark ? "#363636" : "#dfdfd9" }}>
          <Text style={{ color: dark ? "#ededed" : "#242422" }}>Thử lại</Text>
        </Pressable>
      </View>}
    </SafeAreaView>
  </SafeAreaProvider>;
}
