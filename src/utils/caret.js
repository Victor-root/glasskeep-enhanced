// The field being typed in, if any.
export function focusedEditable() {
  const el = document.activeElement;
  if (!el) return null;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? el : null;
}

// On screen box of the caret, or of the field when it has no caret of its own
// to measure (<input>, <textarea>). A collapsed range on an empty line has no
// box at all: the line it sits on stands in for it, never the whole editor.
export function caretRect(el) {
  if (!el.isContentEditable) return el.getBoundingClientRect();
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return el.getBoundingClientRect();
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.height) return rect;
  const { startContainer: node, startOffset } = range;
  const host = node.nodeType === Node.ELEMENT_NODE
    ? node.childNodes[startOffset] ?? node
    : node.parentElement;
  const line = host?.getBoundingClientRect?.() ?? host?.parentElement?.getBoundingClientRect();
  return line?.height ? line : node.parentElement.getBoundingClientRect();
}
