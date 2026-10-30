import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const tree = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true);
const names = new Set([
  "renderBlockEditor", "renderItemBlock", "actionButton", "renderEditActions",
  "bindDocumentActions", "captureEditingDraft"
]);
const helpers = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(helpers.length, names.size);
const compiled = ts.transpileModule(helpers.map(node => node.getText(tree)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;

function setup() {
  let listener;
  let renders = 0;
  const title = { value: "Typed title", focus() {} };
  const addButton = { focus() {} };
  const button = {
    dataset: { action: "item-remove-code", codeIndex: "1" },
    addEventListener(_name, callback) { listener = callback; }
  };
  const drafts = [
    { blockId: "code-20", value: "saved code", language: "text", indent: "  " },
    { value: "new first", language: "", indent: "  " },
    { value: "new second", language: "", indent: "  " }
  ];
  const rows = drafts.map((draft, index) => {
    const valueInput = { value: draft.value };
    const languageInput = { value: draft.language };
    return {
      dataset: { itemCode: String(index) }, valueInput, languageInput,
      querySelector: selector => selector === "[data-item-code-value]" ? valueInput : languageInput
    };
  });
  const context = vm.createContext({
    editing: { mode: "edit", type: "item", blockId: "item-0", value: "Original", itemCodes: drafts },
    currentContent: "unchanged source",
    document: {
      querySelectorAll: selector => selector === "[data-item-code]" ? rows : selector === "[data-action]" ? [button] : [],
      querySelector: selector => selector === "[data-edit-value]" ? title : selector.includes("item-add-code") ? addButton : null
    },
    icons: { trash: "TRASH", plus: "PLUS" },
    esc: value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;"),
    renderedMarkdown: value => value,
    renderFile() { renders++; },
    requestAnimationFrame: callback => callback(),
    bindMoveHandles() {}, bindMobileBlockActivation() {}, scheduleStickyBlockToolbar() {},
    toast(message) { throw new Error(message); }, console
  });
  vm.runInContext(compiled, context);
  context.bindDocumentActions();
  return { context, button, rows, click: () => listener(), renders: () => renders };
}

test("remove button appears on each new code draft, not on saved code or the item toolbar", () => {
  const { context } = setup();
  const html = context.renderBlockEditor(context.editing);
  assert.equal((html.match(/data-action="item-remove-code"/g) || []).length, 2);
  assert(html.includes('data-code-index="1"'));
  assert(html.includes('data-code-index="2"'));
  context.editing = null;
  const item = context.renderItemBlock({ id: "item-0", raw: "- **ABC**" }, "");
  assert(item.includes('data-action="item-code"'));
  assert(!item.includes('data-action="delete-item"'));
  assert(!item.includes('data-action="item-remove-code"'));
});

test("removing a new code captures other typed fields and only removes the selected draft", async () => {
  const { context, rows, click, renders } = setup();
  rows[0].valueInput.value = "edited saved code";
  rows[2].valueInput.value = "keep typed new code";
  rows[2].languageInput.value = "shell script";
  await click();
  assert.equal(context.editing.value, "Typed title");
  assert.equal(context.editing.itemCodes.length, 2);
  assert.equal(context.editing.itemCodes[0].value, "edited saved code");
  assert.equal(context.editing.itemCodes[1].value, "keep typed new code");
  assert.equal(context.editing.itemCodes[1].language, "shell-script");
  assert.equal(context.currentContent, "unchanged source");
  assert.equal(renders(), 1);
  const html = context.renderBlockEditor(context.editing);
  assert(html.includes('data-code-index="1"'));
  assert(!html.includes('data-code-index="2"'));
});

test("remove-new-code action cannot delete a saved code block or invalid index", async () => {
  for (const index of ["0", "-1", "1.5", "99", "invalid"]) {
    const { context, button, click, renders } = setup();
    button.dataset.codeIndex = index;
    await click();
    assert.equal(context.editing.itemCodes.length, 3);
    assert.equal(renders(), 0);
  }
});
