// Rich-text storage, migration and rendering helpers.
//
// Source of truth for new text notes: ProseMirror/Tiptap JSON, wrapped with a
// versioned envelope so we can evolve the format later without guessing.
//
//     { "v": 1, "format": "tiptap", "doc": { "type": "doc", "content": [...] } }
//
// The envelope is JSON-stringified and stored in the existing `notes.content`
// column. The server, sync engine and IndexedDB layer all treat `content` as
// opaque, so no schema change is required.
//
// Legacy text notes keep working: they hold raw Markdown in `content`. We
// detect them lazily (anything that doesn't parse to our envelope is legacy)
// and convert on-the-fly for display. Persisting a legacy note through the
// rich editor upgrades it in place.

import { generateHTML, generateJSON } from "@tiptap/html";
import DOMPurify from "dompurify";
import { marked as markedParser } from "marked";
import { RENDER_EXTENSIONS } from "../components/richtext/richTextSchema.js";

const marked =
  typeof markedParser === "function" ? { parse: markedParser } : markedParser;

export const RICH_FORMAT_VERSION = 1;
export const RICH_FORMAT_NAME = "tiptap";

/** Empty Tiptap doc — used as a safe default when content is missing. */
export function emptyRichDoc() {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Wrap a ProseMirror doc in our versioned envelope. */
export function wrapRichDoc(doc) {
  return { v: RICH_FORMAT_VERSION, format: RICH_FORMAT_NAME, doc };
}

/** Serialize an envelope (or doc) for storage in `notes.content`. */
export function serializeRichContent(docOrEnvelope) {
  const envelope =
    docOrEnvelope && docOrEnvelope.format === RICH_FORMAT_NAME
      ? docOrEnvelope
      : wrapRichDoc(docOrEnvelope || emptyRichDoc());
  return JSON.stringify(envelope);
}

/**
 * True when the stored string looks like our rich envelope.
 * Legacy Markdown (plain strings, `# heading`, `- bullet`, etc.) returns
 * false — that's how we know we need to migrate on read.
 */
export function isRichContent(content) {
  if (typeof content !== "string") return false;
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(content);
    return (
      parsed &&
      typeof parsed === "object" &&
      parsed.format === RICH_FORMAT_NAME &&
      parsed.doc &&
      parsed.doc.type === "doc"
    );
  } catch {
    return false;
  }
}

/**
 * Extract the ProseMirror doc out of stored content.
 * Returns null if the content isn't a valid rich envelope.
 */
export function parseRichDoc(content) {
  if (!isRichContent(content)) return null;
  try {
    return JSON.parse(content).doc;
  } catch {
    return null;
  }
}

/** Strict allow-list for DOMPurify — matches the legacy markdown sanitizer
 *  closely but adds what Tiptap can legitimately produce (color, alignment,
 *  sub/sup, highlight, font size, font family). */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "a", "b", "strong", "i", "em", "del", "s", "u",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "ul", "ol", "li",
    "blockquote",
    "pre", "code",
    "sub", "sup",
    "mark",
    "span", "div",
  ],
  ALLOWED_ATTR: ["href", "title", "class", "target", "rel", "start", "style", "data-color", "data-text-align"],
  // `style` is allowed above so Tiptap's color/alignment/font rendering
  // survives sanitization. Keep this narrow — no tags with scripting or
  // arbitrary url attributes.
  ALLOW_DATA_ATTR: false,
};

/** Render a Tiptap doc to sanitized HTML. */
export function richDocToHTML(doc) {
  if (!doc) return "";
  try {
    const raw = generateHTML(doc, RENDER_EXTENSIONS);
    return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
  } catch {
    return "";
  }
}

/** Walk a Tiptap doc and return a plain-text version (for previews / search). */
export function richDocToPlain(doc) {
  if (!doc) return "";
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === "text" && node.text) {
      parts.push(node.text);
      return;
    }
    if (node.type === "hardBreak") {
      parts.push("\n");
      return;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
      // Block-level separators: paragraphs, headings, list items, blockquotes.
      if (
        node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "listItem" ||
        node.type === "blockquote" ||
        node.type === "codeBlock"
      ) {
        parts.push("\n");
      }
    }
  };
  walk(doc);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Convert legacy Markdown content (or anything else treated as plain text)
 * into a Tiptap doc. Pipeline: Markdown → HTML (marked) → DOMPurify → Tiptap
 * JSON (generateJSON). Empty input yields an empty doc.
 */
export function legacyMarkdownToRichDoc(markdown) {
  const src = typeof markdown === "string" ? markdown : "";
  if (!src.trim()) return emptyRichDoc();
  try {
    const rawHtml = marked.parse(src, { breaks: true });
    const cleanHtml = DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG);
    const doc = generateJSON(cleanHtml, RENDER_EXTENSIONS);
    if (doc && doc.type === "doc") return doc;
    return emptyRichDoc();
  } catch {
    return emptyRichDoc();
  }
}

/**
 * Best-effort read of a note's text body as a Tiptap doc, regardless of whether
 * it's already rich or still legacy Markdown. Never throws.
 */
export function contentToRichDoc(content) {
  if (content == null) return emptyRichDoc();
  const richDoc = parseRichDoc(content);
  if (richDoc) return richDoc;
  return legacyMarkdownToRichDoc(String(content));
}

/** Render any note content (rich or legacy) to sanitized HTML. */
export function contentToHTML(content) {
  const doc = contentToRichDoc(content);
  return richDocToHTML(doc);
}

/** Render any note content (rich or legacy) to a plain-text preview string. */
export function contentToPlain(content) {
  if (content == null) return "";
  if (isRichContent(content)) return richDocToPlain(parseRichDoc(content));
  // Legacy markdown: strip syntax cheaply — we don't want to pull marked just
  // for preview. Regex strip of the markers used by the old toolbar.
  return String(content)
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^---+$/gm, "");
}
