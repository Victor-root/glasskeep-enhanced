// Dedicated icon set for the rich-text toolbar.
// Using real SVGs instead of ambiguous glyphs (↹ ⇔ ≡ …) gives a much
// crisper visual hierarchy and a toolbar that actually looks like
// GlassKeep instead of a debug palette.

import React from "react";

const BASE = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function svg(children, extra) {
  return <svg {...BASE} {...(extra || {})}>{children}</svg>;
}

const Chevron = () =>
  svg(<path d="M6 9l6 6 6-6" />, { width: 10, height: 10 });

// Modern "body text" glyph — four horizontal text lines, the last one
// shorter, as used by Notion / Google Docs to mean "paragraph / normal".
const Paragraph = () =>
  svg(
    <>
      <line x1="4"  y1="6"  x2="20" y2="6" />
      <line x1="4"  y1="10" x2="20" y2="10" />
      <line x1="4"  y1="14" x2="20" y2="14" />
      <line x1="4"  y1="18" x2="13" y2="18" />
    </>,
  );

const Bold = () =>
  svg(
    <>
      <path d="M7 5h6a3.5 3.5 0 010 7H7z" />
      <path d="M7 12h7a3.5 3.5 0 010 7H7z" />
    </>,
  );

const Italic = () =>
  svg(
    <>
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </>,
  );

const Underline = ({ style = "simple", color }) => {
  const deco = {
    simple: "solid",
    double: "double",
    dotted: "dotted",
    dashed: "dashed",
    wavy: "wavy",
  }[style] || "solid";
  return (
    <span
      style={{
        fontFamily: "inherit",
        fontWeight: 600,
        fontSize: "13px",
        textDecoration: `underline ${deco === "solid" ? "" : deco} ${color || ""}`.trim(),
        textUnderlineOffset: "3px",
      }}
    >
      U
    </span>
  );
};

const Strike = () =>
  svg(
    <>
      <line x1="4" y1="12" x2="20" y2="12" />
      <path d="M16 6a4 4 0 00-4-2c-2.5 0-4 1.5-4 3.5 0 1.5 1 2.5 3 3" />
      <path d="M8 18a4 4 0 004 2c2.5 0 4-1.5 4-3.5 0-1.5-1-2.5-3-3" />
    </>,
  );

const Code = () =>
  svg(
    <>
      <polyline points="8 6 3 12 8 18" />
      <polyline points="16 6 21 12 16 18" />
    </>,
  );

const CodeBlock = () =>
  svg(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="9 10 7 12 9 14" />
      <polyline points="15 10 17 12 15 14" />
    </>,
  );

const Quote = () =>
  svg(
    <>
      <path d="M7 15a4 4 0 01-4-4V7h6v6a4 4 0 01-4 4z" transform="rotate(180 5 11)" />
      <path d="M17 15a4 4 0 01-4-4V7h6v6a4 4 0 01-4 4z" transform="rotate(180 15 11)" />
    </>,
  );

const HR = () =>
  svg(
    <>
      <line x1="4" y1="6" x2="20" y2="6" opacity="0.35" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" opacity="0.35" />
    </>,
  );

const Link = () =>
  svg(
    <>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </>,
  );

// "Clear formatting" — an eraser glyph over a baseline. Reads as
// "remove formatting / wipe styles", clearly different from the global
// delete / trash can that already lives elsewhere in the UI.
const Clear = () =>
  svg(
    <>
      <path d="M16.5 3.5l4 4-9 9H7l-2-2z" />
      <line x1="9.5" y1="10.5" x2="13.5" y2="14.5" />
      <line x1="11" y1="20" x2="21" y2="20" />
    </>,
  );

// External-link arrow — box with an arrow breaking out to the top right.
// Replaces the ambiguous ↗ glyph on the link popover's "open" button.
const LinkOpen = () =>
  svg(
    <>
      <path d="M14 4h6v6" />
      <line x1="20" y1="4" x2="11" y2="13" />
      <path d="M18 13v5a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h5" />
    </>,
  );

const Subscript = () =>
  svg(
    <>
      <path d="M5 6l6 8" />
      <path d="M11 6l-6 8" />
      <text x="15" y="19" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">2</text>
    </>,
  );

const Superscript = () =>
  svg(
    <>
      <path d="M5 10l6 8" />
      <path d="M11 10l-6 8" />
      <text x="15" y="10" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">2</text>
    </>,
  );

const BulletList = () =>
  svg(
    <>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="5" cy="6" r="1.5" fill="currentColor" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="5" cy="18" r="1.5" fill="currentColor" />
    </>,
  );

const OrderedList = () =>
  svg(
    <>
      <line x1="10" y1="6" x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="10" y1="18" x2="20" y2="18" />
      <text x="3" y="8" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">1.</text>
      <text x="3" y="14" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">2.</text>
      <text x="3" y="20" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">3.</text>
    </>,
  );

const Indent = () =>
  svg(
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="10" y1="18" x2="20" y2="18" />
      <polyline points="4 10 7 13 4 16" />
    </>,
  );

const Outdent = () =>
  svg(
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
      <polyline points="20 10 17 13 20 16" />
    </>,
  );

const AlignLeft = () =>
  svg(
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="18" y2="18" />
    </>,
  );
const AlignCenter = () =>
  svg(
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="5" y1="18" x2="19" y2="18" />
    </>,
  );
const AlignRight = () =>
  svg(
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="6" y1="18" x2="20" y2="18" />
    </>,
  );
const AlignJustify = () =>
  svg(
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </>,
  );

const TextColor = ({ swatch = "#111827" }) => (
  <span className="rt-icon-swatch">
    <svg {...BASE}>
      <path d="M6 20L12 4l6 16" />
      <line x1="8.5" y1="14" x2="15.5" y2="14" />
    </svg>
    <span className="rt-icon-swatch-bar" style={{ background: swatch }} />
  </span>
);

const Highlight = ({ swatch = "#fef3c7" }) => (
  <span className="rt-icon-swatch">
    <svg {...BASE}>
      <path d="M9 14l-3 7 7-3 7-7-4-4z" />
      <path d="M13 6l5 5" />
    </svg>
    <span className="rt-icon-swatch-bar" style={{ background: swatch }} />
  </span>
);

const RichIcons = {
  Chevron, Paragraph,
  Bold, Italic, Underline, Strike, Code, CodeBlock, Quote, HR, Link, LinkOpen, Clear,
  Subscript, Superscript,
  BulletList, OrderedList, Indent, Outdent,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  TextColor, Highlight,
};

export default RichIcons;
