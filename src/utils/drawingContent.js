// A drawing note's `content` is JSON: { paths, dimensions, text }, where
// `text` is the caption typed under the drawing. Very old notes stored the
// bare paths array.
//
// Returns the drawing without its caption, and the caption. Throws on
// invalid JSON, like JSON.parse.
export function parseDrawingContent(content) {
  const parsed = JSON.parse(content || "[]");
  const normalized = Array.isArray(parsed) ? { paths: parsed, dimensions: null } : parsed;
  const text = normalized.text || "";
  const { text: _text, ...drawing } = normalized;
  return { drawing, text };
}

// Whether a drawing note's content (JSON text, or already parsed) holds at
// least one stroke. Unreadable content holds none.
export function drawingHasStrokes(content) {
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    if (Array.isArray(parsed)) return parsed.some((p) => p?.points?.length);
    if (Array.isArray(parsed?.paths)) return parsed.paths.some((p) => p?.points?.length);
    return false;
  } catch { return false; }
}
