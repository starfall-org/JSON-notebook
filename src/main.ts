/// <reference types="vite/client" />
import DOMPurify from "dompurify";
import { marked } from "marked";
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithCredential,
  signOut as firebaseSignOut
} from "firebase/auth";
import "./style.css";
type DriveEntry = {
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

type MarkdownBlock = {
  id: string;
  type: "heading" | "item" | "code" | "other" | "divider";
  start: number;
  end: number;
  raw: string;
  level?: number;
  indent?: string;
  value?: string;
  language?: string;
};

type EditState = {
  mode: "new" | "edit";
  type: "heading" | "item" | "code" | "other";
  blockId?: string;
  insertAt: number;
  level?: number;
  indent?: string;
  parentIndent?: string;
  parentBlockId?: string;
  value: string;
  language?: string;
};
const app = document.querySelector<HTMLDivElement>("#app")!;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER_MIME = "application/vnd.google-apps.folder";

const firebaseApp = initializeApp({
  apiKey: "AIzaSyDk6tw0jfgUzfMA0xJHqKzDWU7MWyHF7Zc",
  authDomain: "awesome-89e82.firebaseapp.com",
  projectId: "awesome-89e82",
  storageBucket: "awesome-89e82.firebasestorage.app",
  messagingSenderId: "1064411966305",
  appId: "1:1064411966305:web:5d1ce7688d88112704b320"
});
const auth = getAuth(firebaseApp);
const demo = new URLSearchParams(location.search).has("demo");
const fence = String.fromCharCode(96).repeat(3);
const SESSION_KEY = "secret-keep.google-session";
const OAUTH_SESSION_KEY = "secrets-keep.oauth-session";
const OAUTH_RETURN_KEY = "secrets-keep.oauth-return";
const GOOGLE_OAUTH_CLIENT_ID = "1064411966305-6vuqla6hbp2aegichjdb3d748jqji4be.apps.googleusercontent.com";
const GOOGLE_OAUTH_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_SECRET || "";
const GOOGLE_OAUTH_REDIRECT_URI = "https://awesome-89e82.web.app/";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const IDENTITY_TOOLKIT_API_KEY = "AIzaSyDk6tw0jfgUzfMA0xJHqKzDWU7MWyHF7Zc";
const IDENTITY_CREATE_AUTH_URI_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=" + encodeURIComponent(IDENTITY_TOOLKIT_API_KEY);
const IDENTITY_SIGN_IN_IDP_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=" + encodeURIComponent(IDENTITY_TOOLKIT_API_KEY);
const THEME_KEY = "secret-keep.theme";
const FOLDER_CACHE_PREFIX = "secrets-keep.folder-cache.v1:";
const FOLDER_VISIBLE_CACHE_PREFIX = "secrets-keep.folder-visible-cache.v1:";
const CACHE_REFRESH_MS = 30_000;
const FILE_CACHE_PREFIX = "secrets-keep.file-cache.v1:";

type ThemeMode = "system" | "light" | "dark";
type StoredSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  signedIn: boolean;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type IdentityAuthUriResponse = {
  authUri?: string;
  sessionId?: string;
  error?: { message?: string };
};

type IdentitySignInResponse = {
  oauthAccessToken?: string;
  oauthRefreshToken?: string;
  oauthExpireIn?: number;
  oauthIdToken?: string;
  error?: { message?: string };
};

let accessToken = "";
let driveTokenRefreshPromise: Promise<boolean> | null = null;
let rootFolderId = "";
let entries: DriveEntry[] = [];
let currentFolder: DriveEntry | null = null;
let currentFile: DriveEntry | null = null;
let editing: EditState | null = null;
let currentContent = "";
let filter = "";
const sidebarChildrenCache = new Map<string, DriveEntry[]>();
const sidebarCacheUpdatedAt = new Map<string, number>();
const sidebarExpanded = new Set<string>();
const sidebarLoading = new Set<string>();
let sidebarOpen = false;
const fileSaveQueues = new Map<string, Promise<void>>();
const syncedContentByFile = new Map<string, string>();
const fileContentCache = new Map<string, string>();

const demoNodes: DemoNode[] = [
  { id: "demo-root", name: "secrets", mimeType: FOLDER_MIME, parentId: null, modifiedTime: new Date().toISOString() },
  { id: "demo-cloud", name: "cloud", mimeType: FOLDER_MIME, parentId: "demo-root", modifiedTime: new Date(Date.now() - 1000).toISOString() },
  { id: "demo-services", name: "services.md", mimeType: "text/markdown", parentId: "demo-root", modifiedTime: new Date().toISOString(), content: "# Services\n\n## Production\n\n" + fence + "env\nAPI_URL=https://example.internal\nTOKEN=demo-value\n" + fence + "\n\n## Staging\n\n- **Notes**\n\n    " + fence + "text\n    Notes for staging.\n    " + fence },
  { id: "demo-github", name: "github.md", mimeType: "text/markdown", parentId: "demo-root", modifiedTime: new Date(Date.now() - 60000).toISOString(), content: "# GitHub\n\n## Personal\n\n- **Username**\n\n    " + fence + "text\n    demo-user\n    " + fence },
  { id: "demo-cloud-main", name: "main.md", mimeType: "text/markdown", parentId: "demo-cloud", modifiedTime: new Date(Date.now() - 120000).toISOString(), content: "# Cloud\n\n## Main project\n\n- **Region**\n\n    " + fence + "text\n    asia-southeast1\n    " + fence }
];

const svg = (body: string) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  body +
  "</svg>";

const icons = {
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  chevron: svg('<path d="m9 18 6-6-6-6"/>'),
  edit: svg('<path d="m4 20 4.2-1 10.9-10.9a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/><path d="m14.5 6.5 3 3"/>'),
  file: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>'),
  folder: svg('<path d="M3 6h7l2 2h9v11H3z"/>'),
  drive: svg('<path d="M8.2 4h7.6l5 8.7-3.8 6.6H7l-3.8-6.6L8.2 4Z"/><path d="m8.2 4 5 8.7M20.8 12.7H13.2M7 19.3l6.2-6.6"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.7-3.7"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  logout: svg('<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>'),
  themeSystem: svg('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  themeLight: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>'),
  themeDark: svg('<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.7 8.7 0 1 0 20.5 14.2Z"/>'),
  branch: svg('<path d="M6 3v12a4 4 0 0 0 4 4h2"/><circle cx="6" cy="3" r="2"/><circle cx="16" cy="7" r="2"/><circle cx="14" cy="19" r="2"/><path d="M8 9h4a4 4 0 0 0 4-4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  code: svg('<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>'),
  save: svg('<path d="m5 12 4 4L19 6"/>'),
  cancel: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/>'),
  move: svg('<path d="M8 5h8M8 12h8M8 19h8"/><path d="m5 5-2 2-2-2M19 5l2 2 2-2M5 19l-2-2-2 2M19 19l2-2 2 2"/>'),
  copy: svg('<rect x="8" y="8" width="10" height="10" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>')
};
function esc(value: string) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}
function readJsonCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJsonCache(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota/private mode should not block the app.
  }
}
function folderCacheKey(folderId: string) {
  return FOLDER_CACHE_PREFIX + folderId;
}

function visibleFolderCacheKey(folderId: string) {
  return FOLDER_VISIBLE_CACHE_PREFIX + folderId;
}

type FolderCacheRecord = {
  updatedAt: number;
  entries: DriveEntry[];
};

type FileCacheRecord = {
  updatedAt: number;
  content: string;
};

function readCachedChildren(folderId: string): FolderCacheRecord | null {
  const memory = sidebarChildrenCache.get(folderId);
  const updatedAt = sidebarCacheUpdatedAt.get(folderId);
  if (memory && updatedAt !== undefined) {
    return { updatedAt, entries: memory };
  }

  const cached = readJsonCache<FolderCacheRecord>(folderCacheKey(folderId));
  if (!cached || !Array.isArray(cached.entries)) return null;

  sidebarChildrenCache.set(folderId, cached.entries);
  sidebarCacheUpdatedAt.set(folderId, cached.updatedAt || 0);
  return cached;
}

function cachedFolderChildren(folderId: string) {
  return readCachedChildren(folderId)?.entries || null;
}

function cacheChildren(folderId: string, entries: DriveEntry[]) {
  const updatedAt = Date.now();
  sidebarChildrenCache.set(folderId, entries);
  sidebarCacheUpdatedAt.set(folderId, updatedAt);
  writeJsonCache(folderCacheKey(folderId), { updatedAt, entries } satisfies FolderCacheRecord);
}

function readCachedFile(fileId: string): FileCacheRecord | null {
  const content = fileContentCache.get(fileId);
  return content === undefined ? null : { updatedAt: Date.now(), content };
}

function cacheFile(fileId: string, content: string) {
  fileContentCache.set(fileId, content);
}

function clearListingCaches() {
  sidebarChildrenCache.clear();
  sidebarCacheUpdatedAt.clear();
  fileContentCache.clear();

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (key.startsWith(FOLDER_CACHE_PREFIX) || key.startsWith(FOLDER_VISIBLE_CACHE_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}

function sidebarVisibleEntries(children: DriveEntry[]) {
  return children
    .filter(entry => entry.mimeType === FOLDER_MIME || entry.name.toLowerCase().endsWith(".md"))
    .sort((a, b) => {
      const af = a.mimeType === FOLDER_MIME ? 0 : 1;
      const bf = b.mimeType === FOLDER_MIME ? 0 : 1;
      return af - bf || a.name.localeCompare(b.name);
    });
}

function cachedVisibleFolderEntries(folderId: string) {
  const cached = readJsonCache<FolderCacheRecord>(visibleFolderCacheKey(folderId));
  return cached && Array.isArray(cached.entries)
    ? sidebarVisibleEntries(cached.entries)
    : null;
}

function sidebarEntriesForFolder(folderId: string) {
  const filtered = cachedVisibleFolderEntries(folderId);
  if (filtered) return filtered;

  const raw = cachedFolderChildren(folderId);
  if (!raw) return null;

  return sidebarVisibleEntries(raw).filter(entry => {
    if (entry.mimeType !== FOLDER_MIME) return true;

    const childFiltered = cachedVisibleFolderEntries(entry.id);
    return childFiltered === null || childFiltered.length > 0;
  });
}

function slug(value: string) {
  return value
    .replace(/\.md$/i, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "item";
}

function routeFor(entry: DriveEntry) {
  if (entry.id === rootFolderId) return "/";
  const kind = entry.mimeType === FOLDER_MIME ? "folder" : "file";
  return "/" + kind + "/" + encodeURIComponent(entry.id) + "/" + slug(entry.name);
}

function withDemo(path: string) {
  return demo ? path + "?demo=1" : path;
}

function navigate(path: string, replace = false) {
  history[replace ? "replaceState" : "pushState"]({}, "", withDemo(path));
  void renderRoute();
}

function selectedTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function resolvedTheme(mode: ThemeMode = selectedTheme()) {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode) {
  localStorage.setItem(THEME_KEY, mode);
  if (mode === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = mode;

  const themeColor = document.querySelector<HTMLMetaElement>("#theme-color");
  if (themeColor) themeColor.content = resolvedTheme(mode) === "dark" ? "#000000" : "#f7f7f5";
}

function storedSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as StoredSession;
    if (!value || typeof value.expiresAt !== "number" || typeof value.signedIn !== "boolean") return null;
    return value;
  } catch {
    return null;
  }
}

function saveSession(
  token: string,
  expiresInSeconds: number,
  refreshToken = storedSession()?.refreshToken || ""
) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    accessToken: token,
    refreshToken,
    expiresAt: Date.now() + Math.max(0, expiresInSeconds - 60) * 1000,
    signedIn: true
  } satisfies StoredSession));
}

function clearOAuthAttempt() {
  sessionStorage.removeItem(OAUTH_SESSION_KEY);
  sessionStorage.removeItem(OAUTH_RETURN_KEY);
}

function clearSession() {
  accessToken = "";
  localStorage.removeItem(SESSION_KEY);
  clearOAuthAttempt();
}

function expireStoredToken() {
  const session = storedSession();
  accessToken = "";
  if (!session?.signedIn) return;

  localStorage.setItem(SESSION_KEY, JSON.stringify({
    ...session,
    accessToken: "",
    expiresAt: 0
  } satisfies StoredSession));
}

function storedTokenIsValid(minValidityMs = 0) {
  const session = storedSession();
  return Boolean(
    session?.signedIn &&
    session.accessToken &&
    session.expiresAt > Date.now() + minValidityMs
  );
}

function restoreStoredToken(minValidityMs = 0) {
  if (!storedTokenIsValid(minValidityMs)) {
    accessToken = "";
    return false;
  }

  accessToken = storedSession()!.accessToken;
  return true;
}

async function postGoogleToken(params: Record<string, string>): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });

  const result = await response.json() as GoogleTokenResponse;
  if (!response.ok) {
    throw new Error(
      result.error_description ||
      result.error ||
      "Google OAuth token refresh failed"
    );
  }

  return result;
}

async function signInFirebaseWithGoogleToken(access: string, idToken?: string) {
  const credential = GoogleAuthProvider.credential(idToken || null, access);
  await signInWithCredential(auth, credential);
}

async function beginOfflineOAuth(): Promise<never> {
  const customParameter: Record<string, string> = {
    prompt: "consent",
    access_type: "offline",
    include_granted_scopes: "true"
  };

  if (auth.currentUser?.email) {
    customParameter.login_hint = auth.currentUser.email;
  }

  const response = await fetch(IDENTITY_CREATE_AUTH_URI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerId: "google.com",
      continueUri: GOOGLE_OAUTH_REDIRECT_URI,
      oauthScope: DRIVE_SCOPE,
      customParameter
    })
  });

  const result = await response.json() as IdentityAuthUriResponse;
  if (!response.ok || !result.authUri || !result.sessionId) {
    throw new Error(result.error?.message || "Could not start Google offline authorization");
  }

  sessionStorage.setItem(OAUTH_SESSION_KEY, result.sessionId);
  sessionStorage.setItem(OAUTH_RETURN_KEY, location.href);
  location.assign(result.authUri);
  throw new Error("Redirecting to Google OAuth");
}

async function handleOfflineOAuthCallback() {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  if (!code && !oauthError) return false;

  const sessionId = sessionStorage.getItem(OAUTH_SESSION_KEY);
  const returnUrl = sessionStorage.getItem(OAUTH_RETURN_KEY) || "/";

  try {
    if (oauthError) {
      throw new Error(url.searchParams.get("error_description") || oauthError);
    }

    if (!code || !sessionId) {
      throw new Error("Invalid Google OAuth callback session");
    }

    const response = await fetch(IDENTITY_SIGN_IN_IDP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestUri: location.href,
        sessionId,
        returnRefreshToken: true,
        returnSecureToken: true,
        returnIdpCredential: true
      })
    });

    const result = await response.json() as IdentitySignInResponse;
    if (!response.ok) {
      throw new Error(result.error?.message || "Google offline authorization failed");
    }

    if (!result.oauthAccessToken || !result.oauthRefreshToken) {
      throw new Error("Google did not return an OAuth refresh token");
    }

    accessToken = result.oauthAccessToken;
    saveSession(
      result.oauthAccessToken,
      result.oauthExpireIn || 3600,
      result.oauthRefreshToken
    );

    await signInFirebaseWithGoogleToken(
      result.oauthAccessToken,
      result.oauthIdToken
    );

    const restored = new URL(returnUrl, location.origin);
    const nextPath = restored.origin === location.origin
      ? restored.pathname + restored.search + restored.hash
      : "/";

    clearOAuthAttempt();
    history.replaceState({}, "", nextPath);
    return true;
  } catch (error) {
    clearOAuthAttempt();
    throw error;
  }
}

async function refreshDriveToken() {
  if (demo) return true;

  if (storedTokenIsValid(30_000)) {
    restoreStoredToken();
    return true;
  }

  const session = storedSession();
  if (!session?.refreshToken) return false;
  if (driveTokenRefreshPromise) return driveTokenRefreshPromise;

  driveTokenRefreshPromise = (async () => {
    try {
      if (!GOOGLE_OAUTH_CLIENT_SECRET) {
        throw new Error("Google OAuth client secret is not configured");
      }

      const result = await postGoogleToken({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
        refresh_token: session.refreshToken!,
        grant_type: "refresh_token"
      });

      if (!result.access_token) return false;

      accessToken = result.access_token;
      saveSession(
        result.access_token,
        result.expires_in || 3600,
        result.refresh_token || session.refreshToken
      );

      if (!auth.currentUser) {
        await signInFirebaseWithGoogleToken(
          result.access_token,
          result.id_token
        );
      }

      return true;
    } catch (error) {
      console.error("Google refresh token failed", error);
      expireStoredToken();
      return false;
    } finally {
      driveTokenRefreshPromise = null;
    }
  })();

  return driveTokenRefreshPromise;
}

async function ensureDriveAccessToken() {
  if (demo) return;
  if (restoreStoredToken(30_000)) return;
  if (await refreshDriveToken()) return;
  await beginOfflineOAuth();
}

async function logout() {
  clearSession();
  await firebaseSignOut(auth);
  rootFolderId = "";
  entries = [];
  currentFolder = null;
  currentFile = null;
  currentContent = "";
  clearListingCaches();
  sidebarExpanded.clear();
  sidebarLoading.clear();
  syncedContentByFile.clear();
  fileSaveQueues.clear();
  sidebarOpen = false;
  history.replaceState({}, "", withDemo("/"));
  renderLogin();
}

function toast(message: string) {
  document.querySelector(".toast")?.remove();
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 1400);
}

async function authorize() {
  if (demo) return;
  await beginOfflineOAuth();
}

async function api(url: string, init: RequestInit = {}) {
  await ensureDriveAccessToken();

  const request = async () => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", "Bearer " + accessToken);
    return fetch(url, { ...init, headers });
  };

  let response = await request();

  if (response.status === 401) {
    expireStoredToken();

    if (!(await refreshDriveToken())) {
      await beginOfflineOAuth();
    }

    response = await request();
  }

  if (!response.ok) throw new Error(await response.text());
  return response;
}
function q(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function getEntry(id: string): Promise<DriveEntry> {
  if (demo) {
    const node = demoNodes.find(item => item.id === id);
    if (!node) throw new Error("Not found");
    return {
      id: node.id,
      name: node.name,
      mimeType: node.mimeType,
      modifiedTime: node.modifiedTime,
      parents: node.parentId ? [node.parentId] : []
    };
  }

  const response = await api(
    "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(id) +
      "?fields=id,name,mimeType,modifiedTime,parents"
  );
  return response.json() as Promise<DriveEntry>;
}

async function ensureRootFolder() {
  if (demo) {
    rootFolderId = "demo-root";
    return;
  }

  const params = new URLSearchParams({
    q: "mimeType='" + FOLDER_MIME + "' and name='secrets' and 'root' in parents and trashed=false",
    fields: "files(id,name,mimeType,modifiedTime,parents)",
    pageSize: "1"
  });
  const response = await api("https://www.googleapis.com/drive/v3/files?" + params);
  const data = await response.json() as { files?: DriveEntry[] };

  if (data.files?.[0]) {
    rootFolderId = data.files[0].id;
    return;
  }

  const created = await api("https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "secrets", mimeType: FOLDER_MIME })
  });
  rootFolderId = ((await created.json()) as DriveEntry).id;
}

async function directChildren(folderId: string): Promise<DriveEntry[]> {
  if (demo) {
    const children = demoNodes
      .filter(node => node.parentId === folderId)
      .map(node => ({
        id: node.id,
        name: node.name,
        mimeType: node.mimeType,
        modifiedTime: node.modifiedTime,
        parents: node.parentId ? [node.parentId] : []
      }));
    cacheChildren(folderId, children);
    return children;
  }

  const children: DriveEntry[] = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      q: "'" + q(folderId) + "' in parents and trashed=false",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,parents)",
      pageSize: "1000"
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await api("https://www.googleapis.com/drive/v3/files?" + params);
    const data = await response.json() as { files?: DriveEntry[]; nextPageToken?: string };
    children.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  cacheChildren(folderId, children);
  return children;
}

async function folderHasMarkdown(folderId: string, memo = new Map<string, boolean>()): Promise<boolean> {
  if (memo.has(folderId)) return memo.get(folderId)!;

  memo.set(folderId, false);
  const children = await directChildren(folderId);

  if (children.some(entry => entry.mimeType !== FOLDER_MIME && entry.name.toLowerCase().endsWith(".md"))) {
    memo.set(folderId, true);
    return true;
  }

  for (const child of children) {
    if (child.mimeType !== FOLDER_MIME) continue;
    if (await folderHasMarkdown(child.id, memo)) {
      memo.set(folderId, true);
      return true;
    }
  }

  return false;
}

async function buildVisibleFolderListing(folder: DriveEntry) {
  const children = await directChildren(folder.id);
  const memo = new Map<string, boolean>();
  const visible: DriveEntry[] = [];

  for (const entry of children) {
    if (entry.mimeType === FOLDER_MIME) {
      if (await folderHasMarkdown(entry.id, memo)) visible.push(entry);
      continue;
    }

    if (entry.name.toLowerCase().endsWith(".md")) visible.push(entry);
  }

  return sidebarVisibleEntries(visible);
}

function sameEntryList(a: DriveEntry[], b: DriveEntry[]) {
  if (a.length !== b.length) return false;
  return a.every((entry, index) =>
    entry.id === b[index]?.id &&
    entry.name === b[index]?.name &&
    entry.mimeType === b[index]?.mimeType &&
    entry.modifiedTime === b[index]?.modifiedTime
  );
}

async function refreshFolderListing(folder: DriveEntry) {
  try {
    const fresh = await buildVisibleFolderListing(folder);
    writeJsonCache(visibleFolderCacheKey(folder.id), {
      updatedAt: Date.now(),
      entries: fresh
    } satisfies FolderCacheRecord);

    if (currentFolder?.id === folder.id && !sameEntryList(entries, fresh)) {
      entries = fresh;
      renderFolder();
    }
  } catch (error) {
    console.error("Folder refresh failed", error);
  }
}

async function listFolder(folder: DriveEntry) {
  currentFolder = folder;

  const cached = readJsonCache<FolderCacheRecord>(visibleFolderCacheKey(folder.id));
  if (cached && Array.isArray(cached.entries)) {
    entries = sidebarVisibleEntries(cached.entries);
    if (Date.now() - (cached.updatedAt || 0) >= CACHE_REFRESH_MS) {
      void refreshFolderListing(folder);
    }
    return;
  }

  entries = await buildVisibleFolderListing(folder);
  writeJsonCache(visibleFolderCacheKey(folder.id), {
    updatedAt: Date.now(),
    entries
  } satisfies FolderCacheRecord);
}

async function readFile(file: DriveEntry) {
  if (demo) {
    const content = demoNodes.find(node => node.id === file.id)?.content || "";
    cacheFile(file.id, content);
    return content;
  }

  const response = await api(
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) + "?alt=media"
  );
  const content = await response.text();
  cacheFile(file.id, content);
  return content;
}

async function refreshOpenedFile(file: DriveEntry) {
  if (fileSaveQueues.has(file.id)) return;

  try {
    const fresh = await readFile(file);
    syncedContentByFile.set(file.id, fresh);
    cacheFile(file.id, fresh);

    if (
      currentFile?.id === file.id &&
      !fileSaveQueues.has(file.id) &&
      currentContent !== fresh
    ) {
      currentContent = fresh;
      editing = null;
      renderFile();
    }
  } catch (error) {
    console.error("File refresh failed", error);
  }
}

async function saveFile(file: DriveEntry, text: string) {
  if (demo) {
    const node = demoNodes.find(item => item.id === file.id);
    if (node) {
      node.content = text;
      node.modifiedTime = new Date().toISOString();
    }
    return;
  }

  await api(
    "https://www.googleapis.com/upload/drive/v3/files/" +
      encodeURIComponent(file.id) +
      "?uploadType=media",
    {
      method: "PATCH",
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
      body: text
    }
  );
}

function renderLogin() {
  const reconnect = Boolean(auth.currentUser);
  app.innerHTML =
    '<div class="login-shell"><div class="login-actions">' +
      '<button class="icon-btn primary large" id="login" title="' +
        (reconnect ? "Reconnect Google Drive" : "Sign in with Google") +
      '" aria-label="' +
        (reconnect ? "Reconnect Google Drive" : "Sign in with Google") +
      '">' + icons.drive + '</button>' +
    '</div></div>';

  document.querySelector("#login")?.addEventListener("click", connect);
}

function parentRoute(entry: DriveEntry | null) {
  const parentId = entry?.parents?.[0];
  if (!parentId) return null;
  return getEntry(parentId).then(routeFor);
}

function renderFolder() {
  if (!currentFolder) return;

  const needle = filter.trim().toLowerCase();
  const shown = entries.filter(entry => !needle || entry.name.toLowerCase().includes(needle));
  const isRoot = currentFolder.id === rootFolderId;
  const canGoBack = !isRoot && Boolean(currentFolder.parents?.[0]);
  const theme = selectedTheme();
  const folderTitle = isRoot ? "Secrets Keep" : currentFolder.name;

  app.innerHTML =
    '<main class="shell">' +
      '<header class="folder-topbar' + (isRoot ? ' root-topbar' : '') + '">' +
        (canGoBack
          ? '<button class="icon-btn ghost" id="back" aria-label="Back">' + icons.back + '</button>'
          : '<span class="topbar-spacer"></span>') +
        '<div class="folder-name">' + esc(folderTitle) + '</div>' +
        (isRoot
          ? '<div class="root-controls">' +
              '<div class="theme-buttons" role="group" aria-label="Theme">' +
                '<button class="icon-btn ghost theme-btn' + (theme === "system" ? " active" : "") + '" type="button" data-theme-mode="system" title="System theme" aria-label="System theme">' + icons.themeSystem + '</button>' +
                '<button class="icon-btn ghost theme-btn' + (theme === "light" ? " active" : "") + '" type="button" data-theme-mode="light" title="Light theme" aria-label="Light theme">' + icons.themeLight + '</button>' +
                '<button class="icon-btn ghost theme-btn' + (theme === "dark" ? " active" : "") + '" type="button" data-theme-mode="dark" title="Dark theme" aria-label="Dark theme">' + icons.themeDark + '</button>' +
              '</div>' +
              '<button class="icon-btn ghost" id="logout" title="Logout" aria-label="Logout">' + icons.logout + '</button>' +
            '</div>'
          : '<span class="topbar-spacer"></span>') +
      '</header>' +
      '<div class="search">' + icons.search +
        '<input id="search" autocomplete="off" spellcheck="false" value="' + esc(filter) + '" aria-label="Search">' +
      '</div>' +
      '<div class="file-list">' +
        shown.map(entry => {
          const isFolder = entry.mimeType === FOLDER_MIME;
          return '<a class="file-row" data-id="' + esc(entry.id) + '" href="' + esc(withDemo(routeFor(entry))) + '">' +
            '<span class="file-icon">' + (isFolder ? icons.folder : icons.file) + '</span>' +
            '<span class="file-name">' + esc(isFolder ? entry.name : entry.name.replace(/\.md$/i, "")) + '</span>' +
          '</a>';
        }).join("") +
      '</div>' +
    '</main>';

  document.querySelector("#back")?.addEventListener("click", async () => {
    const route = await parentRoute(currentFolder);
    if (route) navigate(route);
  });

  document.querySelectorAll<HTMLButtonElement>("[data-theme-mode]").forEach(button => {
    button.addEventListener("click", () => {
      const value = button.dataset.themeMode;
      if (value !== "system" && value !== "light" && value !== "dark") return;
      applyTheme(value);
      renderFolder();
    });
  });

  document.querySelector("#logout")?.addEventListener("click", () => {
    void logout();
  });

  const input = document.querySelector<HTMLInputElement>("#search")!;
  input.addEventListener("input", () => {
    filter = input.value;
    renderFolder();
    const next = document.querySelector<HTMLInputElement>("#search")!;
    next.focus();
    next.setSelectionRange(filter.length, filter.length);
  });

  document.querySelectorAll<HTMLElement>("[data-id]").forEach(row => {
    row.addEventListener("click", event => {
      if (event instanceof MouseEvent && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
      event.preventDefault();
      const entry = entries.find(item => item.id === row.dataset.id);
      if (entry) navigate(routeFor(entry));
    });
  });
}

function renderedMarkdown(source: string) {
  return DOMPurify.sanitize(String(marked.parse(source)));
}

function normalizeNestedCodeIndent(source: string) {
  const lines = source.split("\n");
  const itemStack: string[] = [];

  const popToParentForIndent = (indentLength: number) => {
    while (itemStack.length && itemStack[itemStack.length - 1].length >= indentLength) {
      itemStack.pop();
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^ {0,3}#{1,6}[ \t]+/.test(line)) {
      itemStack.length = 0;
      continue;
    }

    const item = line.match(/^(\s*)-\s+\*\*.+?\*\*\s*$/);
    if (item) {
      popToParentForIndent(item[1].length);
      itemStack.push(item[1]);
      continue;
    }

    if (!line.trim()) continue;

    const opening = line.match(/^(\s*)(\x60{3,})([^\x60]*)$/);
    if (opening) {
      const currentIndent = opening[1];
      popToParentForIndent(currentIndent.length);

      if (!itemStack.length) {
        const marker = opening[2];
        for (let scan = index + 1; scan < lines.length; scan += 1) {
          if (lines[scan] === currentIndent + marker) {
            index = scan;
            break;
          }
        }
        continue;
      }

      const ownerIndent = itemStack[itemStack.length - 1];
      const wantedIndent = ownerIndent + "  ";
      const marker = opening[2];

      lines[index] = wantedIndent + line.slice(currentIndent.length);

      for (let scan = index + 1; scan < lines.length; scan += 1) {
        const scanLine = lines[scan];

        if (scanLine.startsWith(currentIndent)) {
          lines[scan] = wantedIndent + scanLine.slice(currentIndent.length);
        }

        if (scanLine === currentIndent + marker) {
          index = scan;
          break;
        }
      }

      continue;
    }

    const indentLength = line.match(/^ */)?.[0].length || 0;
    popToParentForIndent(indentLength);
  }

  return lines.join("\n");
}

async function formatMarkdown(source: string) {
  const [prettier, markdownPlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/markdown")
  ]);
  const normalizedSource = normalizeNestedCodeIndent(source);
  const formatted = await prettier.format(normalizedSource, {
    parser: "markdown",
    plugins: [markdownPlugin],
    proseWrap: "preserve"
  });
  return normalizeNestedCodeIndent(formatted);
}

function isThematicBreak(line: string) {
  const leading = line.match(/^ */)?.[0].length || 0;
  if (leading > 3) return false;

  const trimmed = line.trim();
  return (
    /^(?:\*(?:[ \t]*\*){2,})$/.test(trimmed) ||
    /^(?:-(?:[ \t]*-){2,})$/.test(trimmed) ||
    /^(?:_(?:[ \t]*_){2,})$/.test(trimmed)
  );
}

function isManagedLine(line: string) {
  return (
    /^ {0,3}#{1,6}[ \t]+.+/.test(line) ||
    /^\s*-\s+\*\*.+?\*\*\s*$/.test(line) ||
    /^\s*\x60{3,}[^\x60]*$/.test(line) ||
    isThematicBreak(line)
  );
}
function nextLineEnd(source: string, start: number) {
  const newline = source.indexOf("\n", start);
  return newline < 0 ? source.length : newline + 1;
}

function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let position = 0;

  while (position < source.length) {
    const end = nextLineEnd(source, position);
    const rawLine = source.slice(position, end);
    const line = rawLine.replace(/\n$/, "");

    const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/);
    if (heading) {
      blocks.push({
        id: "heading-" + position,
        type: "heading",
        start: position,
        end,
        raw: rawLine,
        level: heading[1].length,
        value: heading[2]
      });
      position = end;
      continue;
    }

    if (isThematicBreak(line)) {
      blocks.push({
        id: "divider-" + position,
        type: "divider",
        start: position,
        end,
        raw: rawLine,
        value: line.trim()
      });
      position = end;
      continue;
    }

    const item = line.match(/^(\s*)-\s+\*\*(.+?)\*\*\s*$/);
    if (item) {
      blocks.push({
        id: "item-" + position,
        type: "item",
        start: position,
        end,
        raw: rawLine,
        indent: item[1],
        value: item[2]
      });
      position = end;
      continue;
    }

    const opening = line.match(/^(\s*)(\x60{3,})([^\x60]*)$/);
    if (opening) {
      const indent = opening[1];
      const marker = opening[2];
      const language = opening[3].trim();
      const codeStart = end;
      let scan = end;
      let closeStart = source.length;
      let closeEnd = source.length;

      while (scan < source.length) {
        const scanEnd = nextLineEnd(source, scan);
        const scanLine = source.slice(scan, scanEnd).replace(/\n$/, "");
        if (scanLine === indent + marker) {
          closeStart = scan;
          closeEnd = scanEnd;
          break;
        }
        scan = scanEnd;
      }

      const codeSource = source.slice(codeStart, closeStart);
      const codeValue = codeSource
        .split("\n")
        .map(codeLine => codeLine.startsWith(indent) ? codeLine.slice(indent.length) : codeLine)
        .join("\n")
        .replace(/\n$/, "");

      blocks.push({
        id: "code-" + position,
        type: "code",
        start: position,
        end: closeEnd,
        raw: source.slice(position, closeEnd),
        indent,
        value: codeValue,
        language
      });
      position = closeEnd;
      continue;
    }

    let scan = end;
    while (scan < source.length) {
      const scanEnd = nextLineEnd(source, scan);
      const scanLine = source.slice(scan, scanEnd).replace(/\n$/, "");
      if (isManagedLine(scanLine)) break;
      scan = scanEnd;
    }
    const raw = source.slice(position, scan);
    const rawLines = raw.replace(/\n$/, "").split("\n");
    const nonBlankLines = rawLines.filter(rawLine => rawLine.trim());
    const otherIndentLength = nonBlankLines.length
      ? Math.min(...nonBlankLines.map(rawLine => rawLine.match(/^ */)?.[0].length || 0))
      : 0;
    const otherIndent = " ".repeat(otherIndentLength);
    const otherValue = rawLines
      .map(rawLine => rawLine.trim() && rawLine.startsWith(otherIndent)
        ? rawLine.slice(otherIndent.length)
        : rawLine)
      .join("\n")
      .trimEnd();

    blocks.push({
      id: "other-" + position,
      type: "other",
      start: position,
      end: scan,
      raw,
      indent: otherIndent,
      value: otherValue
    });
    position = scan;
  }

  return blocks;
}

function actionButton(action: string, iconName: keyof typeof icons, title: string, blockId = "") {
  return '<button class="block-action" type="button" data-action="' + action + '"' +
    (blockId ? ' data-block="' + esc(blockId) + '"' : "") +
    ' title="' + esc(title) + '" aria-label="' + esc(title) + '">' +
    icons[iconName] +
  '</button>';
}

function renderEditActions() {
  return '<div class="edit-actions">' +
    actionButton("save-edit", "save", "Save") +
    actionButton("cancel-edit", "cancel", "Cancel") +
    actionButton("delete-edit", "trash", "Delete") +
  '</div>';
}

function renderContentModeSwitch(state: EditState) {
  if (state.type !== "code" && state.type !== "other") return "";

  return '<div class="content-mode-switch" role="group" aria-label="Content type">' +
    '<button type="button" data-action="set-content-mode" data-kind="code" class="' + (state.type === "code" ? "active" : "") + '">' +
      icons.code + '<span>Code</span>' +
    '</button>' +
    '<button type="button" data-action="set-content-mode" data-kind="other" class="' + (state.type === "other" ? "active" : "") + '">' +
      '<span class="md-mark">MD</span><span>Markdown</span>' +
    '</button>' +
  '</div>';
}

function renderCodeFooter(state: EditState) {
  return '<div class="code-editor-footer">' +
    '<input class="language-input" data-edit-language autocomplete="off" spellcheck="false" placeholder="language" value="' + esc(state.language || "") + '" aria-label="Code language">' +
  '</div>';
}
function renderBlockEditor(state: EditState) {
  const nested = (state.indent || "").length >= 2 ? " nested-block" : "";

  if (state.type === "code") {
    return '<div class="block-editor code-editor-block' + nested + '">' +
      renderContentModeSwitch(state) +
      '<textarea class="block-code-input" data-edit-value spellcheck="false" placeholder="code">' + esc(state.value) + '</textarea>' +
      renderCodeFooter(state) +
      renderEditActions() +
    '</div>';
  }

  if (state.type === "other") {
    return '<div class="block-editor raw-editor-block">' +
      renderContentModeSwitch(state) +
      '<textarea class="block-code-input" data-edit-value spellcheck="false" placeholder="Raw Markdown">' + esc(state.value) + '</textarea>' +
      renderEditActions() +
    '</div>';
  }

  if (state.type === "item") {
    return '<div class="block-editor item-editor-block">' +
      '<span class="syntax-prefix">- **</span>' +
      '<input class="block-input" data-edit-value autocomplete="off" spellcheck="false" value="' + esc(state.value) + '">' +
      '<span class="syntax-prefix">**</span>' +
      renderEditActions() +
    '</div>';
  }

  const level = Math.max(1, Math.min(6, state.level || 1));
  return '<div class="block-editor heading-editor-block level-' + level + '">' +
    '<span class="syntax-prefix">' + "#".repeat(level) + '</span>' +
    '<input class="block-input" data-edit-value autocomplete="off" spellcheck="false" value="' + esc(state.value) + '">' +
    renderEditActions() +
  '</div>';
}

function renderHeadingBlock(block: MarkdownBlock, childrenHtml: string) {
  const editingThis = editing?.mode === "edit" && editing.blockId === block.id;
  const main = editingThis
    ? renderBlockEditor(editing!)
    : '<div class="block-content">' + renderedMarkdown(block.raw) + '</div>';

  const actions = editingThis
    ? ""
    : '<div class="block-actions">' +
        actionButton("edit", "edit", "Edit", block.id) +
        actionButton("child-branch", "branch", "Create branch", block.id) +
        actionButton("add-item", "plus", "Add item", block.id) +
        actionButton("add-code", "code", "Add code block", block.id) +
        actionButton("move", "move", "Move", block.id) +
      '</div>';

  return '<section class="managed-block heading-block level-' + block.level + '" data-source-block="' + block.id + '">' +
    '<div class="branch-head">' + main + actions + '</div>' +
    '<div class="branch-children">' + childrenHtml + '</div>' +
  '</section>';
}

function renderItemBlock(block: MarkdownBlock, childrenHtml: string) {
  const editingThis = editing?.mode === "edit" && editing.blockId === block.id;
  const main = editingThis
    ? renderBlockEditor(editing!)
    : '<div class="block-content">' + renderedMarkdown(block.raw) + '</div>';

  const actions = editingThis
    ? ""
    : '<div class="block-actions">' +
        actionButton("edit", "edit", "Edit", block.id) +
        actionButton("item-code", "code", "Add code block", block.id) +
        actionButton("move", "move", "Move", block.id) +
      '</div>';

  return '<section class="managed-block item-block" data-source-block="' + block.id + '">' +
    '<div class="item-head">' + main + actions + '</div>' +
    '<div class="item-children">' + childrenHtml + '</div>' +
  '</section>';
}

function renderManagedBlock(block: MarkdownBlock) {
  if (editing?.mode === "edit" && editing.blockId === block.id) {
    return renderBlockEditor(editing);
  }

  if (block.type === "code") {
    const nested = (block.indent || "").length >= 2 ? " nested-block" : "";
    const language = (block.language || "").trim();
    const languageClass = language
      ? "language-" + language.replace(/[^a-zA-Z0-9_-]+/g, "-")
      : "";

    return '<section class="managed-block code-shell' + nested + '" data-source-block="' + block.id + '">' +
      '<pre><code class="' + esc(languageClass) + '">' + esc(block.value || "") + '</code></pre>' +
      '<div class="block-actions code-actions">' +
        (language ? '<span class="code-language-label">' + esc(language) + '</span>' : "") +
        actionButton("copy", "copy", "Copy", block.id) +
        actionButton("edit", "edit", "Edit", block.id) +
        actionButton("move", "move", "Move", block.id) +
      '</div>' +
    '</section>';
  }

  if (block.type === "divider") {
    return '<section class="managed-block divider-block" data-source-block="' + block.id + '">' +
      '<hr>' +
      '<div class="block-actions">' +
        actionButton("edit", "edit", "Edit", block.id) +
        actionButton("move", "move", "Move", block.id) +
      '</div>' +
    '</section>';
  }

  return '<section class="managed-block raw-block" data-source-block="' + block.id + '">' +
    '<div class="block-content">' + renderedMarkdown(block.value ?? block.raw) + '</div>' +
    '<div class="block-actions">' +
      actionButton("edit", "edit", "Edit", block.id) +
      actionButton("move", "move", "Move", block.id) +
    '</div>' +
  '</section>';
}
function renderDocumentBlocks() {
  const blocks = parseMarkdownBlocks(currentContent);

  const renderItemGroup = (index: number): { html: string; next: number } => {
    const item = blocks[index];
    const range = blockMoveRange(item, blocks);
    let childHtml = "";
    let next = index + 1;

    while (next < blocks.length && blocks[next].start < range.end) {
      const child = blocks[next];
      childHtml += renderManagedBlock(child);
      next += 1;
    }

    if (
      editing?.mode === "new" &&
      editing.parentBlockId === item.id &&
      editing.insertAt === range.end
    ) {
      childHtml += renderBlockEditor(editing);
    }

    return {
      html: renderItemBlock(item, childHtml),
      next
    };
  };

  const renderBranch = (index: number): { html: string; next: number } => {
    const heading = blocks[index];
    const level = heading.level || 1;
    let childHtml = "";
    let next = index + 1;

    while (next < blocks.length) {
      const block = blocks[next];

      if (block.type === "divider") break;

      if (block.type === "heading") {
        const childLevel = block.level || 1;
        if (childLevel <= level) break;

        const child = renderBranch(next);
        childHtml += child.html;
        next = child.next;
        continue;
      }

      if (block.type === "item") {
        const item = renderItemGroup(next);
        childHtml += item.html;
        next = item.next;
        continue;
      }

      childHtml += renderManagedBlock(block);
      next += 1;
    }

    const range = blockMoveRange(heading, blocks);
    if (
      editing?.mode === "new" &&
      editing.parentBlockId === heading.id &&
      editing.insertAt === range.end
    ) {
      childHtml += renderBlockEditor(editing);
    }

    return {
      html: renderHeadingBlock(heading, childHtml),
      next
    };
  };

  let html = "";
  let index = 0;

  if (editing?.mode === "new" && editing.insertAt === 0) {
    html += renderBlockEditor(editing);
  }

  while (index < blocks.length) {
    const block = blocks[index];

    if (block.type === "heading") {
      const branch = renderBranch(index);
      html += branch.html;
      index = branch.next;
      continue;
    }

    if (block.type === "item") {
      const item = renderItemGroup(index);
      html += item.html;
      index = item.next;
      continue;
    }

    html += renderManagedBlock(block);

    index += 1;
  }

  if (
    editing?.mode === "new" &&
    !editing.parentBlockId &&
    currentContent.length > 0 &&
    editing.insertAt === currentContent.length
  ) {
    html += renderBlockEditor(editing);
  }

  return html;
}
function startNewBlock(type: EditState["type"], insertAt: number, options: Partial<EditState> = {}) {
  editing = {
    mode: "new",
    type,
    insertAt,
    level: options.level,
    indent: options.indent || "",
    parentIndent: options.parentIndent,
    parentBlockId: options.parentBlockId,
    value: "",
    language: ""
  };
  renderFile();
}
function startEditBlock(block: MarkdownBlock) {
  const blocks = parseMarkdownBlocks(currentContent);
  const parentItem = blocks.find(candidate => {
    if (candidate.type !== "item" || candidate.id === block.id) return false;
    const range = blockMoveRange(candidate, blocks);
    return block.start > candidate.start && block.start < range.end;
  });

  editing = {
    mode: "edit",
    type: block.type === "divider" ? "other" : block.type,
    blockId: block.id,
    insertAt: block.start,
    level: block.level,
    indent: block.indent || "",
    parentIndent: parentItem?.indent,
    value: block.value ?? block.raw.trimEnd(),
    language: block.language || ""
  };
  renderFile();
}

function codeFenceFor(value: string) {
  let max = 2;
  for (const match of value.matchAll(/\x60+/g)) max = Math.max(max, match[0].length);
  return String.fromCharCode(96).repeat(max + 1);
}

function serializeEdit(state: EditState) {
  if (state.type === "other") {
    const value = state.value.trimEnd();
    if (!value) throw new Error("Markdown required");
    const indent = state.indent || "";
    return value
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(line => line ? indent + line : "")
      .join("\n") + "\n";
  }

  if (state.type === "heading") {
    const value = state.value.trim();
    if (!value) throw new Error("Heading name required");
    return "#".repeat(Math.max(1, Math.min(6, state.level || 1))) + " " + value + "\n";
  }

  if (state.type === "item") {
    const value = state.value.trim();
    if (!value) throw new Error("Item name required");
    return (state.indent || "") + "- **" + value + "**\n";
  }

  const indent = state.indent || "";
  const marker = codeFenceFor(state.value);
  const language = state.language?.trim() || "";
  const clean = state.value.replace(/\r\n/g, "\n").replace(/\n$/, "");
  const body = clean
    ? clean.split("\n").map(line => indent + line).join("\n") + "\n"
    : "";

  return indent + marker + language + "\n" + body + indent + marker + "\n";
}
function insertMarkdownBlock(source: string, at: number, block: string) {
  const before = source.slice(0, at).replace(/\n*$/, "");
  const after = source.slice(at).replace(/^\n*/, "");
  return before +
    (before ? "\n\n" : "") +
    block.trimEnd() +
    (after ? "\n\n" + after : "\n");
}

function queueFileSave(file: DriveEntry, content: string) {
  const previous = fileSaveQueues.get(file.id) || Promise.resolve();

  const next = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        await saveFile(file, content);
        syncedContentByFile.set(file.id, content);
        cacheFile(file.id, content);
      } catch (error) {
        console.error("Drive save failed", error);

        const rollback = syncedContentByFile.get(file.id);
        const isLatest = fileSaveQueues.get(file.id) === next;

        if (rollback !== undefined && isLatest) {
          cacheFile(file.id, rollback);

          if (currentFile?.id === file.id && currentContent === content) {
            currentContent = rollback;
            editing = null;
            renderFile();
            toast("Save failed — reverted");
          }
        }
      }
    })
    .finally(() => {
      if (fileSaveQueues.get(file.id) === next) {
        fileSaveQueues.delete(file.id);
      }
    });

  fileSaveQueues.set(file.id, next);
}

async function persistContent(source: string) {
  if (!currentFile) return;

  const file = currentFile;
  const formatted = await formatMarkdown(source);

  if (!syncedContentByFile.has(file.id)) {
    syncedContentByFile.set(file.id, currentContent);
  }

  currentContent = formatted;
  cacheFile(file.id, formatted);
  editing = null;
  renderFile();
  queueFileSave(file, formatted);
}

async function saveEditing() {
  if (!editing) return;

  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>("[data-edit-value]");
  if (input) editing.value = input.value;

  const languageInput = document.querySelector<HTMLInputElement>("[data-edit-language]");
  if (languageInput && editing.type === "code") {
    editing.language = languageInput.value.trim().replace(/\s+/g, "-");
  }

  let source = currentContent;
  const replacement = serializeEdit(editing);

  if (editing.mode === "new") {
    source = insertMarkdownBlock(source, editing.insertAt, replacement);
  } else {
    const block = parseMarkdownBlocks(currentContent).find(item => item.id === editing?.blockId);
    if (!block) throw new Error("Block not found");
    source = source.slice(0, block.start) + replacement + source.slice(block.end);
  }

  await persistContent(source);
}

function nearestStructuralParent(
  block: MarkdownBlock,
  blocks: MarkdownBlock[]
): MarkdownBlock | null {
  let owner: MarkdownBlock | null = null;

  for (const candidate of blocks) {
    if (candidate.id === block.id) continue;
    if (candidate.type !== "heading" && candidate.type !== "item") continue;
    if (candidate.start >= block.start) continue;

    const range = blockMoveRange(candidate, blocks);
    if (block.start >= range.end) continue;

    if (
      !owner ||
      candidate.start > owner.start ||
      (
        candidate.start === owner.start &&
        candidate.type === "item" &&
        owner.type === "heading"
      )
    ) {
      owner = candidate;
    }
  }

  return owner;
}

function deleteWithOwnedContent(block: MarkdownBlock, blocks: MarkdownBlock[]) {
  const removable = new Set<string>([block.id]);
  const replacements = new Map<string, string>();

  if (block.type === "heading" || block.type === "item") {
    for (const candidate of blocks) {
      if (candidate.type !== "code" && candidate.type !== "other") continue;
      const owner = nearestStructuralParent(candidate, blocks);
      if (owner?.id === block.id) removable.add(candidate.id);
    }
  }

  if (block.type === "heading") {
    const range = blockMoveRange(block, blocks);

    for (const candidate of blocks) {
      if (
        candidate.type !== "heading" ||
        candidate.id === block.id ||
        candidate.start <= block.start ||
        candidate.start >= range.end
      ) {
        continue;
      }

      replacements.set(
        candidate.id,
        candidate.raw.replace(
          /^( {0,3})#{2,6}([ 	]+)/,
          (_match, indent: string, gap: string) =>
            indent + "#".repeat(Math.max(1, (candidate.level || 1) - 1)) + gap
        )
      );
    }
  }

  const operations = blocks
    .filter(candidate => removable.has(candidate.id) || replacements.has(candidate.id))
    .map(candidate => ({
      start: candidate.start,
      end: candidate.end,
      text: removable.has(candidate.id) ? "" : replacements.get(candidate.id) || candidate.raw
    }))
    .sort((a, b) => b.start - a.start);

  let output = currentContent;

  for (const operation of operations) {
    output = output.slice(0, operation.start) + operation.text + output.slice(operation.end);
  }

  return output;
}

async function deleteEditing() {
  if (!editing) return;

  if (editing.mode === "new") {
    editing = null;
    renderFile();
    return;
  }

  const blocks = parseMarkdownBlocks(currentContent);
  const block = blocks.find(item => item.id === editing?.blockId);
  if (!block) return;

  const source = deleteWithOwnedContent(block, blocks);
  await persistContent(source);
}

function setContentMode(kind: "code" | "other") {
  if (!editing) return;

  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>("[data-edit-value]");
  if (input) editing.value = input.value;

  const languageInput = document.querySelector<HTMLInputElement>("[data-edit-language]");
  if (languageInput) editing.language = languageInput.value.trim().replace(/\s+/g, "-");

  editing.type = kind;

  if (editing.parentIndent !== undefined) {
    editing.indent = editing.parentIndent + "  ";
  } else {
    editing.indent = "";
  }

  renderFile();
}

function handleBlockAction(action: string, blockId: string) {
  const blocks = parseMarkdownBlocks(currentContent);
  const block = blockId ? blocks.find(item => item.id === blockId) : undefined;

  if (action === "new-heading") {
    startNewBlock("heading", currentContent.length, { level: 1 });
    return;
  }
  if (action === "new-item") {
    startNewBlock("item", currentContent.length);
    return;
  }
  if (action === "new-code") {
    startNewBlock("code", currentContent.length);
    return;
  }
  if (action === "edit" && block) {
    startEditBlock(block);
    return;
  }
  if (action === "child-branch" && block?.type === "heading") {
    const range = blockMoveRange(block, blocks);
    startNewBlock("heading", range.end, {
      level: Math.min(6, (block.level || 1) + 1),
      parentBlockId: block.id
    });
    return;
  }
  if (action === "add-item" && block?.type === "heading") {
    const range = blockMoveRange(block, blocks);
    startNewBlock("item", range.end, { parentBlockId: block.id });
    return;
  }
  if (action === "add-code" && block?.type === "heading") {
    const range = blockMoveRange(block, blocks);
    startNewBlock("code", range.end, { parentBlockId: block.id });
    return;
  }
  if (action === "item-code" && block?.type === "item") {
    const range = blockMoveRange(block, blocks);
    startNewBlock("code", range.end, {
      parentIndent: block.indent || "",
      parentBlockId: block.id,
      indent: (block.indent || "") + "  "
    });
    return;
  }
  if (action === "copy" && block?.type === "code") {
    navigator.clipboard.writeText(block.value || "").then(() => toast("Copied"));
  }
}

function blockMoveRange(block: MarkdownBlock, blocks: MarkdownBlock[]) {
  const index = blocks.findIndex(item => item.id === block.id);
  if (index < 0) return { start: block.start, end: block.end };

  if (block.type === "heading") {
    const level = block.level || 1;
    let end = currentContent.length;

    for (let nextIndex = index + 1; nextIndex < blocks.length; nextIndex += 1) {
      const next = blocks[nextIndex];
      if (
        next.type === "divider" ||
        (next.type === "heading" && (next.level || 1) <= level)
      ) {
        end = next.start;
        break;
      }
    }

    return { start: block.start, end };
  }
  if (block.type === "item") {
    const baseIndent = (block.indent || "").length;
    const minimumCodeIndent = baseIndent + 2;
    const minimumRawIndent = baseIndent + 2;
    let end = block.end;
    let indexAfter = index + 1;

    while (indexAfter < blocks.length) {
      const next = blocks[indexAfter];

      if (next.type === "other" && next.raw.trim() === "") {
        const following = blocks[indexAfter + 1];
        const nestedFollowing =
          (following?.type === "code" && (following.indent || "").length >= minimumCodeIndent) ||
          (following?.type === "other" && (following.indent || "").length >= minimumRawIndent);
        if (nestedFollowing) {
          end = next.end;
          indexAfter += 1;
          continue;
        }
        break;
      }

      if (next.type === "code" && (next.indent || "").length >= minimumCodeIndent) {
        end = next.end;
        indexAfter += 1;
        continue;
      }

      if (next.type === "other" && (next.indent || "").length >= minimumRawIndent) {
        end = next.end;
        indexAfter += 1;
        continue;
      }

      break;
    }

    return { start: block.start, end };
  }

  return { start: block.start, end: block.end };
}

function reindentCodeSource(raw: string, fromIndent: string, toIndent: string) {
  return raw
    .split("\n")
    .map(line => {
      if (!line) return line;
      const without = fromIndent && line.startsWith(fromIndent) ? line.slice(fromIndent.length) : line;
      return toIndent + without;
    })
    .join("\n");
}

type DropMode = "before" | "inside" | "after";

function shiftHeadingSubtree(
  raw: string,
  source: MarkdownBlock,
  sourceRange: { start: number; end: number },
  blocks: MarkdownBlock[],
  desiredRootLevel: number
) {
  if (source.type !== "heading") return raw;

  const headings = blocks.filter(block =>
    block.type === "heading" &&
    block.start >= sourceRange.start &&
    block.start < sourceRange.end
  );

  const levels = headings.map(block => block.level || 1);
  if (!levels.length) return raw;

  const requestedDelta = desiredRootLevel - (source.level || 1);
  const minDelta = 1 - Math.min(...levels);
  const maxDelta = 6 - Math.max(...levels);
  const delta = Math.max(minDelta, Math.min(maxDelta, requestedDelta));
  if (!delta) return raw;

  let output = raw;

  for (const heading of [...headings].reverse()) {
    const relativeStart = heading.start - sourceRange.start;
    const relativeEnd = heading.end - sourceRange.start;
    const shifted = heading.raw.replace(
      /^( {0,3})#{1,6}([ \t]+)/,
      (_match, indent: string, gap: string) =>
        indent + "#".repeat((heading.level || 1) + delta) + gap
    );
    output = output.slice(0, relativeStart) + shifted + output.slice(relativeEnd);
  }

  return output;
}

function owningHeadingForBlock(target: MarkdownBlock, blocks: MarkdownBlock[]) {
  let owner: MarkdownBlock | null = null;

  for (const candidate of blocks) {
    if (candidate.type !== "heading" || candidate.id === target.id) continue;

    const range = blockMoveRange(candidate, blocks);
    if (target.start <= candidate.start || target.start >= range.end) continue;

    if (
      !owner ||
      (candidate.level || 1) > (owner.level || 1) ||
      ((candidate.level || 1) === (owner.level || 1) && candidate.start > owner.start)
    ) {
      owner = candidate;
    }
  }

  return owner;
}

function desiredHeadingLevelForDrop(
  target: MarkdownBlock,
  mode: DropMode,
  blocks: MarkdownBlock[]
) {
  if (target.type === "heading") {
    return mode === "inside"
      ? Math.min(6, (target.level || 1) + 1)
      : (target.level || 1);
  }

  const owner = owningHeadingForBlock(target, blocks);
  return owner ? Math.min(6, (owner.level || 1) + 1) : 1;
}

async function moveBlock(sourceId: string, targetId: string, mode: DropMode) {
  const blocks = parseMarkdownBlocks(currentContent);
  const source = blocks.find(block => block.id === sourceId);
  const target = blocks.find(block => block.id === targetId);
  if (!source || !target || source.id === target.id) return;

  const sourceRange = blockMoveRange(source, blocks);
  if (target.start >= sourceRange.start && target.start < sourceRange.end) return;

  const targetRange = blockMoveRange(target, blocks);
  let insertAt = mode === "inside"
    ? targetRange.end
    : mode === "after"
      ? targetRange.end
      : target.start;

  let moving = currentContent.slice(sourceRange.start, sourceRange.end);

  if (source.type === "heading") {
    const desiredLevel = desiredHeadingLevelForDrop(target, mode, blocks);
    moving = shiftHeadingSubtree(moving, source, sourceRange, blocks, desiredLevel);
  }

  if (source.type === "code" && sourceRange.start === source.start && sourceRange.end === source.end) {
    const owningItem = [...blocks]
      .reverse()
      .find(candidate => {
        if (candidate.type !== "item" || candidate.id === source.id) return false;
        const range = blockMoveRange(candidate, blocks);
        return target.start > candidate.start && target.start < range.end;
      });

    const targetIndent =
      mode === "inside" && target.type === "item"
        ? (target.indent || "") + "  "
        : owningItem
          ? (owningItem.indent || "") + "  "
          : "";

    moving = reindentCodeSource(moving, source.indent || "", targetIndent);
  }

  const remaining = currentContent.slice(0, sourceRange.start) + currentContent.slice(sourceRange.end);
  if (insertAt > sourceRange.end) insertAt -= sourceRange.end - sourceRange.start;

  await persistContent(insertMarkdownBlock(remaining, insertAt, moving));
}

function clearDropMarkers() {
  document.querySelectorAll(".drop-before,.drop-inside,.drop-after").forEach(element => {
    element.classList.remove("drop-before", "drop-inside", "drop-after");
    element.removeAttribute("data-drop-mode");
  });
}

function markDragSource(sourceId: string, active: boolean) {
  const element = document.querySelector<HTMLElement>('[data-source-block="' + sourceId + '"]');
  element?.classList.toggle("drag-source", active);
}

function dragLabel(block: MarkdownBlock) {
  const value = (block.value || "").trim().replace(/\s+/g, " ");
  if (value) return value.slice(0, 48);
  if (block.type === "code") return "Code block";
  if (block.type === "item") return "Item";
  if (block.type === "heading") return "Branch";
  return "Block";
}

type ResolvedDrop = {
  id: string;
  mode: DropMode;
  element: HTMLElement;
};

function resolveContainerChildDrop(
  container: HTMLElement,
  childSelector: string,
  y: number,
  byId: Map<string, MarkdownBlock>,
  isAllowed: (block: MarkdownBlock) => boolean
): ResolvedDrop | null {
  const childElements = [...container.querySelectorAll<HTMLElement>(childSelector)]
    .map(element => {
      const id = element.dataset.sourceBlock || "";
      const block = byId.get(id);
      if (!block || !isAllowed(block)) return null;
      return { id, block, element, rect: element.getBoundingClientRect() };
    })
    .filter((child): child is NonNullable<typeof child> => Boolean(child))
    .sort((a, b) => a.rect.top - b.rect.top);

  if (!childElements.length) return null;

  const first = childElements[0];
  if (y < first.rect.top) {
    return { id: first.id, mode: "before", element: first.element };
  }

  for (let index = 1; index < childElements.length; index += 1) {
    const previous = childElements[index - 1];
    const child = childElements[index];

    if (y >= previous.rect.bottom && y <= child.rect.top) {
      const midpoint = (previous.rect.bottom + child.rect.top) / 2;
      return y < midpoint
        ? { id: previous.id, mode: "after", element: previous.element }
        : { id: child.id, mode: "before", element: child.element };
    }
  }

  const last = childElements[childElements.length - 1];
  if (y > last.rect.bottom) {
    return { id: last.id, mode: "after", element: last.element };
  }

  return null;
}

function resolveDropTarget(x: number, y: number, sourceId: string): ResolvedDrop | null {
  const blocks = parseMarkdownBlocks(currentContent);
  const source = blocks.find(block => block.id === sourceId);
  if (!source) return null;

  const sourceRange = blockMoveRange(source, blocks);
  const byId = new Map(blocks.map(block => [block.id, block]));
  const isAllowed = (block: MarkdownBlock) =>
    block.id !== sourceId &&
    !(block.start >= sourceRange.start && block.start < sourceRange.end);

  const candidates = [...document.querySelectorAll<HTMLElement>("[data-source-block]")]
    .map(element => {
      const id = element.dataset.sourceBlock || "";
      const block = byId.get(id);
      if (!block || !isAllowed(block)) return null;

      const rect = element.getBoundingClientRect();
      const containsPoint =
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom;

      if (!containsPoint || rect.width < 2 || rect.height < 2) return null;

      let depth = 0;
      let parent: HTMLElement | null = element.parentElement;
      while (parent) {
        if (parent.matches?.("[data-source-block]")) depth += 1;
        parent = parent.parentElement;
      }

      return {
        id,
        block,
        element,
        rect,
        depth,
        area: rect.width * rect.height
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => b.depth - a.depth || a.area - b.area);

  const direct = candidates[0];

  if (direct) {
    if (direct.block.type === "heading") {
      const positioned = resolveContainerChildDrop(
        direct.element,
        ":scope > .branch-children > [data-source-block]",
        y,
        byId,
        isAllowed
      );
      if (positioned) return positioned;

      return {
        id: direct.id,
        mode: "inside",
        element: direct.element
      };
    }

    if (
      direct.block.type === "item" &&
      (source.type === "code" || source.type === "other")
    ) {
      const positioned = resolveContainerChildDrop(
        direct.element,
        ":scope > .item-children > [data-source-block]",
        y,
        byId,
        isAllowed
      );
      if (positioned) return positioned;

      return {
        id: direct.id,
        mode: "inside",
        element: direct.element
      };
    }

    const edgeBand = Math.min(
      window.matchMedia("(pointer: coarse)").matches ? 34 : 24,
      Math.max(10, direct.rect.height * 0.28)
    );

    if (y <= direct.rect.top + edgeBand) {
      return {
        id: direct.id,
        mode: "before",
        element: direct.element
      };
    }

    if (y >= direct.rect.bottom - edgeBand) {
      return {
        id: direct.id,
        mode: "after",
        element: direct.element
      };
    }

    return {
      id: direct.id,
      mode: y < direct.rect.top + direct.rect.height / 2 ? "before" : "after",
      element: direct.element
    };
  }

  // Only use BEFORE/AFTER when the pointer is in the gap outside every block.
  const edgeGap = window.matchMedia("(pointer: coarse)").matches ? 28 : 20;
  let edgeTarget: {
    id: string;
    mode: DropMode;
    element: HTMLElement;
    distance: number;
    depth: number;
  } | null = null;

  for (const element of document.querySelectorAll<HTMLElement>("[data-source-block]")) {
    const id = element.dataset.sourceBlock || "";
    const block = byId.get(id);
    if (!block || !isAllowed(block)) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (x < rect.left || x > rect.right) continue;

    let mode: DropMode | null = null;
    let distance = Infinity;

    if (y < rect.top && rect.top - y <= edgeGap) {
      mode = "before";
      distance = rect.top - y;
    } else if (y > rect.bottom && y - rect.bottom <= edgeGap) {
      mode = "after";
      distance = y - rect.bottom;
    }

    if (!mode) continue;

    let depth = 0;
    let parent: HTMLElement | null = element.parentElement;
    while (parent) {
      if (parent.matches?.("[data-source-block]")) depth += 1;
      parent = parent.parentElement;
    }

    if (
      !edgeTarget ||
      distance < edgeTarget.distance ||
      (distance === edgeTarget.distance && depth > edgeTarget.depth)
    ) {
      edgeTarget = { id, mode, element, distance, depth };
    }
  }

  if (edgeTarget) {
    return { id: edgeTarget.id, mode: edgeTarget.mode, element: edgeTarget.element };
  }

  // Far outside the document list still means "move to start/end", not an invalid drop.
  const rootTargets = [...document.querySelectorAll<HTMLElement>(".markdown > [data-source-block]")]
    .map(element => {
      const id = element.dataset.sourceBlock || "";
      const block = byId.get(id);
      if (!block || !isAllowed(block)) return null;
      return { id, element, rect: element.getBoundingClientRect() };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => a.rect.top - b.rect.top);

  if (rootTargets.length) {
    const first = rootTargets[0];
    const last = rootTargets[rootTargets.length - 1];

    if (y < first.rect.top) {
      return { id: first.id, mode: "before", element: first.element };
    }

    if (y > last.rect.bottom) {
      return { id: last.id, mode: "after", element: last.element };
    }
  }

  return null;
}

function bindMoveHandles() {
  document.querySelectorAll<HTMLButtonElement>('[data-action="move"]').forEach(handle => {
    handle.addEventListener("click", event => event.preventDefault());

    handle.addEventListener("pointerdown", event => {
      event.preventDefault();
      if (editing) return;

      const sourceId = handle.dataset.block;
      if (!sourceId) return;

      const blocks = parseMarkdownBlocks(currentContent);
      const source = blocks.find(block => block.id === sourceId);
      if (!source) return;

      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;
      let targetId = "";
      let dropMode: DropMode = "after";
      let ghost: HTMLDivElement | null = null;

      const updateGhost = (x: number, y: number) => {
        if (!ghost) return;
        ghost.style.transform = "translate3d(" + (x + 14) + "px," + (y + 14) + "px,0)";
      };

      const begin = () => {
        dragging = true;
        document.body.classList.add("dragging-block");
        handle.classList.add("move-active");
        markDragSource(sourceId, true);

        ghost = document.createElement("div");
        ghost.className = "drag-ghost";
        ghost.textContent = dragLabel(source);
        document.body.appendChild(ghost);
        updateGhost(event.clientX, event.clientY);

        try { handle.setPointerCapture(event.pointerId); } catch {}
      };

      const timer = window.setTimeout(begin, event.pointerType === "mouse" ? 120 : 260);

      const cleanup = () => {
        window.clearTimeout(timer);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onEnd);
        document.removeEventListener("pointercancel", onCancel);
        clearDropMarkers();
        markDragSource(sourceId, false);
        handle.classList.remove("move-active");
        document.body.classList.remove("dragging-block");
        ghost?.remove();
        ghost = null;
      };

      const onMove = (moveEvent: PointerEvent) => {
        if (!dragging) {
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 14) {
            cleanup();
          }
          return;
        }

        moveEvent.preventDefault();
        updateGhost(moveEvent.clientX, moveEvent.clientY);
        clearDropMarkers();
        const resolved = resolveDropTarget(moveEvent.clientX, moveEvent.clientY, sourceId);
        if (!resolved) {
          targetId = "";
          return;
        }

        targetId = resolved.id;
        dropMode = resolved.mode;
        const targetElement = resolved.element;

        targetElement.classList.add(
          dropMode === "inside"
            ? "drop-inside"
            : dropMode === "before"
              ? "drop-before"
              : "drop-after"
        );
        targetElement.dataset.dropMode = dropMode;

        const edge = 72;
        if (moveEvent.clientY < edge) window.scrollBy(0, -14);
        else if (moveEvent.clientY > window.innerHeight - edge) window.scrollBy(0, 14);
      };

      const onEnd = (upEvent: PointerEvent) => {
        upEvent.preventDefault();
        const shouldMove = dragging && Boolean(targetId);
        const destination = targetId;
        const mode = dropMode;
        cleanup();
        if (shouldMove) void moveBlock(sourceId, destination, mode);
      };

      const onCancel = () => cleanup();

      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onEnd, { once: true });
      document.addEventListener("pointercancel", onCancel, { once: true });
    });
  });
}
function bindMobileBlockActivation() {
  if (!window.matchMedia("(hover: none)").matches) return;

  document.querySelectorAll<HTMLElement>(".managed-block").forEach(block => {
    block.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      if (target.closest("button,input,textarea,a")) return;

      const closestBlock = target.closest<HTMLElement>(".managed-block");
      if (closestBlock !== block) return;

      const alreadyActive = block.classList.contains("active-block");
      document.querySelectorAll(".managed-block.active-block").forEach(active => active.classList.remove("active-block"));
      if (!alreadyActive) block.classList.add("active-block");
    });
  });
}
function toolbarForManagedBlock(block: HTMLElement) {
  if (block.classList.contains("heading-block")) {
    return block.querySelector<HTMLElement>(":scope > .branch-head > .block-actions");
  }
  if (block.classList.contains("item-block")) {
    return block.querySelector<HTMLElement>(":scope > .item-head > .block-actions");
  }
  if (block.classList.contains("code-shell")) {
    return block.querySelector<HTMLElement>(":scope > .code-actions");
  }
  return block.querySelector<HTMLElement>(":scope > .block-actions");
}

let stickyToolbarFrame = 0;

function updateStickyBlockToolbar() {
  stickyToolbarFrame = 0;

  const blocks = [...document.querySelectorAll<HTMLElement>(".managed-block")];
  const clear = () => {
    for (const block of blocks) {
      block.classList.remove("toolbar-stuck");
      const toolbar = toolbarForManagedBlock(block);
      toolbar?.style.removeProperty("--sticky-toolbar-top");
      toolbar?.style.removeProperty("--sticky-toolbar-right");
    }
  };

  const header = document.querySelector<HTMLElement>(".doc-topbar");
  if (!header || document.body.classList.contains("dragging-block")) {
    clear();
    return;
  }

  const stickyTop = Math.ceil(header.getBoundingClientRect().bottom + 4);
  const availableHeight = Math.max(1, window.innerHeight - stickyTop);

  const candidates = blocks
    .map(block => {
      const toolbar = toolbarForManagedBlock(block);
      if (!toolbar) return null;

      const rect = block.getBoundingClientRect();
      if (
        rect.top >= stickyTop ||
        rect.bottom <= stickyTop + 8 ||
        rect.height <= availableHeight
      ) {
        return null;
      }

      let depth = 0;
      let parent = block.parentElement;
      while (parent) {
        if (parent.classList.contains("managed-block")) depth += 1;
        parent = parent.parentElement;
      }

      return { block, toolbar, rect, depth };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => b.depth - a.depth || a.rect.height - b.rect.height);

  const selected = candidates[0] || null;

  for (const block of blocks) {
    if (block !== selected?.block) {
      block.classList.remove("toolbar-stuck");
      const toolbar = toolbarForManagedBlock(block);
      toolbar?.style.removeProperty("--sticky-toolbar-top");
      toolbar?.style.removeProperty("--sticky-toolbar-right");
    }
  }

  if (!selected) return;

  const inset = window.matchMedia("(pointer: coarse)").matches ? 6 : 8;
  const right = Math.max(inset, Math.round(window.innerWidth - selected.rect.right + inset));

  selected.block.classList.add("toolbar-stuck");
  selected.toolbar.style.setProperty("--sticky-toolbar-top", stickyTop + "px");
  selected.toolbar.style.setProperty("--sticky-toolbar-right", right + "px");
}

function scheduleStickyBlockToolbar() {
  if (stickyToolbarFrame) return;
  stickyToolbarFrame = requestAnimationFrame(updateStickyBlockToolbar);
}

function bindDocumentActions() {
  document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(button => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action || "";
      const blockId = button.dataset.block || "";

      if (action === "move") return;

      try {
        if (action === "set-content-mode") {
          const kind = button.dataset.kind;
          if (kind === "code" || kind === "other") setContentMode(kind);
          return;
        }
        if (action === "save-edit") {
          button.disabled = true;
          await saveEditing();
          return;
        }
        if (action === "cancel-edit") {
          editing = null;
          renderFile();
          return;
        }
        if (action === "delete-edit") {
          button.disabled = true;
          await deleteEditing();
          return;
        }

        handleBlockAction(action, blockId);
      } catch (error) {
        console.error(error);
        button.disabled = false;
        toast("Could not save");
      }
    });
  });

  bindMoveHandles();
  bindMobileBlockActivation();
  scheduleStickyBlockToolbar();

  requestAnimationFrame(() => {
    const editor = document.querySelector<HTMLInputElement | HTMLTextAreaElement>("[data-edit-value]");
    editor?.focus();
  });
}

function sidebarTreeHtml(folderId: string, depth = 0): string {
  const visible = sidebarEntriesForFolder(folderId);
  if (!visible) {
    return '<div class="sidebar-status" style="--depth:' + depth + '">' +
      (sidebarLoading.has(folderId) ? 'Loading…' : 'Not loaded') +
    '</div>';
  }

  if (!visible.length) {
    return '<div class="sidebar-status" style="--depth:' + depth + '">Empty</div>';
  }

  return visible.map(entry => {
    const indent = ' style="--depth:' + depth + '"';

    if (entry.mimeType === FOLDER_MIME) {
      const expanded = sidebarExpanded.has(entry.id);
      const loading = sidebarLoading.has(entry.id);
      const childrenHtml = expanded
        ? '<div class="sidebar-children">' +
            (loading && !cachedFolderChildren(entry.id)
              ? '<div class="sidebar-status" style="--depth:' + (depth + 1) + '">Loading…</div>'
              : sidebarTreeHtml(entry.id, depth + 1)) +
          '</div>'
        : '';

      return '<div class="sidebar-node">' +
        '<button class="sidebar-row sidebar-folder' + (expanded ? ' expanded' : '') + '" type="button" data-sidebar-folder="' + esc(entry.id) + '"' + indent + '>' +
          '<span class="sidebar-chevron">' + icons.chevron + '</span>' +
          '<span class="sidebar-entry-icon">' + icons.folder + '</span>' +
          '<span class="sidebar-entry-name">' + esc(entry.name) + '</span>' +
        '</button>' +
        childrenHtml +
      '</div>';
    }

    const current = currentFile?.id === entry.id;
    return '<a class="sidebar-row sidebar-file' + (current ? ' current' : '') + '" data-sidebar-file="' + esc(entry.id) + '" href="' + esc(withDemo(routeFor(entry))) + '"' + indent + '>' +
      '<span class="sidebar-chevron placeholder"></span>' +
      '<span class="sidebar-entry-icon">' + icons.file + '</span>' +
      '<span class="sidebar-entry-name">' + esc(entry.name.replace(/\.md$/i, "")) + '</span>' +
    '</a>';
  }).join("");
}

function updateSidebarTree() {
  const tree = document.querySelector<HTMLElement>("#sidebar-tree");
  if (tree) tree.innerHTML = sidebarTreeHtml(rootFolderId);

  document.querySelectorAll<HTMLButtonElement>("[data-sidebar-folder]").forEach(button => {
    button.addEventListener("click", () => {
      const folderId = button.dataset.sidebarFolder;
      if (!folderId) return;

      if (sidebarExpanded.has(folderId)) {
        sidebarExpanded.delete(folderId);
        updateSidebarTree();
        return;
      }

      sidebarExpanded.add(folderId);
      updateSidebarTree();

      const cachedRecord = readCachedChildren(folderId);
      if (cachedRecord) {
        if (Date.now() - cachedRecord.updatedAt >= CACHE_REFRESH_MS) {
          void refreshSidebarFolder(folderId);
        }
      } else {
        void ensureSidebarFolder(folderId);
      }
    });
  });

  document.querySelectorAll<HTMLAnchorElement>("[data-sidebar-file]").forEach(link => {
    link.addEventListener("click", event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const fileId = link.dataset.sidebarFile;
      const children = [...sidebarChildrenCache.values()].flat();
      const entry = children.find(item => item.id === fileId);
      if (!entry) return;
      sidebarOpen = false;
      navigate(routeFor(entry));
    });
  });
}

async function refreshSidebarFolder(folderId: string) {
  if (sidebarLoading.has(folderId)) return;

  sidebarLoading.add(folderId);
  updateSidebarTree();

  try {
    const folder: DriveEntry = {
      id: folderId,
      name: "",
      mimeType: FOLDER_MIME
    };
    const visible = await buildVisibleFolderListing(folder);
    writeJsonCache(visibleFolderCacheKey(folderId), {
      updatedAt: Date.now(),
      entries: visible
    } satisfies FolderCacheRecord);
  } catch (error) {
    console.error("Sidebar refresh failed", error);
  } finally {
    sidebarLoading.delete(folderId);
    updateSidebarTree();
  }
}

async function ensureSidebarFolder(folderId: string) {
  if (cachedVisibleFolderEntries(folderId) || cachedFolderChildren(folderId)) {
    updateSidebarTree();
    return;
  }
  await refreshSidebarFolder(folderId);
}

function bindSidebarShell() {
  document.querySelector("#sidebar-toggle")?.addEventListener("click", () => {
    sidebarOpen = !sidebarOpen;
    document.querySelector(".file-sidebar")?.classList.toggle("open", sidebarOpen);
    document.querySelector(".sidebar-backdrop")?.classList.toggle("show", sidebarOpen);
  });

  document.querySelector(".sidebar-backdrop")?.addEventListener("click", () => {
    sidebarOpen = false;
    document.querySelector(".file-sidebar")?.classList.remove("open");
    document.querySelector(".sidebar-backdrop")?.classList.remove("show");
  });

  updateSidebarTree();

  const cachedRoot = readCachedChildren(rootFolderId);
  if (cachedRoot) {
    if (Date.now() - cachedRoot.updatedAt >= CACHE_REFRESH_MS) {
      void refreshSidebarFolder(rootFolderId);
    }
  } else {
    void ensureSidebarFolder(rootFolderId);
  }
}

function renderFile() {
  if (!currentFile) return;

  app.innerHTML =
    '<div class="doc-page">' +
      '<aside class="file-sidebar' + (sidebarOpen ? ' open' : '') + '">' +
        '<div class="sidebar-title">Secrets Keep</div>' +
        '<div class="sidebar-tree" id="sidebar-tree">' + sidebarTreeHtml(rootFolderId) + '</div>' +
      '</aside>' +
      '<button class="sidebar-backdrop' + (sidebarOpen ? ' show' : '') + '" type="button" aria-label="Close sidebar"></button>' +
      '<main class="doc-shell">' +
        '<header class="doc-topbar">' +
          '<div class="doc-nav">' +
            '<button class="icon-btn ghost sidebar-toggle" id="sidebar-toggle" aria-label="Files">' + icons.menu + '</button>' +
            '<button class="icon-btn ghost" id="back" aria-label="Back">' + icons.back + '</button>' +
          '</div>' +
          '<div class="doc-name">' + esc(currentFile.name.replace(/\.md$/i, "")) + '</div>' +
          '<div class="doc-actions">' +
            actionButton("new-heading", "branch", "Create branch") +
            actionButton("new-item", "plus", "Add item") +
            actionButton("new-code", "code", "Add code block") +
          '</div>' +
        '</header>' +
        '<article class="markdown">' + renderDocumentBlocks() + '</article>' +
      '</main>' +
    '</div>';

  document.querySelector("#back")?.addEventListener("click", async () => {
    editing = null;
    const route = await parentRoute(currentFile);
    if (route) navigate(route);
  });

  bindSidebarShell();
  bindDocumentActions();
}

async function isInsideSecrets(entry: DriveEntry) {
  if (entry.id === rootFolderId) return true;

  let parentId = entry.parents?.[0];
  let depth = 0;

  while (parentId && depth < 32) {
    if (parentId === rootFolderId) return true;
    const parent = await getEntry(parentId);
    parentId = parent.parents?.[0];
    depth += 1;
  }

  return false;
}

function parseRoute() {
  const folder = location.pathname.match(/^\/folder\/([^/]+)(?:\/.*)?$/);
  if (folder) return { kind: "folder" as const, id: decodeURIComponent(folder[1]) };

  const file = location.pathname.match(/^\/file\/([^/]+)(?:\/.*)?$/);
  if (file) return { kind: "file" as const, id: decodeURIComponent(file[1]) };

  return { kind: "root" as const, id: "" };
}

async function renderRoute() {
  if (!rootFolderId) return;

  const route = parseRoute();

  if (route.kind === "root") {
    app.innerHTML = '<div class="loading"></div>';
    try {
      const root: DriveEntry = {
        id: rootFolderId,
        name: "secrets",
        mimeType: FOLDER_MIME,
        parents: []
      };
      currentFile = null;
      currentContent = "";
      filter = "";
      await listFolder(root);
      renderFolder();
    } catch (error) {
      console.error(error);
      renderLogin();
    }
    return;
  }

  app.innerHTML = '<div class="loading"></div>';

  try {
    const entry = await getEntry(route.id);
    if (!(await isInsideSecrets(entry))) {
      navigate("/", true);
      return;
    }

    if (route.kind === "folder") {
      if (entry.mimeType !== FOLDER_MIME) throw new Error("Not a folder");
      currentFile = null;
      currentContent = "";
      filter = "";
      await listFolder(entry);
      renderFolder();
      return;
    }

    if (entry.mimeType === FOLDER_MIME || !entry.name.toLowerCase().endsWith(".md")) {
      throw new Error("Not a Markdown file");
    }

    currentFolder = null;
    currentFile = entry;

    const cachedFile = readCachedFile(entry.id);
    if (cachedFile) {
      currentContent = cachedFile.content;
      syncedContentByFile.set(entry.id, cachedFile.content);
      renderFile();
      void refreshOpenedFile(entry);
      return;
    }

    currentContent = await readFile(entry);
    syncedContentByFile.set(entry.id, currentContent);
    cacheFile(entry.id, currentContent);
    renderFile();
  } catch (error) {
    console.error(error);
    toast("Open failed");
    navigate("/", true);
  }
}

async function connect() {
  const button = document.querySelector<HTMLButtonElement>("#login");
  if (button) button.disabled = true;

  try {
    await authorize();
    await ensureRootFolder();
    await renderRoute();
  } catch (error) {
    console.error(error);
    if (button) button.disabled = false;
    toast("Sign in failed");
  }
}

window.addEventListener("popstate", () => {
  if (demo || accessToken || auth.currentUser) void renderRoute();
});

document.addEventListener("keydown", event => {
  const target = event.target as HTMLElement | null;
  if (target?.matches("input,textarea,[contenteditable=true]")) return;

  if (event.key === "/" && currentFolder) {
    event.preventDefault();
    document.querySelector<HTMLInputElement>("#search")?.focus();
  }
});
window.addEventListener("scroll", scheduleStickyBlockToolbar, { passive: true });
window.addEventListener("resize", scheduleStickyBlockToolbar, { passive: true });


document.addEventListener("pointerdown", event => {
  const target = event.target as HTMLElement | null;
  if (!target || target.closest(".managed-block,.block-editor")) return;

  document.querySelectorAll(".managed-block.active-block").forEach(active => {
    active.classList.remove("active-block");
  });

  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused !== document.body) {
    focused.blur();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch(error => console.error("SW", error));
      return;
    }

    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const registration of registrations) void registration.unregister();
    });
    if ("caches" in window) {
      caches.keys().then(keys => Promise.all(
        keys.filter(key => key.startsWith("secret-keep-") || key.startsWith("secrets-keep-")).map(key => caches.delete(key))
      ));
    }
  });
}
applyTheme(selectedTheme());

const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
systemTheme.addEventListener?.("change", () => {
  if (selectedTheme() === "system") applyTheme("system");
});

async function bootstrap() {
  if (demo) {
    rootFolderId = "demo-root";
    await renderRoute();
    return;
  }

  await setPersistence(auth, browserLocalPersistence);

  try {
    await handleOfflineOAuthCallback();
  } catch (error) {
    console.error("Google offline OAuth failed", error);
    renderLogin();
    toast("Google authorization failed");
    return;
  }

  await auth.authStateReady();

  const session = storedSession();

  if (!session?.refreshToken) {
    if (session?.signedIn || auth.currentUser) {
      await beginOfflineOAuth();
      return;
    }

    renderLogin();
    return;
  }

  if (!auth.currentUser) {
    if (!(await refreshDriveToken())) {
      await beginOfflineOAuth();
      return;
    }
  } else if (!restoreStoredToken()) {
    if (!(await refreshDriveToken())) {
      await beginOfflineOAuth();
      return;
    }
  }

  try {
    await ensureRootFolder();
    await renderRoute();
  } catch (error) {
    console.error(error);

    if (storedSession()?.refreshToken) {
      if (await refreshDriveToken()) {
        await ensureRootFolder();
        await renderRoute();
        return;
      }

      await beginOfflineOAuth();
      return;
    }

    renderLogin();
  }
}

void bootstrap();
