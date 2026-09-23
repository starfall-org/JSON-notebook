/// <reference types="vite/client" />
import DOMPurify from "dompurify";
import { marked } from "marked";
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
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
  type: "heading" | "item" | "code" | "other";
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
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope(DRIVE_SCOPE);
const demo = new URLSearchParams(location.search).has("demo");
const fence = String.fromCharCode(96).repeat(3);
const SESSION_KEY = "secret-keep.google-session";
const THEME_KEY = "secret-keep.theme";

type ThemeMode = "system" | "light" | "dark";
type StoredSession = {
  accessToken: string;
  expiresAt: number;
  signedIn: boolean;
};

let accessToken = "";
let rootFolderId = "";
let entries: DriveEntry[] = [];
let currentFolder: DriveEntry | null = null;
let currentFile: DriveEntry | null = null;
let editing: EditState | null = null;
let currentContent = "";
let filter = "";

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

function saveSession(token: string, expiresInSeconds: number) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    accessToken: token,
    expiresAt: Date.now() + Math.max(0, expiresInSeconds - 60) * 1000,
    signedIn: true
  } satisfies StoredSession));
}

function clearSession() {
  accessToken = "";
  localStorage.removeItem(SESSION_KEY);
}

function restoreStoredToken() {
  const session = storedSession();
  if (!session?.signedIn) return false;
  if (session.accessToken && session.expiresAt > Date.now()) {
    accessToken = session.accessToken;
    return true;
  }
  accessToken = "";
  return false;
}

async function logout() {
  clearSession();
  await firebaseSignOut(auth);
  rootFolderId = "";
  entries = [];
  currentFolder = null;
  currentFile = null;
  currentContent = "";
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

  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;

  if (!token) throw new Error("Google Drive authorization failed");

  accessToken = token;
  saveSession(token, 3600);
}

async function api(url: string, init: RequestInit = {}) {
  if (!accessToken) throw new Error("Google Drive authorization required");

  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer " + accessToken);
  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    clearSession();
    throw new Error("Google Drive authorization expired");
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
    return demoNodes
      .filter(node => node.parentId === folderId)
      .map(node => ({
        id: node.id,
        name: node.name,
        mimeType: node.mimeType,
        modifiedTime: node.modifiedTime,
        parents: node.parentId ? [node.parentId] : []
      }));
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

async function listFolder(folder: DriveEntry) {
  currentFolder = folder;

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

  entries = visible.sort((a, b) => {
    const af = a.mimeType === FOLDER_MIME ? 0 : 1;
    const bf = b.mimeType === FOLDER_MIME ? 0 : 1;
    return af - bf || a.name.localeCompare(b.name);
  });
}

async function readFile(file: DriveEntry) {
  if (demo) return demoNodes.find(node => node.id === file.id)?.content || "";
  const response = await api(
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) + "?alt=media"
  );
  return response.text();
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

  for (let index = 0; index < lines.length; index += 1) {
    const item = lines[index].match(/^(\s*)-\s+\*\*.+?\*\*\s*$/);
    if (!item) continue;

    const baseIndent = item[1];
    let scan = index + 1;
    while (scan < lines.length && lines[scan].trim() === "") scan += 1;

    const opening = lines[scan]?.match(/^(\s*)(\x60{3,})([^\x60]*)$/);
    if (!opening) continue;

    const currentIndent = opening[1];
    if (currentIndent.length <= baseIndent.length) continue;

    const wantedIndent = baseIndent + "    ";
    const marker = opening[2];

    for (let lineIndex = scan; lineIndex < lines.length; lineIndex += 1) {
      if (lines[lineIndex].startsWith(currentIndent)) {
        lines[lineIndex] = wantedIndent + lines[lineIndex].slice(currentIndent.length);
      }

      const raw = lines[lineIndex].slice(wantedIndent.length);
      if (lineIndex > scan && raw === marker) {
        index = lineIndex;
        break;
      }
    }
  }

  return lines.join("\n");
}

async function formatMarkdown(source: string) {
  const [prettier, markdownPlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/markdown")
  ]);
  const formatted = await prettier.format(source, {
    parser: "markdown",
    plugins: [markdownPlugin],
    proseWrap: "preserve"
  });
  return normalizeNestedCodeIndent(formatted);
}

function isManagedLine(line: string) {
  return (
    /^ {0,3}#{1,6}[ \t]+.+/.test(line) ||
    /^\s*-\s+\*\*.+?\*\*\s*$/.test(line) ||
    /^\s*\x60{3,}[^\x60]*$/.test(line)
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
    renderEditActions() +
  '</div>';
}
function renderBlockEditor(state: EditState) {
  const nested = (state.indent || "").length >= 4 ? " nested-block" : "";

  if (state.type === "code") {
    return '<div class="block-editor code-editor-block' + nested + '">' +
      renderContentModeSwitch(state) +
      '<textarea class="block-code-input" data-edit-value spellcheck="false" placeholder="code">' + esc(state.value) + '</textarea>' +
      renderCodeFooter(state) +
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
    const nested = (block.indent || "").length >= 4 ? " nested-block" : "";
    const language = (block.language || "").trim();
    const languageClass = language
      ? "language-" + language.replace(/[^a-zA-Z0-9_-]+/g, "-")
      : "";

    return '<section class="managed-block code-shell' + nested + '" data-source-block="' + block.id + '">' +
      '<pre><code class="' + esc(languageClass) + '">' + esc(block.value || "") + '</code></pre>' +
      (language ? '<span class="code-language-label">' + esc(language) + '</span>' : "") +
      '<button class="code-copy-always" type="button" data-action="copy" data-block="' + esc(block.id) + '" title="Copy" aria-label="Copy">' + icons.copy + '</button>' +
      '<div class="block-actions code-actions">' +
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

    if (editing?.mode === "new" && editing.insertAt === item.end) {
      childHtml += renderBlockEditor(editing);
    }

    while (next < blocks.length && blocks[next].start < range.end) {
      const child = blocks[next];
      childHtml += renderManagedBlock(child);

      if (editing?.mode === "new" && editing.insertAt === child.end) {
        childHtml += renderBlockEditor(editing);
      }

      next += 1;
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

    if (editing?.mode === "new" && editing.insertAt === heading.end) {
      childHtml += renderBlockEditor(editing);
    }

    while (next < blocks.length) {
      const block = blocks[next];

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

      if (editing?.mode === "new" && editing.insertAt === block.end) {
        childHtml += renderBlockEditor(editing);
      }

      next += 1;
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

    if (editing?.mode === "new" && editing.insertAt === block.end) {
      html += renderBlockEditor(editing);
    }

    index += 1;
  }

  if (!blocks.length && editing?.mode === "new" && editing.insertAt !== 0) {
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
    type: block.type,
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

async function persistContent(source: string) {
  if (!currentFile) return;
  currentContent = await formatMarkdown(source);
  await saveFile(currentFile, currentContent);
  editing = null;
  renderFile();
  toast("Saved");
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

async function deleteEditing() {
  if (!editing) return;

  if (editing.mode === "new") {
    editing = null;
    renderFile();
    return;
  }

  const block = parseMarkdownBlocks(currentContent).find(item => item.id === editing?.blockId);
  if (!block) return;

  const source = currentContent.slice(0, block.start) + currentContent.slice(block.end);
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
    editing.indent = editing.parentIndent + (kind === "code" ? "    " : "  ");
  } else {
    editing.indent = "";
  }

  renderFile();
}

function handleBlockAction(action: string, blockId: string) {
  const blocks = parseMarkdownBlocks(currentContent);
  const block = blockId ? blocks.find(item => item.id === blockId) : undefined;

  if (action === "new-heading") {
    startNewBlock("heading", 0, { level: 1 });
    return;
  }
  if (action === "new-item") {
    startNewBlock("item", 0);
    return;
  }
  if (action === "new-code") {
    startNewBlock("code", 0);
    return;
  }
  if (action === "edit" && block) {
    startEditBlock(block);
    return;
  }
  if (action === "child-branch" && block?.type === "heading") {
    startNewBlock("heading", block.end, { level: Math.min(6, (block.level || 1) + 1) });
    return;
  }
  if (action === "add-item" && block?.type === "heading") {
    startNewBlock("item", block.end);
    return;
  }
  if (action === "add-code" && block?.type === "heading") {
    startNewBlock("code", block.end);
    return;
  }
  if (action === "item-code" && block?.type === "item") {
    startNewBlock("code", block.end, {
      parentIndent: block.indent || "",
      indent: (block.indent || "") + "    "
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
      if (next.type === "heading" && (next.level || 1) <= level) {
        end = next.start;
        break;
      }
    }

    return { start: block.start, end };
  }
  if (block.type === "item") {
    const baseIndent = (block.indent || "").length;
    const minimumCodeIndent = baseIndent + 4;
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

async function moveBlock(sourceId: string, targetId: string, mode: DropMode) {
  const blocks = parseMarkdownBlocks(currentContent);
  const source = blocks.find(block => block.id === sourceId);
  const target = blocks.find(block => block.id === targetId);
  if (!source || !target || source.id === target.id) return;

  const sourceRange = blockMoveRange(source, blocks);
  if (target.start >= sourceRange.start && target.start < sourceRange.end) return;

  const targetRange = blockMoveRange(target, blocks);
  let insertAt = mode === "inside"
    ? target.end
    : mode === "after"
      ? targetRange.end
      : target.start;

  let moving = currentContent.slice(sourceRange.start, sourceRange.end);

  if (source.type === "heading" && target.type === "heading") {
    const desiredLevel = mode === "inside"
      ? Math.min(6, (target.level || 1) + 1)
      : (target.level || 1);
    moving = shiftHeadingSubtree(moving, source, sourceRange, blocks, desiredLevel);
  }

  if (source.type === "code" && sourceRange.start === source.start && sourceRange.end === source.end) {
    const targetIndent =
      mode === "inside" && target.type === "item"
        ? (target.indent || "") + "    "
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

function resolveDropTarget(x: number, y: number, sourceId: string): ResolvedDrop | null {
  const blocks = parseMarkdownBlocks(currentContent);
  const source = blocks.find(block => block.id === sourceId);
  if (!source) return null;

  const sourceRange = blockMoveRange(source, blocks);
  const byId = new Map(blocks.map(block => [block.id, block]));
  const isAllowed = (block: MarkdownBlock) =>
    block.id !== sourceId &&
    !(block.start >= sourceRange.start && block.start < sourceRange.end);

  const resolveElement = (element: HTMLElement | null) => {
    if (!element) return null;
    const id = element.dataset.sourceBlock;
    const block = id ? byId.get(id) : undefined;
    if (!id || !block || !isAllowed(block)) return null;
    return { id, block, element };
  };

  const hits = document.elementsFromPoint(x, y);

  // Anywhere physically inside a branch container is an INSIDE drop.
  for (const hit of hits) {
    const headingElement = hit.closest<HTMLElement>(".heading-block[data-source-block]");
    const resolved = resolveElement(headingElement);
    if (resolved?.block.type === "heading") {
      return { id: resolved.id, mode: "inside", element: resolved.element };
    }
  }

  // A code block dropped anywhere inside an item belongs to that item.
  if (source.type === "code") {
    for (const hit of hits) {
      const itemElement = hit.closest<HTMLElement>(".item-block[data-source-block]");
      const resolved = resolveElement(itemElement);
      if (resolved?.block.type === "item") {
        return { id: resolved.id, mode: "inside", element: resolved.element };
      }
    }
  }

  // Other direct hits use their upper/lower half.
  const seen = new Set<HTMLElement>();
  for (const hit of hits) {
    const element = hit.closest<HTMLElement>("[data-source-block]");
    if (!element || seen.has(element)) continue;
    seen.add(element);

    const resolved = resolveElement(element);
    if (!resolved) continue;

    const rect = element.getBoundingClientRect();
    return {
      id: resolved.id,
      mode: y < rect.top + rect.height / 2 ? "before" : "after",
      element
    };
  }

  // BEFORE/AFTER only exist in the empty gap outside a container.
  const edgeGap = window.matchMedia("(pointer: coarse)").matches ? 24 : 18;
  let edgeTarget: {
    id: string;
    mode: DropMode;
    element: HTMLElement;
    distance: number;
    width: number;
  } | null = null;

  for (const element of document.querySelectorAll<HTMLElement>("[data-source-block]")) {
    const resolved = resolveElement(element);
    if (!resolved) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (x < rect.left - 10 || x > rect.right + 10) continue;

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

    if (
      !edgeTarget ||
      distance < edgeTarget.distance ||
      (distance === edgeTarget.distance && rect.width < edgeTarget.width)
    ) {
      edgeTarget = {
        id: resolved.id,
        mode,
        element,
        distance,
        width: rect.width
      };
    }
  }

  if (!edgeTarget) return null;

  return {
    id: edgeTarget.id,
    mode: edgeTarget.mode,
    element: edgeTarget.element
  };
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

  requestAnimationFrame(() => {
    const editor = document.querySelector<HTMLInputElement | HTMLTextAreaElement>("[data-edit-value]");
    editor?.focus();
  });
}

function renderFile() {
  if (!currentFile) return;

  app.innerHTML =
    '<main class="doc-shell">' +
      '<header class="doc-topbar">' +
        '<button class="icon-btn ghost" id="back" aria-label="Back">' + icons.back + '</button>' +
        '<div class="doc-name">' + esc(currentFile.name.replace(/\.md$/i, "")) + '</div>' +
        '<div class="doc-actions">' +
          actionButton("new-heading", "branch", "Create branch") +
          actionButton("new-item", "plus", "Add item") +
          actionButton("new-code", "code", "Add code block") +
        '</div>' +
      '</header>' +
      '<article class="markdown">' + renderDocumentBlocks() + '</article>' +
    '</main>';

  document.querySelector("#back")?.addEventListener("click", async () => {
    editing = null;
    const route = await parentRoute(currentFile);
    if (route) navigate(route);
  });

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
      const root = await getEntry(rootFolderId);
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
    currentContent = await readFile(entry);
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
  await auth.authStateReady();

  if (!auth.currentUser) {
    clearSession();
    renderLogin();
    return;
  }

  if (!restoreStoredToken()) {
    renderLogin();
    return;
  }

  try {
    await ensureRootFolder();
    await renderRoute();
  } catch (error) {
    console.error(error);
    renderLogin();
  }
}

void bootstrap();
