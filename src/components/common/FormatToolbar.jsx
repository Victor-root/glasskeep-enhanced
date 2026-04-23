import React from "react";
import { t } from "../../i18n";

/** ---------- Formatting helpers ---------- */
export function wrapSelection(value, start, end, before, after, placeholder = "text") {
  const bLen = before.length;
  const aLen = after.length;

  // Already wrapped with same markers → unwrap (toggle off)
  if (start >= bLen && end + aLen <= value.length) {
    if (value.slice(start - bLen, start) === before && value.slice(end, end + aLen) === after) {
      const newText = value.slice(0, start - bLen) + value.slice(start, end) + value.slice(end + aLen);
      return { text: newText, range: [start - bLen, end - bLen] };
    }
  }

  const hasSel = start !== end;
  const sel = hasSel ? value.slice(start, end) : placeholder;
  const newText =
    value.slice(0, start) + before + sel + after + value.slice(end);
  const s = start + before.length;
  const e = s + sel.length;
  return { text: newText, range: [s, e] };
}
export function fencedBlock(value, start, end) {
  // Already fenced → unwrap (toggle off)
  if (start >= 4 && end + 4 <= value.length &&
      value.slice(start - 4, start) === "```\n" &&
      value.slice(end, end + 4) === "\n```") {
    const newText = value.slice(0, start - 4) + value.slice(start, end) + value.slice(end + 4);
    return { text: newText, range: [start - 4, end - 4] };
  }

  const hasSel = start !== end;
  const sel = hasSel ? value.slice(start, end) : "code";
  const block = "```\n" + sel + "\n```";
  const newText = value.slice(0, start) + block + value.slice(end);
  const s = start + 4;
  const e = s + sel.length;
  return { text: newText, range: [s, e] };
}
export function selectionBounds(value, start, end) {
  const from = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  let to = value.indexOf("\n", end);
  if (to === -1) to = value.length;
  return { from, to };
}
export function toggleList(value, start, end, kind /* 'ul' | 'ol' */) {
  const { from, to } = selectionBounds(value, start, end);
  const segment = value.slice(from, to);
  const lines = segment.split("\n");

  const isUL = (ln) => /^\s*[-*+]\s+/.test(ln);
  const isOL = (ln) => /^\s*\d+\.\s+/.test(ln);
  const nonEmpty = (ln) => ln.trim().length > 0;

  const allUL = lines.filter(nonEmpty).every(isUL);
  const allOL = lines.filter(nonEmpty).every(isOL);

  let newLines;
  if (kind === "ul") {
    if (allUL) newLines = lines.map((ln) => ln.replace(/^\s*[-*+]\s+/, ""));
    else
      newLines = lines.map((ln) =>
        nonEmpty(ln)
          ? `- ${ln.replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+\.\s+/, "")}`
          : ln,
      );
  } else {
    if (allOL) {
      newLines = lines.map((ln) => ln.replace(/^\s*\d+\.\s+/, ""));
    } else {
      let i = 1;
      newLines = lines.map((ln) =>
        nonEmpty(ln)
          ? `${i++}. ${ln.replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+\.\s+/, "")}`
          : ln,
      );
    }
  }

  const replaced = newLines.join("\n");
  const newText = value.slice(0, from) + replaced + value.slice(to);
  const delta = replaced.length - segment.length;
  const newStart =
    start + (kind === "ol" && !allOL ? 3 : kind === "ul" && !allUL ? 2 : 0);
  const newEnd = end + delta;
  return { text: newText, range: [newStart, newEnd] };
}
/** Insert a standalone markdown horizontal rule ("---") at the caret.
 *  The rule needs a blank line above it (otherwise `-` is parsed as a
 *  Setext H2 underline and the separator disappears). Below, a single
 *  newline is enough — we don't add a blank line there so the next
 *  paragraph stays visually adjacent to the rule, matching what the
 *  user would write by hand. Any current selection is preserved;
 *  the rule is inserted after it. */
export function insertHr(value, start, end) {
  const insertAt = end;
  const before = value.slice(0, insertAt);
  const after = value.slice(insertAt);

  let lead;
  if (before.length === 0 || before.endsWith("\n\n")) lead = "";
  else if (before.endsWith("\n")) lead = "\n";
  else lead = "\n\n";

  let trail;
  if (after.length === 0) trail = "\n";
  else if (after.startsWith("\n")) trail = "";
  else trail = "\n";

  const insert = `${lead}---${trail}`;
  const newText = before + insert + after;
  const caret = before.length + insert.length;
  return { text: newText, range: [caret, caret] };
}

export function prefixLines(value, start, end, prefix) {
  const { from, to } = selectionBounds(value, start, end);
  const segment = value.slice(from, to);
  const lines = segment.split("\n");
  const nonEmpty = (ln) => ln.trim().length > 0;
  const nonEmptyLines = lines.filter(nonEmpty);

  // All non-empty lines already have this exact prefix → remove (toggle off)
  if (nonEmptyLines.length > 0 && nonEmptyLines.every((ln) => ln.startsWith(prefix))) {
    const newLines = lines.map((ln) => ln.startsWith(prefix) ? ln.slice(prefix.length) : ln);
    const replaced = newLines.join("\n");
    const newText = value.slice(0, from) + replaced + value.slice(to);
    return { text: newText, range: [from, from + replaced.length] };
  }

  // For headings: strip any existing heading level before adding the new one
  const HEADING_RE = /^#{1,6} /;
  const isHeading = /^#{1,6} $/.test(prefix);

  const newLines = lines.map((ln) => {
    if (!nonEmpty(ln)) return ln;
    const stripped = isHeading ? ln.replace(HEADING_RE, "") : ln;
    return prefix + stripped;
  });

  const replaced = newLines.join("\n");
  const newText = value.slice(0, from) + replaced + value.slice(to);
  return { text: newText, range: [from + prefix.length, from + replaced.length] };
}

/** Smart Enter: continue lists/quotes, or exit on empty */
export function handleSmartEnter(value, start, end) {
  if (start !== end) return null; // only handle caret
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const line = value.slice(lineStart, start);
  const before = value.slice(0, start);
  const after = value.slice(end);

  // Ordered list?
  let m = /^(\s*)(\d+)\.\s(.*)$/.exec(line);
  if (m) {
    const indent = m[1] || "";
    const num = parseInt(m[2], 10) || 1;
    const text = m[3] || "";
    if (text.trim() === "") {
      // exit list
      const newBefore = value.slice(0, lineStart);
      const newText = newBefore + "\n" + after;
      const caret = newBefore.length + 1;
      return { text: newText, range: [caret, caret] };
    } else {
      const prefix = `${indent}${num + 1}. `;
      const newText = before + "\n" + prefix + after;
      const caret = start + 1 + prefix.length;
      return { text: newText, range: [caret, caret] };
    }
  }

  // Unordered list?
  m = /^(\s*)([-*+])\s(.*)$/.exec(line);
  if (m) {
    const indent = m[1] || "";
    const text = m[3] || "";
    if (text.trim() === "") {
      const newBefore = value.slice(0, lineStart);
      const newText = newBefore + "\n" + after;
      const caret = newBefore.length + 1;
      return { text: newText, range: [caret, caret] };
    } else {
      const prefix = `${indent}- `;
      const newText = before + "\n" + prefix + after;
      const caret = start + 1 + prefix.length;
      return { text: newText, range: [caret, caret] };
    }
  }

  // Blockquote?
  m = /^(\s*)>\s?(.*)$/.exec(line);
  if (m) {
    const indent = m[1] || "";
    const text = m[2] || "";
    if (text.trim() === "") {
      const newBefore = value.slice(0, lineStart);
      const newText = newBefore + "\n" + after;
      const caret = newBefore.length + 1;
      return { text: newText, range: [caret, caret] };
    } else {
      const prefix = `${indent}> `;
      const newText = before + "\n" + prefix + after;
      const caret = start + 1 + prefix.length;
      return { text: newText, range: [caret, caret] };
    }
  }

  return null;
}

/** Small toolbar UI */
export default function FormatToolbar({ dark, onAction, anchorRef }) {
  const popRef = React.useRef(null);
  const [arrowLeft, setArrowLeft] = React.useState(null);

  React.useLayoutEffect(() => {
    const btn = anchorRef?.current;
    if (!btn) return;
    const update = () => {
      const r = btn.getBoundingClientRect();
      const popLeft = 8; // 0.5rem left margin of .fmt-pop
      setArrowLeft(r.left + r.width / 2 - popLeft - 6); // 6 = half arrow width
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [anchorRef]);

  const base = `fmt-btn ${dark ? "hover:bg-white/10" : "hover:bg-black/5"}`;
  const mod = (typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)) ? "⌘" : "Ctrl";
  const tip = (labelKey, shortcut) => `${t(labelKey)} (${shortcut})`;
  return (
    <div
      ref={popRef}
      className={`fmt-pop ${dark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-800"}`}
      style={arrowLeft != null ? { "--fmt-arrow-left": `${arrowLeft}px` } : undefined}
    >
      <div className="fmt-pop-grid flex flex-wrap gap-1">
        <button className={base} onClick={() => onAction("h1")} data-tooltip={tip("fmtHeading1", `${mod}+Alt+1`)}>H1</button>
        <button className={base} onClick={() => onAction("h2")} data-tooltip={tip("fmtHeading2", `${mod}+Alt+2`)}>H2</button>
        <button className={base} onClick={() => onAction("h3")} data-tooltip={tip("fmtHeading3", `${mod}+Alt+3`)}>H3</button>
        <span className="fmt-sep mx-1 opacity-40">|</span>
        <button className={base} onClick={() => onAction("bold")} data-tooltip={tip("fmtBold", `${mod}+B`)}><strong>B</strong></button>
        <button className={base} onClick={() => onAction("italic")} data-tooltip={tip("fmtItalic", `${mod}+I`)}><em>I</em></button>
        <button className={base} onClick={() => onAction("strike")} data-tooltip={tip("fmtStrike", `${mod}+Shift+X`)}><span className="line-through">S</span></button>
        <button className={base} onClick={() => onAction("code")} data-tooltip={tip("fmtInlineCode", `${mod}+E`)}>`code`</button>
        <button className={base} onClick={() => onAction("codeblock")} data-tooltip={tip("fmtCodeBlock", `${mod}+Shift+E`)}>&lt;/&gt;</button>
        <span className="fmt-sep mx-1 opacity-40">|</span>
        <button className={base} onClick={() => onAction("quote")} data-tooltip={tip("fmtQuote", `${mod}+Shift+.`)}>&gt;</button>
        <button className={base} onClick={() => onAction("ul")} data-tooltip={tip("fmtBulletList", `${mod}+Shift+8`)}>{t("bulletListLabel")}</button>
        <button className={base} onClick={() => onAction("ol")} data-tooltip={tip("fmtOrderedList", `${mod}+Shift+7`)}>{t("orderedListLabel")}</button>
        <button className={base} onClick={() => onAction("link")} data-tooltip={tip("fmtLink", `${mod}+K`)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </button>
        <button className={base} onClick={() => onAction("hr")} data-tooltip={t("fmtSeparator")}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="12" x2="20" y2="12" /></svg>
        </button>
      </div>
    </div>
  );
}
