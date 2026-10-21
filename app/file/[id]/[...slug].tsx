import { useLocalSearchParams } from "expo-router";
import React from "react";
import { DocumentScreen } from "@/components/document-screen";

export default function FileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DocumentScreen fileId={String(id)} />;
}
