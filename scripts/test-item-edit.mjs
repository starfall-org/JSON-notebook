// Exercise the actual pure helpers without initializing Firebase or the browser app.
// Run with: node --test scripts/test-item-edit.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { format } from "prettier/standalone";
import * as markdownPlugin from "prettier/plugins/markdown";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const tree = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true);
const names = new Set([
  "isThematicBreak", "isManagedLine", "nextLineEnd", "parseMarkdownBlocks",
  "blockMoveRange", "nearestStructuralParent", "codeFenceFor", "serializeEdit",
  "insertMarkdownBlock", "sourceWithEdit", "normalizeNestedCodeIndent", "deleteWithOwnedContent"
]);
const helpers = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(helpers.length, names.size);
const compiled = ts.transpileModule(helpers.map(node => node.getText(tree)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;

function setup(content = "") {
  const context = vm.createContext({ currentContent: content });
  vm.runInContext(compiled, context);
  return context;
}
const fence = "```";
const code = (value, indent = "  ", language = "text") =>
  `${indent}${fence}${language}\n${value.split("\n").map(line => indent + line).join("\n")}\n${indent}${fence}\n`;
function editItem(api, source, name = "A") {
  const blocks = api.parseMarkdownBlocks(source);
  const item = blocks.find(block => block.type === "item" && block.value === name);
  assert(item);
  return {
    mode: "edit", type: "item", blockId: item.id, insertAt: item.start,
    value: item.value, indent: item.indent,
    itemCodes: blocks.filter(block => block.type === "code" && api.nearestStructuralParent(block, blocks)?.id === item.id)
      .map(block => ({ blockId: block.id, value: block.value, language: block.language, indent: block.indent }))
  };
}

test("new item and code save together; title-only item adds no empty code", () => {
  const api = setup();
  const state = { mode: "new", type: "item", insertAt: 0, value: "Token", itemCodes: [{ value: "TOKEN=abc", language: "env", indent: "  " }] };
  const blocks = api.parseMarkdownBlocks(api.sourceWithEdit("", state));
  const item = blocks.find(block => block.type === "item");
  const child = blocks.find(block => block.type === "code");
  assert.equal(item.value, "Token");
  assert.equal(child.value, "TOKEN=abc");
  assert.equal(child.language, "env");
  assert.equal(api.nearestStructuralParent(child, blocks).id, item.id);
  assert.equal(api.sourceWithEdit("", { ...state, itemCodes: [] }), "- **Token**\n");
});

test("rename and edit multiple code blocks without dropping raw content or siblings", () => {
  const source = "# Root\n\n- **A**\n\n" + code("first") + "\n  Keep this paragraph.\n\n" + code("second") + "\n- **B**\n\n" + code("untouched");
  const api = setup(source);
  const draft = editItem(api, source);
  assert.equal(draft.itemCodes.length, 2);
  draft.value = "Renamed";
  draft.itemCodes[0].value = "changed";
  draft.itemCodes[0].language = "env";
  draft.itemCodes[1].value = "also changed";
  draft.itemCodes.push({ value: "added", language: "json", indent: "  " });
  const output = api.sourceWithEdit(source, draft);
  assert(output.includes("  Keep this paragraph."));
  assert(output.endsWith("- **B**\n\n" + code("untouched")));
  const blocks = api.parseMarkdownBlocks(output);
  assert.equal(blocks.filter(block => block.type === "code").length, 4);
  assert.equal(blocks.find(block => block.type === "item").value, "Renamed");
  assert.equal(blocks.find(block => block.type === "code").language, "env");
});

test("adding code to an existing item respects EOF and sibling boundaries", () => {
  for (const source of ["- **A**", "- **A**\n", "- **A**\n\n- **B**\n", "- **A**\n\n# Next\n"]) {
    const api = setup(source);
    const draft = editItem(api, source);
    draft.value = "Longer name";
    draft.itemCodes.push({ value: "new", language: "", indent: "  " });
    const output = api.sourceWithEdit(source, draft);
    const blocks = api.parseMarkdownBlocks(output);
    const child = blocks.find(block => block.type === "code");
    assert.equal(child.value, "new");
    assert.equal(api.nearestStructuralParent(child, blocks)?.value, "Longer name");
    if (source.includes("- **B**")) assert(output.endsWith("- **B**\n"));
    if (source.includes("# Next")) assert(output.endsWith("# Next\n"));
  }
});

test("new code insertion preserves offsets after owned raw content with trailing blank lines", () => {
  const source = "- **A**\n\n" + code("old") + "\n  Owned paragraph.\n\n\n\n- **B**\n";
  const api = setup(source);
  const draft = editItem(api, source);
  draft.itemCodes[0].value = "updated";
  draft.itemCodes.push({ value: "new", language: "", indent: "  " });
  const output = api.sourceWithEdit(source, draft);
  assert(output.includes("  Owned paragraph."));
  assert(output.endsWith("- **B**\n"));
  const values = api.parseMarkdownBlocks(output).filter(block => block.type === "code").map(block => block.value);
  assert.equal(JSON.stringify(values), JSON.stringify(["updated", "new"]));
});

test("ownership respects item indentation", () => {
  for (const base of [0, 2]) {
    for (const depth of [base, base + 1, base + 2, base + 4]) {
      const source = " ".repeat(base) + "- **A**\n\n" + code("body", " ".repeat(depth));
      const api = setup(source);
      assert.equal(editItem(api, source).itemCodes.length, depth >= base + 2 ? 1 : 0);
    }
  }
});

test("code roundtrips internal indentation, CRLF and embedded fences through formatting", async () => {
  const api = setup();
  const value = "if (x) {\r\n  run();\r\n}\r\n\r\n``` and ````";
  const state = { mode: "new", type: "item", insertAt: 0, value: "Code", itemCodes: [{ value, language: "text", indent: "  " }] };
  const output = api.sourceWithEdit("", state);
  const formatted = api.normalizeNestedCodeIndent(await format(api.normalizeNestedCodeIndent(output), {
    parser: "markdown", plugins: [markdownPlugin], proseWrap: "preserve"
  }));
  const blocks = api.parseMarkdownBlocks(formatted);
  const child = blocks.find(block => block.type === "code");
  assert.equal(child.value, value.replace(/\r\n/g, "\n"));
  assert.equal(api.nearestStructuralParent(child, blocks)?.value, "Code");
});

test("item deletion from its editor removes owned content without deleting adjacent sections", () => {
  const source = "# Root\n\n- **A**\n\n" + code("owned first") + "\n  Owned paragraph.\n\n" + code("owned second") + "\n- **B**\n\n" + code("keep sibling") + "\n" + code("keep standalone", "");
  const api = setup(source);
  const blocks = api.parseMarkdownBlocks(source);
  const item = blocks.find(block => block.type === "item" && block.value === "A");
  const output = api.deleteWithOwnedContent(item, blocks);
  assert(!output.includes("- **A**"));
  assert(!output.includes("owned first"));
  assert(!output.includes("owned second"));
  assert(!output.includes("Owned paragraph"));
  assert(output.startsWith("# Root\n"));
  assert(output.includes("- **B**"));
  assert(output.includes("keep sibling"));
  assert(output.includes("keep standalone"));
});

test("blank title is rejected before producing any saved source", () => {
  const api = setup("- **A**\n");
  const draft = editItem(api, api.currentContent);
  draft.value = " ";
  draft.itemCodes.push({ value: "draft", language: "", indent: "  " });
  assert.throws(() => api.sourceWithEdit(api.currentContent, draft), /Item name required/);
  assert.equal(api.currentContent, "- **A**\n");
});
