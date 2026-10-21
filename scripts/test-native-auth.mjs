import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const nativeSource = readFileSync(
  new URL("../lib/auth.native.ts", import.meta.url),
  "utf8",
);
const sessionSource = readFileSync(
  new URL("../lib/session.ts", import.meta.url),
  "utf8",
);

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;

function setup({ previous = true, revoked = false, network = false } = {}) {
  const calls = { tokens: 0, silent: 0, clear: [], signIn: 0, signOut: 0 };
  const sdk = {
    configure(config) {
      assert.equal(config.offlineAccess, false);
      assert.deepEqual(Array.from(config.scopes), [
        "https://www.googleapis.com/auth/drive",
      ]);
      assert.equal(
        config.webClientId,
        "1064411966305-6vuqla6hbp2aegichjdb3d748jqji4be.apps.googleusercontent.com",
      );
    },
    hasPreviousSignIn() {
      return previous;
    },
    getCurrentUser() {
      return calls.silent || calls.signIn ? {} : null;
    },
    async signInSilently() {
      calls.silent++;
      if (network) throw new Error("offline");
      return { type: revoked ? "noSavedCredentialFound" : "success" };
    },
    async getTokens() {
      calls.tokens++;
      return { accessToken: "token-" + calls.tokens };
    },
    async clearCachedAccessToken(token) {
      calls.clear.push(token);
    },
    async hasPlayServices() {},
    async signIn() {
      calls.signIn++;
      return { type: "success" };
    },
    async signOut() {
      calls.signOut++;
    },
  };

  const context = vm.createContext({
    GoogleSignin: sdk,
    isSuccessResponse: (r) => r.type === "success",
    isErrorWithCode: (e) => Boolean(e && typeof e === "object" && "code" in e),
    statusCodes: {
      SIGN_IN_REQUIRED: "SIGN_IN_REQUIRED",
      NO_SAVED_CREDENTIAL_FOUND: "NO_SAVED_CREDENTIAL_FOUND",
      SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
    },
    DRIVE_SCOPE: "https://www.googleapis.com/auth/drive",
    googleWebClientId:
      "1064411966305-6vuqla6hbp2aegichjdb3d748jqji4be.apps.googleusercontent.com",
    Date,
    Error,
    String,
    Boolean,
  });

  const strippedNative = nativeSource
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+"[^"]+";\n?/g, "")
    .replace(/^export \{[^}]+\};\n?/gm, "")
    .replace(/\bexport /g, "");
  const manager = compile(sessionSource).replace(/\bexport /g, "");

  vm.runInContext(manager + "\n" + compile(strippedNative), context);
  return {
    context: vm.runInContext(
      "({ getAccessToken, restoreSession, login, logout, hasPreviousSignIn, LoginRequired })",
      context,
    ),
    calls,
  };
}

test("native restores account silently and deduplicates concurrent token requests", async () => {
  const { context: c, calls } = setup();
  assert.equal(await c.restoreSession(), true);
  const tokens = await Promise.all([
    c.getAccessToken(),
    c.getAccessToken(),
    c.getAccessToken(),
  ]);
  assert.deepEqual(tokens, ["token-1", "token-1", "token-1"]);
  assert.equal(calls.silent, 1);
  assert.equal(calls.signIn, 0);
  assert.equal(calls.tokens, 1);

  // Subsequent normal calls reuse cached in-memory token without revalidating
  assert.equal(await c.getAccessToken(), "token-1");
  assert.equal(calls.tokens, 1);
});

test("native 401 refresh clears previous cached token and obtains a fresh token silently", async () => {
  const { context: c, calls } = setup();
  await c.login();
  assert.equal(await c.getAccessToken(true), "token-2");
  assert.deepEqual(calls.clear, ["token-1"]);
  assert.equal(calls.signIn, 1);
});

test("missing or revoked native account requires reconnecting", async () => {
  const missing = setup({ previous: false });
  assert.equal(await missing.context.restoreSession(), false);

  const { context: c } = setup({ revoked: true });
  await c.restoreSession();
  await assert.rejects(c.getAccessToken(), (e) => e instanceof c.LoginRequired);
});

test("network failure preserves native session for retry and logout clears it", async () => {
  const { context: c, calls } = setup({ network: true });
  await c.restoreSession();
  await assert.rejects(c.getAccessToken(), /offline/);
  await c.logout();
  assert.equal(calls.signOut, 1);
  await assert.rejects(c.getAccessToken(), (e) => e instanceof c.LoginRequired);
});
