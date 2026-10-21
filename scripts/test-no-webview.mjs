import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;

function collectSourceFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      files.push(full);
    }
  }
  return files;
}

test("project contains zero WebView packages or DOM WebView bridges", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.equal("react-native-webview" in allDeps, false);
  assert.equal("@expo/dom-webview" in allDeps, false);
  assert.equal("@capacitor/core" in allDeps, false);

  const sourceFiles = [
    ...collectSourceFiles(join(root, "app")),
    ...collectSourceFiles(join(root, "components")),
    ...collectSourceFiles(join(root, "lib")),
  ];

  assert(sourceFiles.length > 10);

  for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8");
    assert.equal(
      /["']use dom["']/.test(text),
      false,
      `Forbidden "use dom" directive in ${file}`,
    );
    assert.equal(
      /react-native-webview/.test(text),
      false,
      `Forbidden WebView import in ${file}`,
    );
    assert.equal(
      /dangerouslySetInnerHTML/.test(text),
      false,
      `Forbidden HTML injection in ${file}`,
    );
  }
});
