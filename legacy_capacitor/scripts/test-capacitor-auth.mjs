import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/capacitor-auth.ts", import.meta.url),
  "utf8",
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;

const { createNativeAuth } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

function setup() {
  const calls = [];
  let token = "restored-token";
  const plugin = {
    async initialize(options) {
      calls.push(["initialize", options.google.mode, options.google.webClientId]);
    },
    async login(options) {
      calls.push(["login", options.provider, options.options.scopes]);
      token = "login-token";
      return {
        provider: "google",
        result: {
          responseType: "online",
          accessToken: { token },
          idToken: "id-token",
          profile: {
            email: null,
            familyName: null,
            givenName: null,
            id: "1",
            name: null,
            imageUrl: null,
          },
        },
      };
    },
    async refresh(options) {
      calls.push(["refresh", options.provider, options.options.scopes]);
      token = token === "login-token" ? "fresh-token" : token;
    },
    async getAuthorizationCode(options) {
      calls.push(["authorization", options.provider]);
      return { accessToken: token, jwt: "id-token" };
    },
    async logout(options) {
      calls.push(["logout", options.provider]);
      token = "";
    },
  };

  return {
    auth: createNativeAuth(plugin),
    calls,
    plugin,
    setToken(value) {
      token = value;
    },
  };
}

test("Capgo bridge restores the persisted Google session and Drive token", async () => {
  const { auth, calls } = setup();

  assert.deepEqual(await auth("restore"), {
    signedIn: true,
    token: "restored-token",
  });

  assert.equal(calls[0][0], "initialize");
  assert.deepEqual(calls[1], [
    "refresh",
    "google",
    ["https://www.googleapis.com/auth/drive"],
  ]);
  assert.deepEqual(calls[2], ["authorization", "google"]);
});

test("login returns the Drive token and normal token reads stay in memory", async () => {
  const { auth, calls } = setup();

  assert.deepEqual(await auth("login"), {
    signedIn: true,
    token: "login-token",
  });
  assert.deepEqual(await auth("token"), {
    signedIn: true,
    token: "login-token",
  });

  assert.equal(calls.filter(call => call[0] === "login").length, 1);
  assert.equal(calls.filter(call => call[0] === "refresh").length, 0);
});

test("forced token refresh uses the native Google refresh flow", async () => {
  const { auth, calls } = setup();

  await auth("login");
  assert.deepEqual(await auth("token", true), {
    signedIn: true,
    token: "fresh-token",
  });

  assert.equal(calls.filter(call => call[0] === "refresh").length, 1);
  assert.equal(calls.filter(call => call[0] === "authorization").length, 1);
});

test("missing native credential maps restore to signed out", async () => {
  const { auth, plugin } = setup();
  plugin.refresh = async () => {
    const error = new Error("No Google account is available on this device.");
    error.code = "NO_CREDENTIAL_AVAILABLE";
    throw error;
  };

  assert.deepEqual(await auth("restore"), { signedIn: false });
});

test("transient failures remain errors instead of forcing re-login", async () => {
  const { auth, plugin } = setup();
  plugin.refresh = async () => {
    throw new Error("offline");
  };

  assert.deepEqual(await auth("token", true), {
    error: "offline",
    loginRequired: false,
  });
});

test("logout clears the native Google session", async () => {
  const { auth, calls } = setup();
  await auth("login");

  assert.deepEqual(await auth("logout"), {});
  assert.deepEqual(calls.at(-1), ["logout", "google"]);
});

function setupAndroid() {
  const { plugin, calls } = setup();
  const drive = {
    async token(options) {
      calls.push(["drive-token", options.force]);
      return { accessToken: "renewed-drive-token" };
    },
    async rememberAccount(options) { calls.push(["remember-account", options]); },
    async clearAccount() { calls.push(["clear-account"]); },
  };
  return { auth: createNativeAuth(plugin, drive), calls, drive };
}

test("Android restores an expired ID-token session without Credential Manager", async () => {
  const { auth, calls } = setupAndroid();
  assert.deepEqual(await auth("restore"), { signedIn: true, token: "renewed-drive-token" });
  assert.equal(calls.filter(([name]) => name === "login" || name === "refresh" || name === "authorization").length, 0);
});

test("Android renews expired access tokens silently and shares concurrent renewals", async () => {
  const { auth, calls, drive } = setupAndroid();
  await auth("login");
  assert.equal(calls.find(([name]) => name === "remember-account")[1].accessToken, "login-token");
  const originalNow = Date.now;
  const started = originalNow();
  let release;
  drive.token = options => {
    calls.push(["drive-token", options.force]);
    return new Promise(resolve => { release = () => resolve({ accessToken: "fresh-token" }); });
  };
  try {
    Date.now = () => started + 51 * 60 * 1000;
    const pending = [auth("token"), auth("token"), auth("token", true)];
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.filter(([name]) => name === "drive-token").length, 1);
    release();
    for (const result of await Promise.all(pending)) {
      assert.deepEqual(result, { token: "fresh-token", signedIn: true });
    }
    assert.equal(calls.filter(([name]) => name === "refresh" || name === "authorization").length, 0);
  } finally { Date.now = originalNow; }
});

test("Android 401 recovery invalidates the native token cache", async () => {
  const { auth, calls } = setupAndroid();
  await auth("login");
  await auth("token", true);
  assert.deepEqual(calls.find(([name]) => name === "drive-token"), ["drive-token", true]);
});

test("Android reports revoked consent without opening a login prompt", async () => {
  const { auth, calls, drive } = setupAndroid();
  drive.token = async () => { throw Object.assign(new Error("Google Drive authorization required"), { code: "LOGIN_REQUIRED" }); };
  assert.deepEqual(await auth("restore"), { signedIn: false });
  assert.equal((await auth("token", true)).loginRequired, true);
  assert.equal(calls.filter(([name]) => name === "login" || name === "refresh").length, 0);
});

test("Android retries transient renewal errors without losing account selection", async () => {
  const { auth, calls, drive } = setupAndroid();
  drive.token = async () => { throw new Error("offline"); };
  assert.deepEqual(await auth("token", true), { error: "offline", loginRequired: false });
  drive.token = async () => ({ accessToken: "recovered-token" });
  assert.equal((await auth("token", true)).token, "recovered-token");
  assert.equal(calls.filter(([name]) => name === "clear-account").length, 0);
  await auth("logout");
  assert.deepEqual(calls.slice(-2), [["clear-account"], ["logout", "google"]]);
});
