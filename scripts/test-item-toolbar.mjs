import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

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

const { selectStickyToolbarCandidate } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

function fixture() {
  const heading = {
    id: "heading-0",
    top: -200,
    bottom: 1100,
    right: 740,
    height: 1300,
    toolbarHeight: 36,
    depth: 0,
    isItemEditor: false,
    searchHidden: false,
  };
  const item = {
    id: "item-20",
    top: -50,
    bottom: 450,
    right: 740,
    height: 500,
    toolbarHeight: 36,
    depth: 1,
    isItemEditor: false,
    searchHidden: false,
  };
  const editor = {
    id: "__item_editor__",
    top: -40,
    bottom: 400,
    right: 740,
    height: 440,
    toolbarHeight: 36,
    depth: 2,
    isItemEditor: true,
    searchHidden: false,
  };
  const state = {
    headerBottom: 60,
    viewportHeight: 800,
    viewportWidth: 1000,
    coarsePointer: false,
    dragging: false,
  };

  return {
    heading,
    item,
    editor,
    state,
    run: () =>
      selectStickyToolbarCandidate({
        candidates: [heading, item, editor],
        ...state,
      }),
  };
}

test("item editor pins below AppBar, ahead of its heading toolbar", () => {
  const { run } = fixture();
  assert.deepEqual(run(), { id: "__item_editor__", top: 64, right: 268 });
});

test("editor toolbar returns inline on scrolling back and stops at the editor bottom", () => {
  const { run, editor } = fixture();
  editor.top = 80;
  assert.equal(run().id, "heading-0");

  editor.top = -400;
  editor.bottom = 90;
  assert.equal(run().id, "heading-0");
});

test("search-hidden blocks are excluded from sticky toolbar selection", () => {
  const { run, heading, item, editor } = fixture();
  editor.searchHidden = true;
  item.searchHidden = true;
  heading.searchHidden = true;
  assert.equal(run(), null);
});

test("dragging or missing header clears all floating controls", () => {
  const { run, state } = fixture();
  state.dragging = true;
  assert.equal(run(), null);
  state.dragging = false;
  state.headerBottom = null;
  assert.equal(run(), null);
});

test("standalone item editors respond to AppBar height and mobile inset", () => {
  const { run, editor, state } = fixture();
  editor.depth = 0;
  state.coarsePointer = true;
  state.headerBottom = 110;
  assert.deepEqual(run(), { id: "__item_editor__", top: 114, right: 266 });
});
