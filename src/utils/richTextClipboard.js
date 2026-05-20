// Outbound clipboard helpers for GlassKeep rich-text notes.
//
// ProseMirror's default text serialiser joins block boundaries with
// double newlines, so pasting an edit-mode selection into Notepad ends
// up riddled with blank lines — especially around lists and headings.
// These walkers emit one line per block, prefix list items with their
// bullet/number, indent nested lists two spaces per level, and only
// keep the blank lines the user actually wrote as empty paragraphs.
//
// Intent: only affect the outbound `text/plain` payload. The `text/html`
// side of the clipboard is left untouched, so users who paste into
// another rich-text target still get full fidelity.

/* -------------------- ProseMirror / Tiptap slice -------------------- */

/**
 * Converts a ProseMirror Slice (the active editor selection) into
 * plain text. Wire via `editorProps.clipboardTextSerializer` so PM
 * uses it whenever the editor produces `text/plain`.
 */
export function sliceToCleanPlainText(slice) {
  if (!slice || !slice.content) return "";
  const lines = [];
  fragmentToLines(slice.content, lines, "");
  return joinLines(lines);
}

function fragmentToLines(fragment, lines, indent) {
  fragment.forEach((node) => {
    nodeToLines(node, lines, indent);
  });
}

function nodeToLines(node, lines, indent) {
  const type = node.type?.name;
  switch (type) {
    case "paragraph":
    case "heading":
      lines.push(indent + inlineNodeText(node));
      return;
    case "orderedList": {
      let n = 1;
      const start = node.attrs?.start;
      if (Number.isFinite(start) && start > 0) n = start;
      node.content.forEach((item) => {
        listItemToLines(item, lines, indent, `${n}. `);
        n += 1;
      });
      return;
    }
    case "bulletList":
      node.content.forEach((item) => {
        listItemToLines(item, lines, indent, "- ");
      });
      return;
    case "blockquote":
      // No "> " prefix — Notepad would render it literally; cleaner
      // to flatten the quoted blocks as plain paragraphs.
      fragmentToLines(node.content, lines, indent);
      return;
    case "codeBlock": {
      const text = node.textContent || "";
      text.split("\n").forEach((line) => lines.push(indent + line));
      return;
    }
    case "horizontalRule":
      lines.push("");
      return;
    default:
      if (node.isBlock) {
        const text = inlineNodeText(node) || node.textContent || "";
        lines.push(indent + text);
      }
      return;
  }
}

function listItemToLines(item, lines, indent, prefix) {
  let firstLineDone = false;
  const childIndent = indent + "  ";
  item.content?.forEach((child) => {
    const type = child.type?.name;
    if (!firstLineDone && (type === "paragraph" || type === "heading")) {
      lines.push(indent + prefix + inlineNodeText(child));
      firstLineDone = true;
      return;
    }
    nodeToLines(child, lines, childIndent);
  });
  if (!firstLineDone) {
    lines.push(indent + prefix.trimEnd());
  }
}

function inlineNodeText(node) {
  let out = "";
  node.content?.forEach((child) => {
    if (child.isText) {
      out += child.text || "";
    } else if (child.type?.name === "hardBreak") {
      out += "\n";
    } else {
      out += child.textContent || "";
    }
  });
  return out;
}

/* -------------------- DOM (read-only viewer) -------------------- */

/**
 * Reads the current `window.getSelection()` and returns a cleaned
 * plain-text version of it, or `null` when there's nothing to copy.
 * Used by the read-only NoteViewContent so its copy output matches
 * the edit-mode behaviour.
 */
export function domSelectionToCleanPlainText() {
  if (typeof window === "undefined") return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;
  const fragment = range.cloneContents();
  // When a selection spans several <li> children of the same <ul>/<ol>, the
  // Range cloneContents() algorithm omits the wrapping list element — the
  // fragment ends up with bare <li> nodes at its top level. domNodeToLines
  // doesn't have a list-item case (those are handled by the parent list
  // branch), so bare <li> nodes would fall through to the default branch
  // and get concatenated as inline content. Re-wrap them in the original
  // list container so the list walker handles them properly.
  restoreListWrapper(fragment, range);
  const lines = [];
  fragment.childNodes.forEach((child) => domNodeToLines(child, lines, ""));
  return joinLines(lines);
}

function restoreListWrapper(fragment, range) {
  let ancestor = range.commonAncestorContainer;
  if (ancestor && ancestor.nodeType !== Node.ELEMENT_NODE) {
    ancestor = ancestor.parentElement;
  }
  if (!ancestor) return;
  const tag = ancestor.tagName?.toLowerCase?.();
  if (tag !== "ul" && tag !== "ol") return;
  const hasBareLi = Array.from(fragment.childNodes).some(
    (n) =>
      n.nodeType === Node.ELEMENT_NODE &&
      n.tagName?.toLowerCase() === "li",
  );
  if (!hasBareLi) return;
  const doc = fragment.ownerDocument || document;
  const wrapper = doc.createElement(tag);
  if (tag === "ol") {
    // Compute the visible numbering of the first selected <li> so the
    // copied list keeps the user-visible numbers, not "1." regardless of
    // selection start.
    const originalStart = Number(ancestor.getAttribute("start")) || 1;
    const lis = Array.from(ancestor.children).filter(
      (c) => c.tagName?.toLowerCase() === "li",
    );
    let offset = 0;
    for (let i = 0; i < lis.length; i++) {
      try {
        if (range.intersectsNode(lis[i])) {
          offset = i;
          break;
        }
      } catch {
        break;
      }
    }
    wrapper.setAttribute("start", String(originalStart + offset));
  }
  while (fragment.firstChild) {
    wrapper.appendChild(fragment.firstChild);
  }
  fragment.appendChild(wrapper);
}

function domNodeToLines(node, lines, indent) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    if (!text) return;
    if (lines.length === 0) lines.push(indent + text);
    else lines[lines.length - 1] += text;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case "p":
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
      lines.push(indent + collectDomInlineText(node));
      return;
    case "br":
      if (lines.length === 0) lines.push("");
      lines[lines.length - 1] += "\n";
      return;
    case "ol": {
      let n = 1;
      const startAttr = node.getAttribute("start");
      const startNum = Number(startAttr);
      if (Number.isFinite(startNum) && startNum > 0) n = startNum;
      node.childNodes.forEach((child) => {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          child.tagName.toLowerCase() === "li"
        ) {
          domListItemToLines(child, lines, indent, `${n}. `);
          n += 1;
        }
      });
      return;
    }
    case "ul":
      node.childNodes.forEach((child) => {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          child.tagName.toLowerCase() === "li"
        ) {
          domListItemToLines(child, lines, indent, "- ");
        }
      });
      return;
    case "blockquote":
      node.childNodes.forEach((child) => domNodeToLines(child, lines, indent));
      return;
    case "pre": {
      const text = node.textContent || "";
      text.split("\n").forEach((line) => lines.push(indent + line));
      return;
    }
    case "hr":
      lines.push("");
      return;
    default: {
      // Inline element (span, strong, em, a, code, …) — append its
      // collected text to the current line, OR start a new line if
      // we haven't produced one yet.
      const text = collectDomInlineText(node);
      if (!text) return;
      if (lines.length === 0) lines.push(indent + text);
      else lines[lines.length - 1] += text;
      return;
    }
  }
}

function domListItemToLines(item, lines, indent, prefix) {
  let firstLineDone = false;
  const childIndent = indent + "  ";
  item.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent || "").replace(/^\s+|\s+$/g, "");
      if (!text) return;
      if (!firstLineDone) {
        lines.push(indent + prefix + text);
        firstLineDone = true;
      } else if (lines.length > 0) {
        lines[lines.length - 1] += text;
      }
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const tag = child.tagName.toLowerCase();
    if (!firstLineDone && (tag === "p" || /^h[1-6]$/.test(tag))) {
      lines.push(indent + prefix + collectDomInlineText(child));
      firstLineDone = true;
      return;
    }
    if (tag === "ol" || tag === "ul" || tag === "pre" || tag === "blockquote") {
      domNodeToLines(child, lines, childIndent);
      return;
    }
    if (!firstLineDone) {
      lines.push(indent + prefix + collectDomInlineText(child));
      firstLineDone = true;
    } else {
      domNodeToLines(child, lines, childIndent);
    }
  });
  if (!firstLineDone) {
    lines.push(indent + prefix.trimEnd());
  }
}

function collectDomInlineText(el) {
  let out = "";
  el.childNodes.forEach((c) => {
    if (c.nodeType === Node.TEXT_NODE) {
      out += c.textContent || "";
    } else if (c.nodeType === Node.ELEMENT_NODE) {
      if (c.tagName.toLowerCase() === "br") {
        out += "\n";
      } else {
        out += collectDomInlineText(c);
      }
    }
  });
  return out;
}

/* -------------------- shared -------------------- */

function joinLines(lines) {
  return lines
    .join("\n")
    // Collapse triple-plus newlines (created when we emit empty lines
    // for horizontalRule or whitespace-only paragraphs near a real
    // empty paragraph) to a single blank line.
    .replace(/\n{3,}/g, "\n\n")
    // Trim trailing whitespace / newlines, but keep leading ones
    // (the user might have started with an empty paragraph on
    // purpose).
    .replace(/\s+$/g, "");
}
