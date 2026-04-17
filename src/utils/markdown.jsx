import React from "react";
import { marked as markedParser } from "marked";
import DOMPurify from "dompurify";

// Ensure we can call marked.parse(...)
export const marked =
  typeof markedParser === "function" ? { parse: markedParser } : markedParser;

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
    let text = md || "";
    // Preserve intentional blank lines before headings: insert <br> so
    // the gap survives marked's parsing (single \n vs \n\n produce the same HTML otherwise).
    text = text.replace(/\n\n(#{1,6}\s)/g, "\n\n<br>\n\n$1");
    const raw = marked.parse(text);
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

/** ---------- Phone & email linkification ---------- */
const PHONE_RE =
  /(?:\+1[\s.-]?)?\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|(?:\+1[\s.-]?)?\d{3}[\s.-]\d{3}[\s.-]\d{4}|\+33[\s.-]?\d[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}|0\d[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/g;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const LINK_CLASS = "underline text-blue-600 dark:text-blue-400";

/**
 * JSX version — used by ChecklistRow and other plain-text renderers.
 * Detects phone numbers and email addresses, returns React elements.
 */
export function linkifyContacts(text) {
  if (!text) return text;
  // Build a combined regex so matches are found in text order
  const COMBINED = new RegExp(`(${PHONE_RE.source})|(${EMAIL_RE.source})`, "g");
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = COMBINED.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const raw = match[0];
    if (match[1]) {
      // Phone match
      const digits = raw.replace(/[\s.()-]/g, "");
      parts.push(
        <a key={match.index} href={`tel:${digits}`} className={LINK_CLASS} onClick={(e) => e.stopPropagation()}>{raw}</a>,
      );
    } else {
      // Email match
      parts.push(
        <a key={match.index} href={`mailto:${raw}`} className={LINK_CLASS} onClick={(e) => e.stopPropagation()}>{raw}</a>,
      );
    }
    lastIndex = COMBINED.lastIndex;
  }
  if (parts.length === 0) return text;
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

/**
 * HTML version — used for content rendered via dangerouslySetInnerHTML.
 * Walks DOM text nodes (skipping <a>, <code>, <pre>) and wraps phone/email
 * matches with <a> tags. Returns modified HTML string.
 */
export function linkifyContactsHTML(html) {
  if (!html) return html;
  const container = document.createElement("div");
  container.innerHTML = html;

  const COMBINED = new RegExp(`(${PHONE_RE.source})|(${EMAIL_RE.source})`, "g");

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (p && (p.closest("a") || p.closest("code") || p.closest("pre"))) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const tn of textNodes) {
    const txt = tn.textContent;
    COMBINED.lastIndex = 0;
    if (!COMBINED.test(txt)) continue;
    COMBINED.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = COMBINED.exec(txt)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
      const a = document.createElement("a");
      if (m[1]) {
        a.href = `tel:${m[0].replace(/[\s.()-]/g, "")}`;
      } else {
        a.href = `mailto:${m[0]}`;
      }
      a.className = LINK_CLASS;
      a.textContent = m[0];
      frag.appendChild(a);
      last = COMBINED.lastIndex;
    }
    if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
    tn.parentNode.replaceChild(frag, tn);
  }

  return container.innerHTML;
}
