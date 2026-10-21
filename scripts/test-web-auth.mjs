import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import vm from "node:vm";

const configSource = readFileSync(
  new URL("../lib/config.ts", import.meta.url),
  "utf8",
);
const sessionSource = readFileSync(
  new URL("../lib/session.ts", import.meta.url),
  "utf8",
);
const webAuthSource = readFileSync(
  new URL("../lib/auth.web.ts", import.meta.url),
  "utf8",
);

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

function setupWeb({
  href = "https://awesome-89e82.web.app/",
  redirectToken = "",
  popupToken = "popup-drive-token",
  currentUser = null,
} = {}) {
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  const navigations = [];

  let currentUrl = new URL(href);
  const windowObj = {
    localStorage,
    sessionStorage,
    get location() {
      return {
        get href() {
          return currentUrl.href;
        },
        get origin() {
          return currentUrl.origin;
        },
        get pathname() {
          return currentUrl.pathname;
        },
        get search() {
          return currentUrl.search;
        },
        get hash() {
          return currentUrl.hash;
        },
        assign(url) {
          navigations.push(["assign", url]);
          currentUrl = new URL(url);
        },
        replace(url) {
          navigations.push(["replace", url]);
          currentUrl = new URL(url);
        },
      };
    },
    history: {
      replaceState(_state, _title, nextRelative) {
        currentUrl = new URL(nextRelative, currentUrl.origin);
      },
    },
  };

  const authMock = {
    currentUser,
    async authStateReady() {},
  };

  const modules = new Map();
  const evalCjs = (name, code, customRequire) => {
    const mod = { exports: {} };
    modules.set(name, mod.exports);
    const fn = vm.runInNewContext(
      `(function(exports, require, module, window, URL, URLSearchParams, console, Date, Number, Error, Boolean, String, JSON, process) {\n${code}\n})`,
      {},
    );
    fn(
      mod.exports,
      customRequire,
      mod,
      windowObj,
      URL,
      URLSearchParams,
      console,
      Date,
      Number,
      Error,
      Boolean,
      String,
      JSON,
      { env: {} },
    );
    modules.set(name, mod.exports);
    return mod.exports;
  };

  const customRequire = (spec) => {
    if (spec === "@/lib/config") return modules.get("config");
    if (spec === "@/lib/session") return modules.get("session");
    if (spec === "firebase/app") {
      return {
        getApps: () => [],
        initializeApp: () => ({}),
      };
    }
    if (spec === "firebase/auth") {
      return {
        browserLocalPersistence: {},
        getAuth: () => authMock,
        setPersistence: async () => {},
        GoogleAuthProvider: Object.assign(
          function GoogleAuthProvider() {
            return {
              addScope() {},
              setCustomParameters() {},
            };
          },
          {
            credentialFromResult: (res) => ({ accessToken: res.token }),
          },
        ),
        getRedirectResult: async () =>
          redirectToken ? { token: redirectToken } : null,
        signInWithPopup: async () => ({ token: popupToken }),
        signInWithRedirect: async () => {
          navigations.push(["signInWithRedirect"]);
        },
        signOut: async () => {
          navigations.push(["firebaseSignOut"]);
        },
      };
    }
    throw new Error(`Unexpected module: ${spec}`);
  };

  evalCjs("config", compile(configSource), customRequire);
  evalCjs("session", compile(sessionSource), customRequire);
  const webAuth = evalCjs("auth.web", compile(webAuthSource), customRequire);

  return { webAuth, windowObj, localStorage, sessionStorage, navigations };
}

test("web consumes Firebase bridge hash handoff and restores clean app URL", async () => {
  const returnUrl = "https://awesome-89e82.web.app/file/abc/services";
  const hash = new URLSearchParams({
    __sk_access_token: "bridge-access-token",
    __sk_expires: "3600",
    __sk_return: returnUrl,
  }).toString();

  const { webAuth, windowObj } = setupWeb({
    href: `https://awesome-89e82.web.app/#${hash}`,
  });

  assert.equal(await webAuth.restoreSession(), true);
  assert.equal(await webAuth.getAccessToken(), "bridge-access-token");
  assert.equal(windowObj.location.href, returnUrl);
});

test("web redirects expired previous session on web.app through firebaseapp.com bridge once", async () => {
  const { webAuth, localStorage, navigations, sessionStorage } = setupWeb({
    href: "https://awesome-89e82.web.app/",
    currentUser: { uid: "u1" },
  });
  localStorage.setItem(
    "secret-keep.google-session",
    JSON.stringify({ accessToken: "old", expiresAt: 0, signedIn: true }),
  );

  await assert.rejects(webAuth.restoreSession(), /Redirecting to Firebase OAuth bridge/);
  assert.equal(navigations[0][0], "assign");
  assert(navigations[0][1].startsWith("https://awesome-89e82.firebaseapp.com/?__auth_bridge=auto"));
  assert.equal(sessionStorage.getItem("secrets-keep.oauth-auto-reconnect"), "1");
});

test("web uses Firebase popup sign-in on preview or localhost origins and persists session", async () => {
  const { webAuth } = setupWeb({
    href: "https://8081-sandbox.e2b.app/",
    popupToken: "preview-drive-token",
  });

  assert.equal(await webAuth.restoreSession(), false);
  assert.equal(await webAuth.login(), true);
  assert.equal(await webAuth.getAccessToken(), "preview-drive-token");
  await webAuth.logout();
  assert.equal(await webAuth.restoreSession(), false);
});
