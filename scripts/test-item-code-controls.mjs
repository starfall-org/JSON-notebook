import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const blockEditorSource = readFileSync(
  new URL("../components/block-editor.tsx", import.meta.url),
  "utf8",
);
const markdownBlocksSource = readFileSync(
  new URL("../lib/markdown-blocks.ts", import.meta.url),
  "utf8",
);

const compiled = ts.transpileModule(markdownBlocksSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;

const api = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

test("createEditStateForBlock marks existing item codes with blockId so only new drafts can be removed", () => {
  const source = "# Root\n\n- **API**\n\n  ```env\n  KEY=1\n  ```\n";
  const blocks = api.parseMarkdownBlocks(source);
  const item = blocks.find((b) => b.type === "item");
  const edit = api.createEditStateForBlock(source, item);
  assert.equal(edit.itemCodes.length, 1);
  assert.ok(edit.itemCodes[0].blockId);

  // Simulate adding two new drafts and removing the first new draft (index 1)
  edit.itemCodes.push(
    { value: "new first", language: "", indent: "  " },
    { value: "keep typed new code", language: "shell script".replace(/\s+/g, "-"), indent: "  " },
  );

  // Guard matches BlockEditor.removeNewItemCodeDraft: saved blockId cannot be deleted
  const tryRemove = (index) => {
    const target = edit.itemCodes[index];
    if (!Number.isInteger(index) || index < 0 || !target || target.blockId) {
      return false;
    }
    edit.itemCodes.splice(index, 1);
    return true;
  };

  assert.equal(tryRemove(0), false);
  assert.equal(tryRemove(-1), false);
  assert.equal(tryRemove(99), false);
  assert.equal(tryRemove(1), true);
  assert.equal(edit.itemCodes.length, 2);
  assert.equal(edit.itemCodes[1].value, "keep typed new code");
  assert.equal(edit.itemCodes[1].language, "shell-script");

  // Verify BlockEditor enforces `!code.blockId` in UI rendering and removal handler
  assert(blockEditorSource.includes("if (!target || target.blockId) return;"));
  assert(blockEditorSource.includes("{!code.blockId ? ("));
});
