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

    // Mirror edit-mode spacing in read mode: each blank line the user typed
    // becomes one explicit spacer div. marked collapses all block-separating
    // newlines, so without this the reader sees less vertical space than the
    // writer typed.  Fenced code blocks are protected so their inner blank
    // lines stay intact.
    const codeBlocks = [];
    text = text.replace(/```[\s\S]*?```/g, (m) => {
      codeBlocks.push(m);
      return `\x00CODE${codeBlocks.length - 1}\x00`;
    });
    text = text.replace(/\n{2,}/g, (match) => {
      const blanks = match.length - 1;
      return "\n\n" + '<div class="md-blank-line"></div>\n\n'.repeat(blanks);
    });
    text = text.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[+i]);

    const raw = marked.parse(text, { breaks: true });
    // `breaks: true` turns user soft-breaks into explicit <br> tags that
    // survive the post-processing whitespace collapse below. Without this,
    // marked emits e.g. `</strong>\n<strong>` for "**a**\n**b**" and the
    // collapse strips the \n — both bold runs end up on the same line.
    //
    // Strip the newline marked still emits right after <br> ("<br>\n"),
    // otherwise `white-space: pre-wrap` on the leaf element would render
    // it as a second line break on top of the explicit <br>.
    // Collapse whitespace between tags so that `white-space: pre-wrap` on
    // leaf elements (kept to preserve incidental whitespace) doesn't render
    // marked's formatting newlines — especially the ones inside nested-list
    // <li> wrappers — as phantom blank lines.
    // Fenced code content is protected so its inner whitespace stays intact.
    const preBlocks = [];
    let cleaned = raw.replace(/<pre[\s\S]*?<\/pre>/g, (m) => {
      preBlocks.push(m);
      return `\x00PRE${preBlocks.length - 1}\x00`;
    });
    cleaned = cleaned.replace(/<br\s*\/?>\s*\n/g, "<br>");
    cleaned = cleaned.replace(/>[ \t]*\n[ \t\n]*</g, "><");
    cleaned = cleaned.replace(/\x00PRE(\d+)\x00/g, (_, i) => preBlocks[+i]);
    return DOMPurify.sanitize(cleaned, _PURIFY_CONFIG);
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
      if (it && it.kind === "section") {
        lines.push("", `## ${it.title || ""}`, "");
      } else if (it) {
        lines.push(`- [${it.done ? "x" : " "}] ${it.text || ""}`);
      }
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
