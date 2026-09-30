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
