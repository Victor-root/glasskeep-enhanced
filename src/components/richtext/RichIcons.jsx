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

// Paragraph mark — rendered as a stylised pilcrow glyph (¶) with a
// subtle accent fill. Deliberately typographic rather than another
// "rows of lines" icon so the block-type button never blurs into the
// alignment / list family.
const Paragraph = () =>
  svg(
    <text
      x="5"
      y="19"
      fontSize="20"
      fontWeight="700"
      fill="currentColor"
      stroke="none"
      fontFamily='Georgia, "Times New Roman", serif'
    >
      ¶
    </text>,
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
      <line x1="6"  y1="7"  x2="18" y2="7"  opacity="0.35" />
      <line x1="8"  y1="9"  x2="16" y2="9"  opacity="0.35" />
      <circle cx="3"  cy="13" r="1.5" fill="currentColor" stroke="none" />
      <line x1="6"  y1="13" x2="18" y2="13" strokeWidth="2.6" />
      <circle cx="21" cy="13" r="1.5" fill="currentColor" stroke="none" />
      <line x1="6"  y1="17" x2="18" y2="17" opacity="0.35" />
      <line x1="8"  y1="19" x2="16" y2="19" opacity="0.35" />
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

// "More" overflow menu trigger — three small horizontal dots, the universal
// "additional actions" affordance.
const More = () =>
  svg(
    <>
      <circle cx="6"  cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none" />
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

// Subscript / Superscript — big clear "X" base with a prominent "2"
// offset below / above. Previous versions used an X made of thin paths
// and a 7-px glyph, which was nearly invisible at toolbar size.
const Subscript = () =>
  svg(
    <>
      <text
        x="1"
        y="15"
        fontSize="15"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >X</text>
      <text
        x="13"
        y="22"
        fontSize="10"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
      >2</text>
    </>,
  );

const Superscript = () =>
  svg(
    <>
      <text
        x="1"
        y="22"
        fontSize="15"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >X</text>
      <text
        x="13"
        y="10"
        fontSize="10"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
      >2</text>
    </>,
  );

// A+ / A- font size steppers.
const SizeUp = () =>
  svg(
    <>
      <text
        x="0"
        y="18"
        fontSize="14"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >A</text>
      <line x1="15" y1="6" x2="22" y2="6" strokeWidth="2" />
      <line x1="18.5" y1="2.5" x2="18.5" y2="9.5" strokeWidth="2" />
    </>,
  );

const SizeDown = () =>
  svg(
    <>
      <text
        x="0"
        y="18"
        fontSize="14"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >A</text>
      <line x1="15" y1="6" x2="22" y2="6" strokeWidth="2" />
    </>,
  );

// Paragraph / list accents. These four icons (bullet, ordered list,
// outdent, indent) all sit in Super-group B and get distinct colour
// accents so the list family stands out visually from the monochrome
// marks / alignment / insert families around them.
const LIST_BULLET_COLOR   = "#6366f1"; // indigo — bullet markers
const LIST_ORDERED_COLOR  = "#0ea5e9"; // sky   — numeral markers
const LIST_OUTDENT_COLOR  = "#f59e0b"; // amber — outdent chevron
const LIST_INDENT_COLOR   = "#10b981"; // emerald — indent chevron

// Lists — big, unmistakable markers so bullet vs. ordered vs. indent don't
// blur together at toolbar size.
const BulletList = () =>
  svg(
    <>
      {/* Vertical spacing widened (5 / 12 / 19 instead of 7 / 12 / 17)
          so the markers aren't packed against each other. */}
      <circle cx="5" cy="5"  r="1.8" fill={LIST_BULLET_COLOR} stroke="none" />
      <circle cx="5" cy="12" r="1.8" fill={LIST_BULLET_COLOR} stroke="none" />
      <circle cx="5" cy="19" r="1.8" fill={LIST_BULLET_COLOR} stroke="none" />
      <line x1="10" y1="5"  x2="20" y2="5" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="10" y1="19" x2="20" y2="19" />
    </>,
  );

const OrderedList = () =>
  svg(
    <>
      <text x="1.5" y="8"  fontSize="7" fontWeight="900" fill={LIST_ORDERED_COLOR} stroke="none">1</text>
      <text x="1.5" y="15" fontSize="7" fontWeight="900" fill={LIST_ORDERED_COLOR} stroke="none">2</text>
      <text x="1.5" y="22" fontSize="7" fontWeight="900" fill={LIST_ORDERED_COLOR} stroke="none">3</text>
      <line x1="9" y1="6"  x2="20" y2="6" />
      <line x1="9" y1="13" x2="20" y2="13" />
      <line x1="9" y1="20" x2="20" y2="20" />
    </>,
  );

// Indent / outdent — coloured directional chevron dominates the shape.
const Indent = () =>
  svg(
    <>
      <line x1="4"  y1="6"  x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="10" y1="18" x2="20" y2="18" />
      <polyline
        points="3 9 7 12 3 15"
        fill="none"
        stroke={LIST_INDENT_COLOR}
        strokeWidth="2.4"
      />
    </>,
  );

const Outdent = () =>
  svg(
    <>
      <line x1="4"  y1="6"  x2="20" y2="6" />
      <line x1="4"  y1="12" x2="14" y2="12" />
      <line x1="4"  y1="18" x2="14" y2="18" />
      <polyline
        points="21 9 17 12 21 15"
        fill="none"
        stroke={LIST_OUTDENT_COLOR}
        strokeWidth="2.4"
      />
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
  Chevron, Paragraph, More,
  Bold, Italic, Underline, Strike, Code, CodeBlock, Quote, HR, Link, LinkOpen, Clear,
  Subscript, Superscript, SizeUp, SizeDown,
  BulletList, OrderedList, Indent, Outdent,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  TextColor, Highlight,
};

export default RichIcons;
