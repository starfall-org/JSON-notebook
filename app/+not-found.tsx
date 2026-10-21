import { Redirect } from "expo-router";
import React from "react";
import { useAppStore } from "@/lib/store";

export default function NotFoundScreen() {
  const demoMode = useAppStore((s) => s.demoMode);
  return <Redirect href={(demoMode ? "/?demo=1" : "/") as never} />;
}
