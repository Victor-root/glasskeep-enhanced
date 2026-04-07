import React from "react";
import { marked as markedParser } from "marked";
import DOMPurify from "dompurify";

// Ensure we can call marked.parse(...)
export const marked =
  typeof markedParser === "function" ? { parse: markedParser } : markedParser;

// Convert single newlines to <br> so line breaks render without whitespace-pre-wrap
if (marked.setOptions) marked.setOptions({ breaks: true });

/** ---------- Secure Markdown Renderer ---------- */
// Allowlist of tags produced by marked for standard markdown.
// SVG, style, script and all event-handler attributes are intentionally excluded.
const _PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "a", "b", "strong", "i", "em", "del", "s", "u",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "ul", "ol", "li",
    "blockquote",
    "pre", "code",
    "table", "thead", "tbody", "tr", "th", "td",
    // "img" intentionally excluded: prevents external image loading (tracking / IP leak)
    "span", "div",
  ],
  ALLOWED_ATTR: ["href", "title", "class", "target", "rel", "start"],
  ALLOW_DATA_ATTR: false,
};
export const renderSafeMarkdown = (md) => {
  try {
    const raw = marked.parse(md || "");
    return DOMPurify.sanitize(raw, _PURIFY_CONFIG);
  } catch {
    return "";
  }
};

export const mdToPlain = (md) => {
  try {
    const html = marked.parse(md || "");
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const text = tmp.textContent || tmp.innerText || "";
    return text.replace(/\n{3,}/g, "\n\n");
  } catch (e) {
    return md || "";
  }
};

// Build MARKDOWN content for download
export const mdForDownload = (n) => {
  const lines = [];
  if (n.title) lines.push(`# ${n.title}`, "");
  if (Array.isArray(n.tags) && n.tags.length) {
    lines.push(`**Tags:** ${n.tags.map((t) => `\`${t}\``).join(", ")}`, "");
  }
  if (n.type === "text") {
    lines.push(String(n.content || ""));
  } else {
    const items = Array.isArray(n.items) ? n.items : [];
    for (const it of items) {
      lines.push(`- [${it.done ? "x" : " "}] ${it.text || ""}`);
    }
  }
  if (n.images?.length) {
    lines.push(
      "",
      `> _${n.images.length} image(s) attached)_ ${n.images
        .map((im) => im.name || "image")
        .join(", ")}`,
    );
  }
  lines.push("");
  return lines.join("\n");
};

/** ---------- Phone number linkification (mobile only) ---------- */
const PHONE_RE =
  /(?:\+1[\s.-]?)?\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|(?:\+1[\s.-]?)?\d{3}[\s.-]\d{3}[\s.-]\d{4}|\+33[\s.-]?\d[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}|0\d[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/g;

export function linkifyPhoneNumbers(text) {
  if (!text) return text;
  PHONE_RE.lastIndex = 0;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = PHONE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const phone = match[0];
    const digits = phone.replace(/[\s.()-]/g, "");
    parts.push(
      <a
        key={match.index}
        href={`tel:${digits}`}
        className="underline text-blue-600 dark:text-blue-400"
        onClick={(e) => e.stopPropagation()}
      >
        {phone}
      </a>,
    );
    lastIndex = PHONE_RE.lastIndex;
  }
  if (parts.length === 0) return text;
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}
