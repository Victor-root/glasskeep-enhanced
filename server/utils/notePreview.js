// server/utils/notePreview.js
//
// A one-line plain-text preview of a note, for reminder notifications.

// Build a short, plain-text preview for a note that has no title, used as
// the reminder notification body. Defensive throughout: rich-text JSON,
// checklist items, draw-note text and legacy markdown are all reduced to
// a trimmed one-liner; anything unparseable just yields "".
function notePreviewText(note) {
  const title = (note.title || "").trim();
  if (title) return title.slice(0, 120);
  try {
    if (note.type === "checklist") {
      const items = JSON.parse(note.items_json || "[]");
      const texts = (Array.isArray(items) ? items : [])
        .map((i) => (i && typeof i.text === "string" ? i.text.trim() : ""))
        .filter(Boolean);
      if (texts.length) return texts.slice(0, 4).join(", ").slice(0, 120);
    }
  } catch {
    /* fall through */
  }
  let raw = note.content || "";
  if (note.type === "draw") {
    try {
      const p = typeof raw === "string" ? JSON.parse(raw) : raw;
      raw = (p && p.text) || "";
    } catch {
      raw = "";
    }
  }
  raw = String(raw);
  if (raw.trim().startsWith("{")) {
    // Rich-text (TipTap) JSON: walk the tree collecting text nodes.
    try {
      const json = JSON.parse(raw);
      const parts = [];
      const walk = (node) => {
        if (!node || typeof node !== "object") return;
        if (typeof node.text === "string") parts.push(node.text);
        if (Array.isArray(node.content)) node.content.forEach(walk);
      };
      walk(json);
      raw = parts.join(" ");
    } catch {
      /* leave raw as-is */
    }
  }
  // Strip light markdown punctuation and collapse whitespace.
  raw = raw.replace(/[#*_>`~]/g, " ").replace(/\s+/g, " ").trim();
  return raw.slice(0, 120);
}

module.exports = { notePreviewText };
