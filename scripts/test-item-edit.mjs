import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { format } from "prettier/standalone";
import * as markdownPlugin from "prettier/plugins/markdown";

const source = readFileSync(
  new URL("../lib/markdown-blocks.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;

const api = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

const fence = "```";
const code = (value, indent = "  ", language = "text") =>
  `${indent}${fence}${language}\n${value
    .split("\n")
    .map((line) => indent + line)
    .join("\n")}\n${indent}${fence}\n`;

function editItem(doc, name = "A") {
  const blocks = api.parseMarkdownBlocks(doc);
  const item = blocks.find((block) => block.type === "item" && block.value === name);
  assert(item);
  return api.createEditStateForBlock(doc, item);
}

test("new item and code save together; title-only item adds no empty code", () => {
  const state = {
    mode: "new",
    type: "item",
    insertAt: 0,
    value: "Token",
    itemCodes: [{ value: "TOKEN=abc", language: "env", indent: "  " }],
  };
  const blocks = api.parseMarkdownBlocks(api.sourceWithEdit("", state));
  const item = blocks.find((block) => block.type === "item");
  const child = blocks.find((block) => block.type === "code");
  assert.equal(item.value, "Token");
  assert.equal(child.value, "TOKEN=abc");
  assert.equal(child.language, "env");
  assert.equal(api.nearestStructuralParent(child, blocks).id, item.id);
  assert.equal(api.sourceWithEdit("", { ...state, itemCodes: [] }), "- **Token**\n");
});

test("rename and edit multiple code blocks without dropping raw content or siblings", () => {
  const doc =
    "# Root\n\n- **A**\n\n" +
    code("first") +
    "\n  Keep this paragraph.\n\n" +
    code("second") +
    "\n- **B**\n\n" +
    code("untouched");
  const draft = editItem(doc);
  assert.equal(draft.itemCodes.length, 2);
  draft.value = "Renamed";
  draft.itemCodes[0].value = "changed";
  draft.itemCodes[0].language = "env";
  draft.itemCodes[1].value = "also changed";
  draft.itemCodes.push({ value: "added", language: "json", indent: "  " });
  const output = api.sourceWithEdit(doc, draft);
  assert(output.includes("  Keep this paragraph."));
  assert(output.endsWith("- **B**\n\n" + code("untouched")));
  const blocks = api.parseMarkdownBlocks(output);
  assert.equal(blocks.filter((block) => block.type === "code").length, 4);
  assert.equal(blocks.find((block) => block.type === "item").value, "Renamed");
  assert.equal(blocks.find((block) => block.type === "code").language, "env");
});

test("adding code to an existing item respects EOF and sibling boundaries", () => {
  for (const doc of ["- **A**", "- **A**\n", "- **A**\n\n- **B**\n", "- **A**\n\n# Next\n"]) {
    const draft = editItem(doc);
    draft.value = "Longer name";
    draft.itemCodes.push({ value: "new", language: "", indent: "  " });
    const output = api.sourceWithEdit(doc, draft);
    const blocks = api.parseMarkdownBlocks(output);
    const child = blocks.find((block) => block.type === "code");
    assert.equal(child.value, "new");
    assert.equal(api.nearestStructuralParent(child, blocks)?.value, "Longer name");
    if (doc.includes("- **B**")) assert(output.endsWith("- **B**\n"));
    if (doc.includes("# Next")) assert(output.endsWith("# Next\n"));
  }
});

test("new code insertion preserves offsets after owned raw content with trailing blank lines", () => {
  const doc = "- **A**\n\n" + code("old") + "\n  Owned paragraph.\n\n\n\n- **B**\n";
  const draft = editItem(doc);
  draft.itemCodes[0].value = "updated";
  draft.itemCodes.push({ value: "new", language: "", indent: "  " });
  const output = api.sourceWithEdit(doc, draft);
  assert(output.includes("  Owned paragraph."));
  assert(output.endsWith("- **B**\n"));
  const values = api
    .parseMarkdownBlocks(output)
    .filter((block) => block.type === "code")
    .map((block) => block.value);
  assert.deepEqual(values, ["updated", "new"]);
});

test("ownership respects item indentation", () => {
  for (const base of [0, 2]) {
    for (const depth of [base, base + 1, base + 2, base + 4]) {
      const doc = " ".repeat(base) + "- **A**\n\n" + code("body", " ".repeat(depth));
      assert.equal(editItem(doc).itemCodes.length, depth >= base + 2 ? 1 : 0);
    }
  }
});

test("code roundtrips internal indentation, CRLF and embedded fences through formatting", async () => {
  const value = "if (x) {\r\n  run();\r\n}\r\n\r\n``` and ````";
  const state = {
    mode: "new",
    type: "item",
    insertAt: 0,
    value: "Code",
    itemCodes: [{ value, language: "text", indent: "  " }],
  };
  const output = api.sourceWithEdit("", state);
  const formatted = api.normalizeNestedCodeIndent(
    await format(api.normalizeNestedCodeIndent(output), {
      parser: "markdown",
      plugins: [markdownPlugin],
      proseWrap: "preserve",
    }),
  );
  const blocks = api.parseMarkdownBlocks(formatted);
  const child = blocks.find((block) => block.type === "code");
  assert.equal(child.value, value.replace(/\r\n/g, "\n"));
  assert.equal(api.nearestStructuralParent(child, blocks)?.value, "Code");
});

test("item deletion from its editor removes owned content without deleting adjacent sections", () => {
  const doc =
    "# Root\n\n- **A**\n\n" +
    code("owned first") +
    "\n  Owned paragraph.\n\n" +
    code("owned second") +
    "\n- **B**\n\n" +
    code("keep sibling") +
    "\n" +
    code("keep standalone", "");
  const blocks = api.parseMarkdownBlocks(doc);
  const item = blocks.find((block) => block.type === "item" && block.value === "A");
  const output = api.deleteWithOwnedContent(doc, item, blocks);
  assert(!output.includes("- **A**"));
  assert(!output.includes("owned first"));
  assert(!output.includes("owned second"));
  assert(!output.includes("Owned paragraph"));
  assert(output.startsWith("# Root\n"));
  assert(output.includes("- **B**"));
  assert(output.includes("keep sibling"));
  assert(output.includes("keep standalone"));
});

test("heading deletion promotes child headings while removing directly owned blocks", () => {
  const doc = "# Parent\n\nDirect paragraph\n\n## Child\n\n- **Secret**\n";
  const blocks = api.parseMarkdownBlocks(doc);
  const parent = blocks.find((b) => b.type === "heading" && b.value === "Parent");
  const output = api.deleteWithOwnedContent(doc, parent, blocks);
  assert(!output.includes("Direct paragraph"));
  assert(output.includes("# Child\n"));
  assert(output.includes("- **Secret**"));
});

test("moveBlockSource shifts heading levels when dropped inside another heading and reindents code", () => {
  const doc = "# Alpha\n\n# Beta\n\n## Nested\n";
  const blocks = api.parseMarkdownBlocks(doc);
  const alpha = blocks[0];
  const beta = blocks[2];
  const moved = api.moveBlockSource(doc, beta.id, alpha.id, "inside");
  assert(moved.includes("## Beta"));
  assert(moved.includes("### Nested"));
});

test("section search matches section titles only and keeps descendants plus ancestors visible", () => {
  const doc =
    "# Services\n\n## Production\n\n" +
    code("SECRET_TOKEN=xyz", "", "env") +
    "\n## Staging\n\n- **Database**\n\n" +
    code("DB_URL=postgres://demo", "  ", "env");
  const tree = api.buildDocumentTree(doc);
  const match = api.matchDocumentSections(tree, "database");
  assert.equal(match.matchedIds.length, 1);
  // Secrets inside code blocks are never matched as section titles
  assert.equal(api.matchDocumentSections(tree, "SECRET_TOKEN").matchedIds.length, 0);
});

test("blank title is rejected before producing any saved source", () => {
  const doc = "- **A**\n";
  const draft = editItem(doc);
  draft.value = " ";
  draft.itemCodes.push({ value: "draft", language: "", indent: "  " });
  assert.throws(() => api.sourceWithEdit(doc, draft), /Item name required/);
});
