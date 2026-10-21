import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { CACHE_REFRESH_MS, FOLDER_MIME } from "@/lib/config";
import {
  buildVisibleFolderListing,
  getEntry,
  getKnownEntry,
  getSyncedContent,
  hasPendingFileSave,
  isInsideSecrets,
  readCachedFileContent,
  readCachedVisibleFolder,
  readFileContent,
  readSyncVisibleFolder,
  setSyncedContent,
  type DriveEntry,
} from "@/lib/drive";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: CACHE_REFRESH_MS,
      gcTime: 1000 * 60 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function useFolderListingQuery(params: {
  folderId: string;
  rootFolderId: string;
  demo: boolean;
  enabled?: boolean;
}) {
  const { folderId, rootFolderId, demo, enabled = true } = params;
  const queryClientInstance = useQueryClient();

  return useQuery({
    queryKey: ["folder", demo ? "demo" : "drive", folderId],
    enabled: Boolean(enabled && folderId && rootFolderId),
    initialData: () => {
      const syncCached = readSyncVisibleFolder(folderId);
      if (!syncCached) return undefined;
      const folder: DriveEntry =
        folderId === rootFolderId
          ? { id: rootFolderId, name: "secrets", mimeType: FOLDER_MIME, parents: [] }
          : getKnownEntry(folderId) || {
              id: folderId,
              name: "",
              mimeType: FOLDER_MIME,
              parents: [],
            };
      return { folder, entries: syncCached.entries, insideSecrets: true };
    },
    initialDataUpdatedAt: () => readSyncVisibleFolder(folderId)?.updatedAt,
    queryFn: async () => {
      const folder: DriveEntry =
        folderId === rootFolderId
          ? { id: rootFolderId, name: "secrets", mimeType: FOLDER_MIME, parents: [] }
          : await getEntry(folderId, demo);

      if (folderId !== rootFolderId) {
        if (folder.mimeType !== FOLDER_MIME) {
          throw new Error("Not a folder");
        }
        const allowed = await isInsideSecrets(folder, rootFolderId, demo);
        if (!allowed) {
          return { folder, entries: [] as DriveEntry[], insideSecrets: false };
        }
      }

      const cached = await readCachedVisibleFolder(folderId);
      if (cached && Date.now() - (cached.updatedAt || 0) < CACHE_REFRESH_MS) {
        return { folder, entries: cached.entries, insideSecrets: true };
      }

      if (cached) {
        // Hydrate immediately and revalidate in background.
        void buildVisibleFolderListing(folderId, demo)
          .then((fresh) => {
            queryClientInstance.setQueryData(
              ["folder", demo ? "demo" : "drive", folderId],
              { folder, entries: fresh, insideSecrets: true },
            );
          })
          .catch((error) => console.error("Folder refresh failed", error));
        return { folder, entries: cached.entries, insideSecrets: true };
      }

      const entries = await buildVisibleFolderListing(folderId, demo);
      return { folder, entries, insideSecrets: true };
    },
  });
}

export function useSidebarFolderQuery(params: {
  folderId: string;
  demo: boolean;
  enabled: boolean;
}) {
  const { folderId, demo, enabled } = params;

  return useQuery({
    queryKey: ["sidebar-folder", demo ? "demo" : "drive", folderId],
    enabled: Boolean(enabled && folderId),
    initialData: () => readSyncVisibleFolder(folderId)?.entries,
    initialDataUpdatedAt: () => readSyncVisibleFolder(folderId)?.updatedAt,
    queryFn: async () => {
      const cached = await readCachedVisibleFolder(folderId);
      if (cached && Date.now() - (cached.updatedAt || 0) < CACHE_REFRESH_MS) {
        return cached.entries;
      }
      return buildVisibleFolderListing(folderId, demo);
    },
  });
}

export function useFileDocumentQuery(params: {
  fileId: string;
  rootFolderId: string;
  demo: boolean;
  enabled?: boolean;
}) {
  const { fileId, rootFolderId, demo, enabled = true } = params;
  const queryClientInstance = useQueryClient();

  return useQuery({
    queryKey: ["file", demo ? "demo" : "drive", fileId],
    enabled: Boolean(enabled && fileId && rootFolderId),
    queryFn: async () => {
      const entry = await getEntry(fileId, demo);
      if (!(await isInsideSecrets(entry, rootFolderId, demo))) {
        return { entry, content: "", insideSecrets: false };
      }
      if (entry.mimeType === FOLDER_MIME || !entry.name.toLowerCase().endsWith(".md")) {
        throw new Error("Not a Markdown file");
      }

      const cached = await readCachedFileContent(fileId);
      if (cached !== null) {
        if (getSyncedContent(fileId) === undefined) {
          setSyncedContent(fileId, cached);
        }
        if (!hasPendingFileSave(fileId)) {
          void readFileContent(fileId, demo)
            .then((fresh) => {
              if (hasPendingFileSave(fileId)) return;
              setSyncedContent(fileId, fresh);
              queryClientInstance.setQueryData(
                ["file", demo ? "demo" : "drive", fileId],
                { entry, content: fresh, insideSecrets: true },
              );
            })
            .catch((error) => console.error("File refresh failed", error));
        }
        return { entry, content: cached, insideSecrets: true };
      }

      const content = await readFileContent(fileId, demo);
      setSyncedContent(fileId, content);
      return { entry, content, insideSecrets: true };
    },
  });
}
