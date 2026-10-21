import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { useAppStore } from "@/lib/store";
import { usePalette } from "@/lib/use-palette";

export function ToastHost() {
  const toastMessage = useAppStore((s) => s.toastMessage);
  const toastKey = useAppStore((s) => s.toastKey);
  const insets = useSafeAreaInsets();
  const { palette } = usePalette();

  if (!toastMessage) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.viewport,
        { bottom: Math.max(18, insets.bottom + 12) },
      ]}
    >
      <Animated.View
        key={toastKey}
        entering={FadeInDown.duration(150)}
        exiting={FadeOutDown.duration(120)}
        style={[
          styles.pill,
          {
            backgroundColor: palette.panel2,
            borderColor: palette.line,
          },
        ]}
      >
        <Text
          style={{ color: palette.text }}
          className="text-xs font-medium"
          accessibilityLiveRegion="polite"
        >
          {toastMessage}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
    alignItems: "center",
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
