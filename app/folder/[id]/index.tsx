import { useLocalSearchParams } from "expo-router";
import React from "react";
import { FolderScreen } from "@/components/folder-screen";

export default function SubfolderIndexRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FolderScreen folderId={String(id)} />;
}
