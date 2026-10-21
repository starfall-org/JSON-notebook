import { expireCachedToken, getAccessToken, LoginRequired } from "@/lib/auth";
import {
  FILE_CACHE_PREFIX,
  FOLDER_CACHE_PREFIX,
  FOLDER_MIME,
  FOLDER_VISIBLE_CACHE_PREFIX,
} from "@/lib/config";
import {
  clearPersistentPrefix,
  readPersistentCache,
  readSyncCache,
  writePersistentCache,
} from "@/lib/storage";

export type DriveEntry = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  parents?: string[];
};

type DemoNode = {
  id: string;
  name: string;
  mimeType: string;
  parentId: string | null;
  content?: string;
  modifiedTime: string;
};

export type FolderCacheRecord = {
  updatedAt: number;
  entries: DriveEntry[];
};

export type FileCacheRecord = {
  updatedAt: number;
  content: string;
};

const fence = "```";

const demoNodes: DemoNode[] = [
  {
    id: "demo-root",
    name: "secrets",
    mimeType: FOLDER_MIME,
    parentId: null,
    modifiedTime: new Date().toISOString(),
  },
  {
    id: "demo-cloud",
    name: "cloud",
    mimeType: FOLDER_MIME,
    parentId: "demo-root",
    modifiedTime: new Date(Date.now() - 1000).toISOString(),
  },
  {
    id: "demo-services",
    name: "services.md",
    mimeType: "text/markdown",
    parentId: "demo-root",
    modifiedTime: new Date().toISOString(),
    content:
      "# Services\n\n## Production\n\n" +
      fence +
      "env\nAPI_URL=https://example.internal\nTOKEN=demo-value\n" +
      fence +
      "\n\n## Staging\n\n" +
      "| Environment | Endpoint | Status |\n" +
      "| :--- | :--- | :--- |\n" +
      "| Staging | `https://staging.example.internal` | Active |\n\n" +
      "- **Notes**\n\n  " +
      fence +
      "text\n  Notes for staging.\n  " +
      fence,
  },
  {
    id: "demo-github",
    name: "github.md",
    mimeType: "text/markdown",
    parentId: "demo-root",
    modifiedTime: new Date(Date.now() - 60000).toISOString(),
    content:
      "# GitHub\n\n## Personal\n\n- **Username**\n\n  " +
      fence +
      "text\n  demo-user\n  " +
      fence,
  },
  {
    id: "demo-cloud-main",
    name: "main.md",
    mimeType: "text/markdown",
    parentId: "demo-cloud",
    modifiedTime: new Date(Date.now() - 120000).toISOString(),
    content:
      "# Cloud\n\n## Main project\n\n- **Region**\n\n  " +
      fence +
      "text\n  asia-southeast1\n  " +
      fence,
  },
];

let onAuthExpiredCallback: (() => void) | null = null;
export function onAuthExpired(listener: (() => void) | null) {
  onAuthExpiredCallback = listener;
}

const fileSaveQueues = new Map<string, Promise<void>>();
const syncedContentByFile = new Map<string, string>();
const knownEntriesById = new Map<string, DriveEntry>();

export function rememberEntry(entry: DriveEntry) {
  knownEntriesById.set(entry.id, entry);
}

export function getKnownEntry(id: string): DriveEntry | undefined {
  return knownEntriesById.get(id);
}

export function hasPendingFileSave(fileId: string): boolean {
  return fileSaveQueues.has(fileId);
}

export function getSyncedContent(fileId: string): string | undefined {
  return syncedContentByFile.get(fileId);
}

export function setSyncedContent(fileId: string, content: string) {
  syncedContentByFile.set(fileId, content);
}

export async function clearAllDriveCaches() {
  fileSaveQueues.clear();
  syncedContentByFile.clear();
  knownEntriesById.clear();
  await clearPersistentPrefix([
    FOLDER_CACHE_PREFIX,
    FOLDER_VISIBLE_CACHE_PREFIX,
    FILE_CACHE_PREFIX,
  ]);
}

function escapeDriveQuery(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = async (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", "Bearer " + token);
    return fetch(url, { ...init, headers });
  };

  let token: string;
  try {
    token = await getAccessToken(false);
  } catch (error) {
    if (error instanceof LoginRequired) onAuthExpiredCallback?.();
    throw error;
  }

  let response = await send(token);
  if (response.status === 401) {
    await expireCachedToken();
    try {
      token = await getAccessToken(true);
    } catch (error) {
      if (error instanceof LoginRequired) onAuthExpiredCallback?.();
      throw error;
    }
    response = await send(token);
  }

  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response;
}

export function sidebarVisibleEntries(children: DriveEntry[]): DriveEntry[] {
  return children
    .filter(
      (entry) =>
        entry.mimeType === FOLDER_MIME || entry.name.toLowerCase().endsWith(".md"),
    )
    .sort((a, b) => {
      const af = a.mimeType === FOLDER_MIME ? 0 : 1;
      const bf = b.mimeType === FOLDER_MIME ? 0 : 1;
      return af - bf || a.name.localeCompare(b.name);
    });
}

export function readSyncVisibleFolder(folderId: string): FolderCacheRecord | null {
  const cached = readSyncCache<FolderCacheRecord>(FOLDER_VISIBLE_CACHE_PREFIX + folderId);
  return cached && Array.isArray(cached.entries) ? cached : null;
}

export async function readCachedVisibleFolder(
  folderId: string,
): Promise<FolderCacheRecord | null> {
  const cached = await readPersistentCache<FolderCacheRecord>(
    FOLDER_VISIBLE_CACHE_PREFIX + folderId,
  );
  return cached && Array.isArray(cached.entries) ? cached : null;
}

export async function readCachedFileContent(fileId: string): Promise<string | null> {
  const cached = await readPersistentCache<FileCacheRecord>(FILE_CACHE_PREFIX + fileId);
  return cached && typeof cached.content === "string" ? cached.content : null;
}

export async function cacheFileContent(fileId: string, content: string): Promise<void> {
  await writePersistentCache(FILE_CACHE_PREFIX + fileId, {
    updatedAt: Date.now(),
    content,
  } satisfies FileCacheRecord);
}

export async function ensureRootFolder(demo = false): Promise<string> {
  if (demo) {
    const root: DriveEntry = {
      id: "demo-root",
      name: "secrets",
      mimeType: FOLDER_MIME,
      parents: [],
    };
    rememberEntry(root);
    return "demo-root";
  }

  const params = new URLSearchParams({
    q:
      "mimeType='" +
      FOLDER_MIME +
      "' and name='secrets' and 'root' in parents and trashed=false",
    fields: "files(id,name,mimeType,modifiedTime,parents)",
    pageSize: "1",
  });
  const response = await driveFetch(
    "https://www.googleapis.com/drive/v3/files?" + params,
  );
  const data = (await response.json()) as { files?: DriveEntry[] };

  if (data.files?.[0]) {
    rememberEntry(data.files[0]);
    return data.files[0].id;
  }

  const created = await driveFetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "secrets", mimeType: FOLDER_MIME }),
    },
  );
  const root = (await created.json()) as DriveEntry;
  rememberEntry(root);
  return root.id;
}

export async function getEntry(id: string, demo = false): Promise<DriveEntry> {
  if (demo) {
    const node = demoNodes.find((item) => item.id === id);
    if (!node) throw new Error("Not found");
    const entry: DriveEntry = {
      id: node.id,
      name: node.name,
      mimeType: node.mimeType,
      modifiedTime: node.modifiedTime,
      parents: node.parentId ? [node.parentId] : [],
    };
    rememberEntry(entry);
    return entry;
  }

  const response = await driveFetch(
    "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(id) +
      "?fields=id,name,mimeType,modifiedTime,parents",
  );
  const entry = (await response.json()) as DriveEntry;
  rememberEntry(entry);
  return entry;
}

export async function isInsideSecrets(
  entry: DriveEntry,
  rootFolderId: string,
  demo = false,
): Promise<boolean> {
  if (entry.id === rootFolderId) return true;

  let parentId = entry.parents?.[0];
  let depth = 0;

  while (parentId && depth < 32) {
    if (parentId === rootFolderId) return true;
    const parent =
      getKnownEntry(parentId) || (await getEntry(parentId, demo));
    parentId = parent.parents?.[0];
    depth += 1;
  }

  return false;
}

export async function directChildren(
  folderId: string,
  demo = false,
): Promise<DriveEntry[]> {
  if (demo) {
    const children = demoNodes
      .filter((node) => node.parentId === folderId)
      .map((node) => {
        const entry: DriveEntry = {
          id: node.id,
          name: node.name,
          mimeType: node.mimeType,
          modifiedTime: node.modifiedTime,
          parents: node.parentId ? [node.parentId] : [],
        };
        rememberEntry(entry);
        return entry;
      });
    await writePersistentCache(FOLDER_CACHE_PREFIX + folderId, {
      updatedAt: Date.now(),
      entries: children,
    } satisfies FolderCacheRecord);
    return children;
  }

  const children: DriveEntry[] = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      q: "'" + escapeDriveQuery(folderId) + "' in parents and trashed=false",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,parents)",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await driveFetch(
      "https://www.googleapis.com/drive/v3/files?" + params,
    );
    const data = (await response.json()) as {
      files?: DriveEntry[];
      nextPageToken?: string;
    };
    for (const file of data.files || []) {
      rememberEntry(file);
      children.push(file);
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  await writePersistentCache(FOLDER_CACHE_PREFIX + folderId, {
    updatedAt: Date.now(),
    entries: children,
  } satisfies FolderCacheRecord);
  return children;
}

export async function folderHasMarkdown(
  folderId: string,
  demo = false,
  memo = new Map<string, boolean>(),
): Promise<boolean> {
  if (memo.has(folderId)) return memo.get(folderId)!;

  memo.set(folderId, false);
  const children = await directChildren(folderId, demo);

  if (
    children.some(
      (entry) =>
        entry.mimeType !== FOLDER_MIME && entry.name.toLowerCase().endsWith(".md"),
    )
  ) {
    memo.set(folderId, true);
    return true;
  }

  for (const child of children) {
    if (child.mimeType !== FOLDER_MIME) continue;
    if (await folderHasMarkdown(child.id, demo, memo)) {
      memo.set(folderId, true);
      return true;
    }
  }

  return false;
}

export async function buildVisibleFolderListing(
  folderId: string,
  demo = false,
): Promise<DriveEntry[]> {
  const children = await directChildren(folderId, demo);
  const memo = new Map<string, boolean>();
  const visible: DriveEntry[] = [];

  for (const entry of children) {
    if (entry.mimeType === FOLDER_MIME) {
      if (await folderHasMarkdown(entry.id, demo, memo)) {
        visible.push(entry);
      }
      continue;
    }

    if (entry.name.toLowerCase().endsWith(".md")) {
      visible.push(entry);
    }
  }

  const sorted = sidebarVisibleEntries(visible);
  await writePersistentCache(FOLDER_VISIBLE_CACHE_PREFIX + folderId, {
    updatedAt: Date.now(),
    entries: sorted,
  } satisfies FolderCacheRecord);
  return sorted;
}

export async function readFileContent(
  fileId: string,
  demo = false,
): Promise<string> {
  if (demo) {
    const content = demoNodes.find((node) => node.id === fileId)?.content || "";
    await cacheFileContent(fileId, content);
    return content;
  }

  const response = await driveFetch(
    "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(fileId) +
      "?alt=media",
  );
  const content = await response.text();
  await cacheFileContent(fileId, content);
  return content;
}

export async function saveFileContent(
  fileId: string,
  text: string,
  demo = false,
): Promise<void> {
  if (demo) {
    const node = demoNodes.find((item) => item.id === fileId);
    if (node) {
      node.content = text;
      node.modifiedTime = new Date().toISOString();
    }
    return;
  }

  await driveFetch(
    "https://www.googleapis.com/upload/drive/v3/files/" +
      encodeURIComponent(fileId) +
      "?uploadType=media",
    {
      method: "PATCH",
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
      body: text,
    },
  );
}

export function queueFileSave(params: {
  fileId: string;
  content: string;
  demo: boolean;
  onRollback?: (rollbackContent: string) => void;
}) {
  const { fileId, content, demo, onRollback } = params;
  const previous = fileSaveQueues.get(fileId) || Promise.resolve();

  const next = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        await saveFileContent(fileId, content, demo);
        syncedContentByFile.set(fileId, content);
        await cacheFileContent(fileId, content);
      } catch (error) {
        console.error("Drive save failed", error);
        const rollback = syncedContentByFile.get(fileId);
        const isLatest = fileSaveQueues.get(fileId) === next;
        if (rollback !== undefined && isLatest) {
          await cacheFileContent(fileId, rollback);
          onRollback?.(rollback);
        }
      }
    })
    .finally(() => {
      if (fileSaveQueues.get(fileId) === next) {
        fileSaveQueues.delete(fileId);
      }
    });

  fileSaveQueues.set(fileId, next);
  return next;
}
