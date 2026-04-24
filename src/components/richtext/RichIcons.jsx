// Rich-text toolbar icon set.
//
// Every glyph is sourced from Tabler Icons (MIT), vendored locally under
// src/icons/editor/tabler/ and imported via Vite's `?raw` asset suffix, so
// the app has zero runtime dependency on any external icon delivery — no
// CDN, no npm icon package. See src/icons/editor/index.jsx for the loader
// and src/icons/editor/tabler/LICENSE for upstream attribution.
//
// This module keeps the old `RichIcons.{Name}` export surface so the
// toolbar JSX didn't have to change. A handful of composite icons that
// aren't 1:1 with a Tabler glyph (the colour/highlight swatches, the
// A+/A- steppers, the small chevron) are still composed inline here.

import React from "react";
import TI from "../../icons/editor/index.jsx";

// Shared wrapper for a plain Tabler icon.
function T({ Icon, className }) {
  return <Icon className={`tabler-icon${className ? " " + className : ""}`} />;
}

// --- Base marks --------------------------------------------------------
const Bold       = () => <T Icon={TI.Bold} />;
const Italic     = () => <T Icon={TI.Italic} />;
const Strike     = () => <T Icon={TI.Strike} />;
const Code       = () => <T Icon={TI.Code} />;
// Code block uses the Tabler terminal-2 glyph (matches the user's request
// better than the curly-braces one we had before).
const CodeBlock  = () => <T Icon={TI.Terminal2} />;
const Quote      = () => <T Icon={TI.Quote} />;
const HR         = () => <T Icon={TI.Separator} />;
const Link       = () => <T Icon={TI.Link} />;
const LinkOpen   = () => <T Icon={TI.ExternalLink} />;
const Clear      = () => <T Icon={TI.ClearFormatting} />;
const Subscript  = () => <T Icon={TI.Subscript} />;
const Superscript= () => <T Icon={TI.Superscript} />;
const SizeUp     = () => <T Icon={TI.TextIncrease} />;
const SizeDown   = () => <T Icon={TI.TextDecrease} />;
const AlignLeft    = () => <T Icon={TI.AlignLeft} />;
const AlignCenter  = () => <T Icon={TI.AlignCenter} />;
const AlignRight   = () => <T Icon={TI.AlignRight} />;
const AlignJustify = () => <T Icon={TI.AlignJustified} />;
// Block-type button uses the Tabler "heading" glyph (looks like a capital
// H). This is only rendered when the block IS a paragraph — when a
// heading level is active, the toolbar swaps in the H1/H2/H3 badge.
const Paragraph  = () => <T Icon={TI.Heading} />;
// Heading levels — Tabler ships dedicated glyphs per level (h-1 .. h-5).
const H1 = () => <T Icon={TI.H1} />;
const H2 = () => <T Icon={TI.H2} />;
const H3 = () => <T Icon={TI.H3} />;
const H4 = () => <T Icon={TI.H4} />;
const H5 = () => <T Icon={TI.H5} />;
const More       = () => <T Icon={TI.ChevronDown} />;
// Chevron is styled smaller via the `.rt-btn--chevron svg` / `.rt-btn--has-chevron`
// CSS rules — same component, the container decides the size.
const Chevron    = () => <T Icon={TI.ChevronDown} className="tabler-icon--chevron" />;

// --- Underline (variant-aware) ----------------------------------------
// Starts from Tabler's own underline geometry: U-curve on top + base line.
// We re-render it as an inline SVG so the base line can change to reflect
// the selected variant (simple / double / dotted / dashed / wavy) and
// carry an optional user colour, while the U-curve stays on the same
// visual grid as every other Tabler icon in the toolbar.
const UNDERLINE_U_CURVE = "M7 5v5a5 5 0 0 0 10 0v-5";
const Underline = ({ style = "simple", color }) => {
  const lineColor = color || "currentColor";
  let baseLine;
  if (style === "wavy") {
    // 3 full sine-like bumps from x=5 to x=19, amplitude ±1.5 around y=19.
    baseLine = (
      <path
        d="M5 19 q2.33 -2 4.66 0 t4.66 0 t4.66 0"
        stroke={lineColor}
        fill="none"
      />
    );
  } else if (style === "double") {
    baseLine = (
      <>
        <path d="M5 18h14" stroke={lineColor} />
        <path d="M5 21h14" stroke={lineColor} />
      </>
    );
  } else {
    const dash =
      style === "dotted" ? "0.01 3"
        : style === "dashed" ? "3 2"
          : undefined;
    baseLine = (
      <path
        d="M5 19h14"
        stroke={lineColor}
        strokeDasharray={dash}
      />
    );
  }
  return (
    <span className="tabler-icon" aria-hidden="true">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={UNDERLINE_U_CURVE} />
        {baseLine}
      </svg>
    </span>
  );
};

// --- List family (kept colour-accented per earlier design decision) ---
const LIST_BULLET_COLOR  = "#6366f1";
const LIST_ORDERED_COLOR = "#0ea5e9";
const LIST_OUTDENT_COLOR = "#f59e0b";
const LIST_INDENT_COLOR  = "#10b981";

function colouredList(Icon, color) {
  return () => (
    <span
      className="tabler-icon tabler-icon--accent"
      style={{ color }}
      aria-hidden="true"
    >
      <Icon className="tabler-icon" />
    </span>
  );
}

const BulletList  = colouredList(TI.List,           LIST_BULLET_COLOR);
const OrderedList = colouredList(TI.ListNumbers,    LIST_ORDERED_COLOR);
const Outdent     = colouredList(TI.IndentDecrease, LIST_OUTDENT_COLOR);
const Indent      = colouredList(TI.IndentIncrease, LIST_INDENT_COLOR);

// --- Composite icons: colour + highlight swatches ---------------------
// Tabler's `typography` (the underlined A) is the base glyph; we stack a
// coloured bar underneath it so the button shows the current pick, just
// like Word's colour buttons.
const TextColor = ({ swatch = "#111827" }) => (
  <span className="rt-icon-swatch" aria-hidden="true">
    <TI.Typography className="tabler-icon" />
    <span className="rt-icon-swatch-bar" style={{ background: swatch }} />
  </span>
);

const Highlight = ({ swatch = "#fef3c7" }) => (
  <span className="rt-icon-swatch" aria-hidden="true">
    <TI.Highlight className="tabler-icon" />
    <span className="rt-icon-swatch-bar" style={{ background: swatch }} />
  </span>
);

const RichIcons = {
  Chevron, Paragraph, H1, H2, H3, H4, H5, More,
  Bold, Italic, Underline, Strike, Code, CodeBlock, Quote, HR, Link, LinkOpen, Clear,
  Subscript, Superscript, SizeUp, SizeDown,
  BulletList, OrderedList, Indent, Outdent,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  TextColor, Highlight,
};

export default RichIcons;
