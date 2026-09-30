import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import { readFileSync } from "node:fs";
const code = ts.transpileModule(
  readFileSync(new URL("../src/session.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  },
).outputText;
const { createTokenManager, LoginRequired } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const expired = { accessToken: "old", refreshToken: "refresh", expiresAt: 0 };
function storage(value = expired) {
  return {
    value,
    async read() {
      return this.value;
    },
    async write(value) {
      this.value = value;
    },
  };
}
test("refreshes expired tokens once for concurrent Drive requests and preserves refresh token", async () => {
  const store = storage();
  let count = 0;
  const manager = createTokenManager(store, async () => {
    count++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { accessToken: "new", expiresAt: Date.now() + 3600000 };
  });
  await manager.restore();
  assert.deepEqual(
    await Promise.all([manager.token(), manager.token(), manager.token()]),
    ["new", "new", "new"],
  );
  assert.equal(count, 1);
  assert.equal(store.value.refreshToken, "refresh");
  assert.equal(await manager.token(), "new");
  assert.equal(count, 1);
});
test("forced refresh on 401; token survives an app restart", async () => {
  const store = storage({ ...expired, expiresAt: Date.now() + 3600000 });
  let count = 0;
  const renew = async () => ({
    accessToken: `new-${++count}`,
    refreshToken: "rotated",
    expiresAt: Date.now() + 3600000,
  });
  const first = createTokenManager(store, renew);
  await first.restore();
  assert.equal(await first.token(true), "new-1");
  const restarted = createTokenManager(store, renew);
  await restarted.restore();
  assert.equal(await restarted.token(), "new-1");
  assert.equal(count, 1);
});
test("network failure retains refresh token; invalid grant clears it", async () => {
  const store = storage();
  let invalid = false;
  const manager = createTokenManager(store, async () => {
    throw invalid ? new LoginRequired("revoked") : new Error("offline");
  });
  await manager.restore();
  await assert.rejects(manager.token(), /offline/);
  assert.equal(store.value.refreshToken, "refresh");
  invalid = true;
  await assert.rejects(manager.token(), /revoked/);
  assert.equal(store.value, null);
});
test("late refresh cannot restore a logged-out session", async () => {
  const store = storage();
  let finish;
  const manager = createTokenManager(
    store,
    () => new Promise((resolve) => (finish = resolve)),
  );
  await manager.restore();
  const pending = manager.token();
  await manager.set(null);
  finish({ accessToken: "late", expiresAt: Date.now() + 3600000 });
  await assert.rejects(pending, LoginRequired);
  assert.equal(store.value, null);
});
