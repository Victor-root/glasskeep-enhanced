import { parseRGBA } from "../../utils/colors.js";
import { isRichContent, contentToHTML } from "../../utils/richText.js";
import { renderSafeMarkdown } from "../../utils/markdown.jsx";

// Note rendering helpers shared by the TV card and detail viewer.

export function isColorDark(rgba) {
  const { r, g, b } = parseRGBA(rgba);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}

// Rich (Tiptap) content to HTML, anything else as Markdown.
export function textToHtml(text) {
  return isRichContent(text) ? contentToHTML(text) : renderSafeMarkdown(text);
}

// The companion text of a drawing note, as HTML ("" when none or unreadable).
export function drawingTextHtml(content) {
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    const txt = parsed?.text || "";
    if (!txt) return "";
    return textToHtml(txt);
  } catch { return ""; }
}
