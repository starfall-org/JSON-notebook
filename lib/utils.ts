import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { FOLDER_MIME } from "@/lib/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function stripMarkdownExtension(name: string) {
  return name.replace(/\.md$/i, "");
}

export function slugify(value: string) {
  return (
    value
      .replace(/\.md$/i, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "item"
  );
}

export function entryRoute(
  entry: { id: string; name: string; mimeType: string },
  rootFolderId: string,
  demo = false,
): string {
  const suffix = demo ? "?demo=1" : "";
  if (entry.id === rootFolderId) return "/" + suffix;
  const kind = entry.mimeType === FOLDER_MIME ? "folder" : "file";
  return `/${kind}/${encodeURIComponent(entry.id)}/${slugify(entry.name)}${suffix}`;
}
