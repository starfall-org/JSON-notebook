// Deterministic layout tests for the production sticky-toolbar selection logic.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const tree = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true);
const names = new Set(["toolbarForManagedBlock", "updateStickyBlockToolbar"]);
const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(functions.length, names.size);
const compiled = ts.transpileModule(functions.map(node => node.getText(tree)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;

function element(classes, rect = {}, parentElement = null) {
  const set = new Set(classes.split(" ").filter(Boolean));
  const properties = new Map();
  return {
    rect: { top: 0, bottom: 0, right: 740, height: 0, ...rect },
    parentElement,
    classList: {
      contains: name => set.has(name), add: name => set.add(name), remove: name => set.delete(name)
    },
    style: {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: name => properties.delete(name),
      getPropertyValue: name => properties.get(name) || ""
    },
    closest(selector) {
      for (let node = this; node; node = node.parentElement) {
        if (node.classList.contains(selector.slice(1))) return node;
      }
      return null;
    },
    getBoundingClientRect() { return this.rect; },
    getClientRects() { return this.rect.height ? [this.rect] : []; },
    querySelector() { return this.toolbar || null; }
  };
}
function fixture() {
  const heading = element("managed-block heading-block", { top: -200, bottom: 1100, height: 1300 });
  heading.toolbar = element("block-actions", { height: 36 });
  const item = element("managed-block item-block", { top: -50, bottom: 450, height: 500 }, heading);
  const editor = element("block-editor item-editor-block", { top: -40, bottom: 400, height: 440 }, item);
  editor.toolbar = element("edit-actions", { height: 36 });
  const body = element("");
  const header = element("doc-topbar", { bottom: 60, height: 60 });
  const state = { header, coarse: false };
  const context = vm.createContext({
    stickyToolbarFrame: 1,
    document: {
      body,
      querySelectorAll(selector) {
        assert.equal(selector, ".managed-block,.item-editor-block");
        return [heading, item, editor];
      },
      querySelector: () => state.header
    },
    window: { innerHeight: 800, innerWidth: 1000, matchMedia: () => ({ matches: state.coarse }) }
  });
  vm.runInContext(compiled, context);
  return { context, heading, item, editor, body, state, update: () => context.updateStickyBlockToolbar() };
}
function assertClear(node) {
  assert.equal(node.classList.contains("toolbar-stuck"), false);
  assert.equal(node.toolbar.style.getPropertyValue("--sticky-toolbar-top"), "");
  assert.equal(node.toolbar.style.getPropertyValue("--sticky-toolbar-right"), "");
}

test("item editor pins below AppBar, ahead of its heading toolbar", () => {
  const { update, editor, heading } = fixture();
  update();
  assert(editor.classList.contains("toolbar-stuck"));
  assert.equal(editor.toolbar.style.getPropertyValue("--sticky-toolbar-top"), "64px");
  assert.equal(editor.toolbar.style.getPropertyValue("--sticky-toolbar-right"), "268px");
  assertClear(heading);
});

test("editor toolbar returns inline on scrolling back and stops at the editor bottom", () => {
  const { update, editor, heading } = fixture();
  update();
  editor.rect.top = 80;
  update();
  assertClear(editor);
  assert(heading.classList.contains("toolbar-stuck"));
  editor.rect.top = -400;
  editor.rect.bottom = 90;
  update();
  assertClear(editor);
});

test("search-hidden editors are excluded and their pinned styles are removed", () => {
  const { update, editor, item } = fixture();
  update();
  item.classList.add("document-search-hidden");
  update();
  assertClear(editor);
});

test("dragging or leaving the file clears all floating controls", () => {
  const { update, editor, heading, body, state } = fixture();
  update();
  body.classList.add("dragging-block");
  update();
  assertClear(editor);
  assertClear(heading);
  body.classList.remove("dragging-block");
  update();
  state.header = null;
  update();
  assertClear(editor);
  assertClear(heading);
});

test("new standalone item editors also float and respond to AppBar height/mobile inset", () => {
  const { update, editor, state } = fixture();
  editor.parentElement = null;
  state.coarse = true;
  state.header.rect.bottom = 110;
  update();
  assert(editor.classList.contains("toolbar-stuck"));
  assert.equal(editor.toolbar.style.getPropertyValue("--sticky-toolbar-top"), "114px");
  assert.equal(editor.toolbar.style.getPropertyValue("--sticky-toolbar-right"), "266px");
});
