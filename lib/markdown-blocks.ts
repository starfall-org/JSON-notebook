export type MarkdownBlock = {
  id: string;
  type: "heading" | "item" | "code" | "other" | "divider";
  start: number;
  end: number;
  raw: string;
  level?: number;
  indent?: string;
  value?: string;
  language?: string;
};

export type ItemCodeDraft = {
  blockId?: string;
  value: string;
  language: string;
  indent: string;
};

export type EditState = {
  mode: "new" | "edit";
  type: "heading" | "item" | "code" | "other";
  blockId?: string;
  insertAt: number;
  level?: number;
  indent?: string;
  parentIndent?: string;
  parentBlockId?: string;
  value: string;
  language?: string;
  itemCodes?: ItemCodeDraft[];
};

export type DropMode = "before" | "inside" | "after";

export type DocumentTreeNode =
  | {
      kind: "heading";
      block: MarkdownBlock;
      rangeEnd: number;
      children: DocumentTreeNode[];
    }
  | {
      kind: "item";
      block: MarkdownBlock;
      rangeEnd: number;
      children: DocumentTreeNode[];
    }
  | {
      kind: "leaf";
      block: MarkdownBlock;
    };

export function isThematicBreak(line: string) {
  const leading = line.match(/^ */)?.[0].length || 0;
  if (leading > 3) return false;

  const trimmed = line.trim();
  return (
    /^(?:\*(?:[ \t]*\*){2,})$/.test(trimmed) ||
    /^(?:-(?:[ \t]*-){2,})$/.test(trimmed) ||
    /^(?:_(?:[ \t]*_){2,})$/.test(trimmed)
  );
}

export function isManagedLine(line: string) {
  return (
    /^ {0,3}#{1,6}[ \t]+.+/.test(line) ||
    /^\s*-\s+\*\*.+?\*\*\s*$/.test(line) ||
    /^\s*\x60{3,}[^\x60]*$/.test(line) ||
    isThematicBreak(line)
  );
}

export function nextLineEnd(source: string, start: number) {
  const newline = source.indexOf("\n", start);
  return newline < 0 ? source.length : newline + 1;
}

export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let position = 0;

  while (position < source.length) {
    const end = nextLineEnd(source, position);
    const rawLine = source.slice(position, end);
    const line = rawLine.replace(/\n$/, "");

    const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/);
    if (heading) {
      blocks.push({
        id: "heading-" + position,
        type: "heading",
        start: position,
        end,
        raw: rawLine,
        level: heading[1].length,
        value: heading[2],
      });
      position = end;
      continue;
    }

    if (isThematicBreak(line)) {
      blocks.push({
        id: "divider-" + position,
        type: "divider",
        start: position,
        end,
        raw: rawLine,
        value: line.trim(),
      });
      position = end;
      continue;
    }

    const item = line.match(/^(\s*)-\s+\*\*(.+?)\*\*\s*$/);
    if (item) {
      blocks.push({
        id: "item-" + position,
        type: "item",
        start: position,
        end,
        raw: rawLine,
        indent: item[1],
        value: item[2],
      });
      position = end;
      continue;
    }

    const opening = line.match(/^(\s*)(\x60{3,})([^\x60]*)$/);
    if (opening) {
      const indent = opening[1];
      const marker = opening[2];
      const language = opening[3].trim();
      const codeStart = end;
      let scan = end;
      let closeStart = source.length;
      let closeEnd = source.length;

      while (scan < source.length) {
        const scanEnd = nextLineEnd(source, scan);
        const scanLine = source.slice(scan, scanEnd).replace(/\n$/, "");
        if (scanLine === indent + marker) {
          closeStart = scan;
          closeEnd = scanEnd;
          break;
        }
        scan = scanEnd;
      }

      const codeSource = source.slice(codeStart, closeStart);
      const codeValue = codeSource
        .split("\n")
        .map((codeLine) =>
          codeLine.startsWith(indent) ? codeLine.slice(indent.length) : codeLine,
        )
        .join("\n")
        .replace(/\n$/, "");

      blocks.push({
        id: "code-" + position,
        type: "code",
        start: position,
        end: closeEnd,
        raw: source.slice(position, closeEnd),
        indent,
        value: codeValue,
        language,
      });
      position = closeEnd;
      continue;
    }

    let scan = end;
    while (scan < source.length) {
      const scanEnd = nextLineEnd(source, scan);
      const scanLine = source.slice(scan, scanEnd).replace(/\n$/, "");
      if (isManagedLine(scanLine)) break;
      scan = scanEnd;
    }

    const raw = source.slice(position, scan);
    const rawLines = raw.replace(/\n$/, "").split("\n");
    const nonBlankLines = rawLines.filter((candidate) => candidate.trim());
    const otherIndentLength = nonBlankLines.length
      ? Math.min(...nonBlankLines.map((candidate) => candidate.match(/^ */)?.[0].length || 0))
      : 0;
    const otherIndent = " ".repeat(otherIndentLength);
    const otherValue = rawLines
      .map((candidate) =>
        candidate.trim() && candidate.startsWith(otherIndent)
          ? candidate.slice(otherIndent.length)
          : candidate,
      )
      .join("\n")
      .trimEnd();

    blocks.push({
      id: "other-" + position,
      type: "other",
      start: position,
      end: scan,
      raw,
      indent: otherIndent,
      value: otherValue,
    });
    position = scan;
  }

  return blocks;
}

export function blockMoveRange(
  block: MarkdownBlock,
  blocks: MarkdownBlock[],
  sourceLength?: number,
) {
  const index = blocks.findIndex((item) => item.id === block.id);
  if (index < 0) return { start: block.start, end: block.end };

  const docEnd = sourceLength ?? (blocks.length ? blocks[blocks.length - 1].end : block.end);

  if (block.type === "heading") {
    const level = block.level || 1;
    let end = docEnd;

    for (let nextIndex = index + 1; nextIndex < blocks.length; nextIndex += 1) {
      const next = blocks[nextIndex];
      if (
        next.type === "divider" ||
        (next.type === "heading" && (next.level || 1) <= level)
      ) {
        end = next.start;
        break;
      }
    }

    return { start: block.start, end };
  }

  if (block.type === "item") {
    const baseIndent = (block.indent || "").length;
    const minimumCodeIndent = baseIndent + 2;
    const minimumRawIndent = baseIndent + 2;
    let end = block.end;
    let indexAfter = index + 1;

    while (indexAfter < blocks.length) {
      const next = blocks[indexAfter];

      if (next.type === "other" && next.raw.trim() === "") {
        const following = blocks[indexAfter + 1];
        const nestedFollowing =
          (following?.type === "code" &&
            (following.indent || "").length >= minimumCodeIndent) ||
          (following?.type === "other" &&
            (following.indent || "").length >= minimumRawIndent);
        if (nestedFollowing) {
          end = next.end;
          indexAfter += 1;
          continue;
        }
        break;
      }

      if (next.type === "code" && (next.indent || "").length >= minimumCodeIndent) {
        end = next.end;
        indexAfter += 1;
        continue;
      }

      if (next.type === "other" && (next.indent || "").length >= minimumRawIndent) {
        end = next.end;
        indexAfter += 1;
        continue;
      }

      break;
    }

    return { start: block.start, end };
  }

  return { start: block.start, end: block.end };
}

export function buildDocumentTree(source: string): DocumentTreeNode[] {
  const blocks = parseMarkdownBlocks(source);

  const buildItemGroup = (index: number): { node: DocumentTreeNode; next: number } => {
    const item = blocks[index];
    const range = blockMoveRange(item, blocks, source.length);
    const children: DocumentTreeNode[] = [];
    let next = index + 1;

    while (next < blocks.length && blocks[next].start < range.end) {
      const child = blocks[next];
      if (child.type !== "other" || child.raw.trim() !== "") {
        children.push({ kind: "leaf", block: child });
      }
      next += 1;
    }

    return {
      node: {
        kind: "item",
        block: item,
        rangeEnd: range.end,
        children,
      },
      next,
    };
  };

  const buildBranch = (index: number): { node: DocumentTreeNode; next: number } => {
    const heading = blocks[index];
    const level = heading.level || 1;
    const range = blockMoveRange(heading, blocks, source.length);
    const children: DocumentTreeNode[] = [];
    let next = index + 1;

    while (next < blocks.length) {
      const block = blocks[next];
      if (block.type === "divider") break;

      if (block.type === "heading") {
        const childLevel = block.level || 1;
        if (childLevel <= level) break;

        const child = buildBranch(next);
        children.push(child.node);
        next = child.next;
        continue;
      }

      if (block.type === "item") {
        const item = buildItemGroup(next);
        children.push(item.node);
        next = item.next;
        continue;
      }

      if (block.type !== "other" || block.raw.trim() !== "") {
        children.push({ kind: "leaf", block });
      }
      next += 1;
    }

    return {
      node: {
        kind: "heading",
        block: heading,
        rangeEnd: range.end,
        children,
      },
      next,
    };
  };

  const root: DocumentTreeNode[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];
    if (block.type === "heading") {
      const branch = buildBranch(index);
      root.push(branch.node);
      index = branch.next;
      continue;
    }

    if (block.type === "item") {
      const item = buildItemGroup(index);
      root.push(item.node);
      index = item.next;
      continue;
    }

    if (block.type !== "other" || block.raw.trim() !== "") {
      root.push({ kind: "leaf", block });
    }
    index += 1;
  }

  return root;
}

export function nearestStructuralParent(
  block: MarkdownBlock,
  blocks: MarkdownBlock[],
): MarkdownBlock | null {
  let owner: MarkdownBlock | null = null;

  for (const candidate of blocks) {
    if (candidate.id === block.id) continue;
    if (candidate.type !== "heading" && candidate.type !== "item") continue;
    if (candidate.start >= block.start) continue;

    const range = blockMoveRange(candidate, blocks);
    if (block.start >= range.end) continue;

    if (
      !owner ||
      candidate.start > owner.start ||
      (candidate.start === owner.start &&
        candidate.type === "item" &&
        owner.type === "heading")
    ) {
      owner = candidate;
    }
  }

  return owner;
}

export function normalizeNestedCodeIndent(source: string) {
  const lines = source.split("\n");
  const itemStack: string[] = [];

  const popToParentForIndent = (indentLength: number) => {
    while (itemStack.length && itemStack[itemStack.length - 1].length >= indentLength) {
      itemStack.pop();
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^ {0,3}#{1,6}[ \t]+/.test(line)) {
      itemStack.length = 0;
      continue;
    }

    const item = line.match(/^(\s*)-\s+\*\*.+?\*\*\s*$/);
    if (item) {
      popToParentForIndent(item[1].length);
      itemStack.push(item[1]);
      continue;
    }

    if (!line.trim()) continue;

    const opening = line.match(/^(\s*)(\x60{3,})([^\x60]*)$/);
    if (opening) {
      const currentIndent = opening[1];
      popToParentForIndent(currentIndent.length);

      if (!itemStack.length) {
        const marker = opening[2];
        for (let scan = index + 1; scan < lines.length; scan += 1) {
          if (lines[scan] === currentIndent + marker) {
            index = scan;
            break;
          }
        }
        continue;
      }

      const ownerIndent = itemStack[itemStack.length - 1];
      const wantedIndent = ownerIndent + "  ";
      const marker = opening[2];

      lines[index] = wantedIndent + line.slice(currentIndent.length);

      for (let scan = index + 1; scan < lines.length; scan += 1) {
        const scanLine = lines[scan];

        if (scanLine.startsWith(currentIndent)) {
          lines[scan] = wantedIndent + scanLine.slice(currentIndent.length);
        }

        if (scanLine === currentIndent + marker) {
          index = scan;
          break;
        }
      }

      continue;
    }

    const indentLength = line.match(/^ */)?.[0].length || 0;
    popToParentForIndent(indentLength);
  }

  return lines.join("\n");
}

export async function formatMarkdown(source: string) {
  const [prettier, markdownPlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/markdown"),
  ]);
  const normalizedSource = normalizeNestedCodeIndent(source);
  const formatted = await prettier.format(normalizedSource, {
    parser: "markdown",
    plugins: [markdownPlugin],
    proseWrap: "preserve",
  });
  return normalizeNestedCodeIndent(formatted);
}

export function codeFenceFor(value: string) {
  let max = 2;
  for (const match of value.matchAll(/\x60+/g)) max = Math.max(max, match[0].length);
  return String.fromCharCode(96).repeat(max + 1);
}

export function serializeEdit(state: EditState) {
  if (state.type === "other") {
    const value = state.value.trimEnd();
    if (!value) throw new Error("Markdown required");
    const indent = state.indent || "";
    return (
      value
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => (line ? indent + line : ""))
        .join("\n") + "\n"
    );
  }

  if (state.type === "heading") {
    const value = state.value.trim();
    if (!value) throw new Error("Heading name required");
    return "#".repeat(Math.max(1, Math.min(6, state.level || 1))) + " " + value + "\n";
  }

  if (state.type === "item") {
    const value = state.value.trim();
    if (!value) throw new Error("Item name required");
    return (state.indent || "") + "- **" + value + "**\n";
  }

  const indent = state.indent || "";
  const marker = codeFenceFor(state.value);
  const language = state.language?.trim() || "";
  const clean = state.value.replace(/\r\n/g, "\n").replace(/\n$/, "");
  const body = clean
    ? clean
        .split("\n")
        .map((line) => indent + line)
        .join("\n") + "\n"
    : "";

  return indent + marker + language + "\n" + body + indent + marker + "\n";
}

export function insertMarkdownBlock(source: string, at: number, block: string) {
  const before = source.slice(0, at).replace(/\n*$/, "");
  const after = source.slice(at).replace(/^\n*/, "");
  return (
    before +
    (before ? "\n\n" : "") +
    block.trimEnd() +
    (after ? "\n\n" + after : "\n")
  );
}

export function createEditStateForBlock(
  source: string,
  block: MarkdownBlock,
): EditState {
  const blocks = parseMarkdownBlocks(source);
  const parentItem = blocks.find((candidate) => {
    if (candidate.type !== "item" || candidate.id === block.id) return false;
    const range = blockMoveRange(candidate, blocks, source.length);
    return block.start > candidate.start && block.start < range.end;
  });

  return {
    mode: "edit",
    type: block.type === "divider" ? "other" : block.type,
    blockId: block.id,
    insertAt: block.start,
    level: block.level,
    indent: block.indent || "",
    parentIndent: parentItem?.indent,
    value: block.value ?? block.raw.trimEnd(),
    language: block.language || "",
    itemCodes:
      block.type === "item"
        ? blocks
            .filter(
              (candidate) =>
                candidate.type === "code" &&
                nearestStructuralParent(candidate, blocks)?.id === block.id,
            )
            .map((code) => ({
              blockId: code.id,
              value: code.value || "",
              language: code.language || "",
              indent: code.indent || "",
            }))
        : undefined,
  };
}

export function sourceWithEdit(source: string, state: EditState) {
  const replacement = serializeEdit(state);
  const codes = state.type === "item" ? state.itemCodes || [] : [];
  const serializeCode = (code: ItemCodeDraft) =>
    serializeEdit({
      mode: "new",
      type: "code",
      insertAt: 0,
      value: code.value,
      language: code.language,
      indent: code.indent,
    });

  if (state.mode === "new") {
    const content = [replacement, ...codes.map(serializeCode)].join("\n");
    return insertMarkdownBlock(source, state.insertAt, content);
  }

  const blocks = parseMarkdownBlocks(source);
  const block = blocks.find((candidate) => candidate.id === state.blockId);
  if (!block) throw new Error("Block not found");

  const operations = [{ start: block.start, end: block.end, text: replacement }];
  for (const code of codes.filter((item) => item.blockId)) {
    const original = blocks.find((candidate) => candidate.id === code.blockId);
    if (
      !original ||
      original.type !== "code" ||
      nearestStructuralParent(original, blocks)?.id !== block.id
    ) {
      throw new Error("Item code block not found");
    }
    operations.push({
      start: original.start,
      end: original.end,
      text: serializeCode(code),
    });
  }

  const addedCodes = codes.filter((item) => !item.blockId);
  if (addedCodes.length) {
    // Insert at the original item's end first so earlier source offsets remain valid.
    const at = blockMoveRange(block, blocks, source.length).end;
    const addition = "\n\n" + addedCodes.map(serializeCode).join("\n") + "\n";
    source = source.slice(0, at) + addition + source.slice(at);
  }

  for (const operation of operations.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, operation.start) + operation.text + source.slice(operation.end);
  }
  return source;
}

export function deleteWithOwnedContent(
  source: string,
  block: MarkdownBlock,
  blocks: MarkdownBlock[] = parseMarkdownBlocks(source),
) {
  const removable = new Set<string>([block.id]);
  const replacements = new Map<string, string>();

  if (block.type === "heading" || block.type === "item") {
    for (const candidate of blocks) {
      if (candidate.type !== "code" && candidate.type !== "other") continue;
      const owner = nearestStructuralParent(candidate, blocks);
      if (owner?.id === block.id) removable.add(candidate.id);
    }
  }

  if (block.type === "heading") {
    const range = blockMoveRange(block, blocks, source.length);

    for (const candidate of blocks) {
      if (
        candidate.type !== "heading" ||
        candidate.id === block.id ||
        candidate.start <= block.start ||
        candidate.start >= range.end
      ) {
        continue;
      }

      replacements.set(
        candidate.id,
        candidate.raw.replace(
          /^( {0,3})#{2,6}([ \t]+)/,
          (_match, indent: string, gap: string) =>
            indent + "#".repeat(Math.max(1, (candidate.level || 1) - 1)) + gap,
        ),
      );
    }
  }

  const operations = blocks
    .filter((candidate) => removable.has(candidate.id) || replacements.has(candidate.id))
    .map((candidate) => ({
      start: candidate.start,
      end: candidate.end,
      text: removable.has(candidate.id)
        ? ""
        : replacements.get(candidate.id) || candidate.raw,
    }))
    .sort((a, b) => b.start - a.start);

  let output = source;
  for (const operation of operations) {
    output = output.slice(0, operation.start) + operation.text + output.slice(operation.end);
  }
  return output;
}

export function reindentCodeSource(raw: string, fromIndent: string, toIndent: string) {
  return raw
    .split("\n")
    .map((line) => {
      if (!line) return line;
      const without =
        fromIndent && line.startsWith(fromIndent) ? line.slice(fromIndent.length) : line;
      return toIndent + without;
    })
    .join("\n");
}

export function shiftHeadingSubtree(
  raw: string,
  source: MarkdownBlock,
  sourceRange: { start: number; end: number },
  blocks: MarkdownBlock[],
  desiredRootLevel: number,
) {
  if (source.type !== "heading") return raw;

  const headings = blocks.filter(
    (block) =>
      block.type === "heading" &&
      block.start >= sourceRange.start &&
      block.start < sourceRange.end,
  );

  const levels = headings.map((block) => block.level || 1);
  if (!levels.length) return raw;

  const requestedDelta = desiredRootLevel - (source.level || 1);
  const minDelta = 1 - Math.min(...levels);
  const maxDelta = 6 - Math.max(...levels);
  const delta = Math.max(minDelta, Math.min(maxDelta, requestedDelta));
  if (!delta) return raw;

  let output = raw;
  for (const heading of [...headings].reverse()) {
    const relativeStart = heading.start - sourceRange.start;
    const relativeEnd = heading.end - sourceRange.start;
    const shifted = heading.raw.replace(
      /^( {0,3})#{1,6}([ \t]+)/,
      (_match, indent: string, gap: string) =>
        indent + "#".repeat((heading.level || 1) + delta) + gap,
    );
    output = output.slice(0, relativeStart) + shifted + output.slice(relativeEnd);
  }

  return output;
}

export function owningHeadingForBlock(target: MarkdownBlock, blocks: MarkdownBlock[]) {
  let owner: MarkdownBlock | null = null;

  for (const candidate of blocks) {
    if (candidate.type !== "heading" || candidate.id === target.id) continue;

    const range = blockMoveRange(candidate, blocks);
    if (target.start <= candidate.start || target.start >= range.end) continue;

    if (
      !owner ||
      (candidate.level || 1) > (owner.level || 1) ||
      ((candidate.level || 1) === (owner.level || 1) && candidate.start > owner.start)
    ) {
      owner = candidate;
    }
  }

  return owner;
}

export function desiredHeadingLevelForDrop(
  target: MarkdownBlock,
  mode: DropMode,
  blocks: MarkdownBlock[],
) {
  if (target.type === "heading") {
    return mode === "inside"
      ? Math.min(6, (target.level || 1) + 1)
      : target.level || 1;
  }

  const owner = owningHeadingForBlock(target, blocks);
  return owner ? Math.min(6, (owner.level || 1) + 1) : 1;
}

export function moveBlockSource(
  currentContent: string,
  sourceId: string,
  targetId: string,
  mode: DropMode,
): string | null {
  const blocks = parseMarkdownBlocks(currentContent);
  const source = blocks.find((block) => block.id === sourceId);
  const target = blocks.find((block) => block.id === targetId);
  if (!source || !target || source.id === target.id) return null;

  const sourceRange = blockMoveRange(source, blocks, currentContent.length);
  if (target.start >= sourceRange.start && target.start < sourceRange.end) return null;

  const targetRange = blockMoveRange(target, blocks, currentContent.length);
  let insertAt =
    mode === "inside"
      ? targetRange.end
      : mode === "after"
        ? targetRange.end
        : target.start;

  let moving = currentContent.slice(sourceRange.start, sourceRange.end);

  if (source.type === "heading") {
    const desiredLevel = desiredHeadingLevelForDrop(target, mode, blocks);
    moving = shiftHeadingSubtree(moving, source, sourceRange, blocks, desiredLevel);
  }

  if (
    source.type === "code" &&
    sourceRange.start === source.start &&
    sourceRange.end === source.end
  ) {
    const owningItem = [...blocks].reverse().find((candidate) => {
      if (candidate.type !== "item" || candidate.id === source.id) return false;
      const range = blockMoveRange(candidate, blocks, currentContent.length);
      return target.start > candidate.start && target.start < range.end;
    });

    const targetIndent =
      mode === "inside" && target.type === "item"
        ? (target.indent || "") + "  "
        : owningItem
          ? (owningItem.indent || "") + "  "
          : "";

    moving = reindentCodeSource(moving, source.indent || "", targetIndent);
  }

  const remaining =
    currentContent.slice(0, sourceRange.start) + currentContent.slice(sourceRange.end);
  if (insertAt > sourceRange.end) insertAt -= sourceRange.end - sourceRange.start;

  return insertMarkdownBlock(remaining, insertAt, moving);
}

export function dragLabel(block: MarkdownBlock) {
  const value = (block.value || "").trim().replace(/\s+/g, " ");
  if (value) return value.slice(0, 48);
  if (block.type === "code") return "Code block";
  if (block.type === "item") return "Item";
  if (block.type === "heading") return "Branch";
  return "Block";
}

export type StickyCandidateInput = {
  id: string;
  top: number;
  bottom: number;
  right: number;
  height: number;
  toolbarHeight: number;
  depth: number;
  isItemEditor: boolean;
  searchHidden?: boolean;
};

export function selectStickyToolbarCandidate(params: {
  candidates: StickyCandidateInput[];
  headerBottom: number | null;
  viewportHeight: number;
  viewportWidth: number;
  coarsePointer: boolean;
  dragging: boolean;
}): { id: string; top: number; right: number } | null {
  const {
    candidates,
    headerBottom,
    viewportHeight,
    viewportWidth,
    coarsePointer,
    dragging,
  } = params;
  if (headerBottom === null || dragging) return null;

  const stickyTop = Math.ceil(headerBottom + 4);
  const availableHeight = Math.max(1, viewportHeight - stickyTop);

  const valid = candidates
    .filter((candidate) => {
      if (candidate.searchHidden || candidate.height <= 0) return false;
      const bottomInset = candidate.isItemEditor
        ? Math.max(8, candidate.toolbarHeight)
        : 8;
      if (
        candidate.top >= stickyTop ||
        candidate.bottom <= stickyTop + bottomInset ||
        (!candidate.isItemEditor && candidate.height <= availableHeight)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.depth - a.depth || a.height - b.height);

  const selected = valid[0];
  if (!selected) return null;

  const inset = coarsePointer ? 6 : 8;
  const right = Math.max(inset, Math.round(viewportWidth - selected.right + inset));
  return { id: selected.id, top: stickyTop, right };
}

export function matchDocumentSections(
  tree: DocumentTreeNode[],
  rawQuery: string,
  activeEditorParentId?: string,
): {
  matchedIds: string[];
  visibleBlockIds: Set<string>;
} {
  const needle = rawQuery.trim().toLowerCase();
  if (!needle) {
    return { matchedIds: [], visibleBlockIds: new Set() };
  }

  const matchedIds: string[] = [];
  const visibleBlockIds = new Set<string>();

  const collectAllIds = (node: DocumentTreeNode) => {
    visibleBlockIds.add(node.block.id);
    if (node.kind === "heading" || node.kind === "item") {
      node.children.forEach(collectAllIds);
    }
  };

  const walk = (node: DocumentTreeNode, ancestors: string[]) => {
    const id = node.block.id;
    const isEditorOwner = Boolean(activeEditorParentId && activeEditorParentId === id);
    if (isEditorOwner) {
      ancestors.forEach((ancestorId) => visibleBlockIds.add(ancestorId));
      visibleBlockIds.add(id);
    }

    if (node.kind === "heading" || node.kind === "item") {
      const ownTitle = (node.block.value || "").toLowerCase();
      if (ownTitle.includes(needle)) {
        matchedIds.push(id);
        ancestors.forEach((ancestorId) => visibleBlockIds.add(ancestorId));
        collectAllIds(node);
      }
      const nextAncestors = [...ancestors, id];
      for (const child of node.children) {
        walk(child, nextAncestors);
      }
    }
  };

  for (const node of tree) {
    walk(node, []);
  }

  return { matchedIds, visibleBlockIds };
}
