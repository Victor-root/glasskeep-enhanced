// DOM helpers shared by the edit-mode extras (EditExtras) and the read-mode
// inline-code copy (inlineCodeCopy.js): which link / code element an event
// landed on, and whether the device has a coarse pointer.

export function hasCoarsePointer() {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.("(pointer: coarse)").matches || false;
  } catch {
    return false;
  }
}

// Tap events fire with a Text node as event.target when the tap lands
// on actual characters; Text nodes don't expose .closest(). Without
// normalising first, every "is this a link / code block / inline code"
// check silently failed on the most common case (tapping the text
// itself), which is what made mobile code-block taps look random.
function asElement(node) {
  if (!node) return null;
  if (node.nodeType === 1) return node;
  if (node.nodeType === 3) return node.parentElement;
  return node.parentElement || null;
}
export function eventElement(event) {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : null;
  if (Array.isArray(path)) {
    for (const item of path) {
      if (item && item.nodeType === 1) return item;
    }
  }
  return asElement(event.target);
}

// Tap-vs-scroll threshold measured from touchstart to touchend.
export const TAP_MOVE_PX = 24;

export function closestLink(node) {
  const el = asElement(node);
  if (!el || !el.closest) return null;
  return el.closest("a[href]");
}
export function closestInlineCode(node) {
  const el = asElement(node);
  if (!el || !el.closest) return null;
  const code = el.closest("code");
  if (!code) return null;
  if (code.closest("pre")) return null; // fenced block handled by NodeView
  return code;
}
export function closestCodeBlockWrapper(node) {
  const el = asElement(node);
  if (!el || !el.closest) return null;
  return el.closest(".code-block-wrapper");
}
export function isInsideCopyButton(node) {
  const el = asElement(node);
  if (!el || !el.closest) return false;
  return !!el.closest("[data-copy-btn='1']");
}
