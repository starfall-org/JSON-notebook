import React, { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GoogleDriveIcon } from "@/components/google-drive-icon";
import { Button } from "@/components/ui/button";
import { hasPreviousSignIn, login, LoginRequired } from "@/lib/auth";
import { ensureRootFolder } from "@/lib/drive";
import { queryClient } from "@/lib/queries";
import { useAppStore } from "@/lib/store";
import { usePalette } from "@/lib/use-palette";

export function LoginScreen() {
  const [submitting, setSubmitting] = useState(false);
  const setAuthReady = useAppStore((s) => s.setAuthReady);
  const showToast = useAppStore((s) => s.showToast);
  const { palette } = usePalette();
  const reconnect = hasPreviousSignIn();
  const label = reconnect ? "Reconnect Google Drive" : "Sign in with Google";

  const handleConnect = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const signedIn = await login();
      if (!signedIn) {
        setSubmitting(false);
        return;
      }
      queryClient.clear();
      const rootFolderId = await ensureRootFolder(false);
      setAuthReady({
        authenticated: true,
        demoMode: false,
        rootFolderId,
      });
    } catch (error) {
      if (
        error instanceof LoginRequired &&
        error.message.startsWith("Redirecting to ")
      ) {
        // Browser is navigating to OAuth consent screen.
        return;
      }
      console.error("Sign in failed", error);
      setSubmitting(false);
      showToast("Sign in failed");
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: palette.bg }}
      className="flex-1 items-center justify-center p-5"
    >
      <View className="flex-row items-center gap-2">
        <Button
          testID="google-drive-login-button"
          nativeID="login"
          variant="default"
          size="icon"
          disabled={submitting}
          onPress={handleConnect}
          accessibilityLabel={label}
          style={{
            width: 48,
            height: 48,
            borderRadius: 13,
            backgroundColor: palette.strong,
            borderColor: palette.strong,
          }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={palette.inverse} />
          ) : (
            <GoogleDriveIcon size={18} color={palette.inverse} />
          )}
        </Button>
      </View>
    </SafeAreaView>
  );
}
