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
const CodeBlock  = () => <T Icon={TI.CodeBlock} />;
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
const Paragraph  = () => <T Icon={TI.Pilcrow} />;
const More       = () => <T Icon={TI.ChevronDown} />;
// Chevron is styled smaller via the `.rt-btn--chevron svg` / `.rt-btn--has-chevron`
// CSS rules — same component, the container decides the size.
const Chevron    = () => <T Icon={TI.ChevronDown} className="tabler-icon--chevron" />;

// --- Underline (variant-aware) ----------------------------------------
// Tabler's "underline" is just an outlined U with a line below. To keep
// the live preview of style / colour variants that the split-button pops
// open, we render an SVG <text> for the "U" glyph with CSS text-decoration
// so wavy / dotted / dashed / double + custom colour still reflect on
// the button itself.
const Underline = ({ style = "simple", color }) => {
  const deco =
    {
      simple: "solid",
      double: "double",
      dotted: "dotted",
      dashed: "dashed",
      wavy: "wavy",
    }[style] || "solid";
  const textDecoration = `underline ${deco === "solid" ? "" : deco} ${color || ""}`.trim();
  return (
    <svg
      className="tabler-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="14"
        fontWeight="600"
        fill="currentColor"
        stroke="none"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        style={{ textDecoration, textUnderlineOffset: "2px" }}
      >
        U
      </text>
    </svg>
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
  Chevron, Paragraph, More,
  Bold, Italic, Underline, Strike, Code, CodeBlock, Quote, HR, Link, LinkOpen, Clear,
  Subscript, Superscript, SizeUp, SizeDown,
  BulletList, OrderedList, Indent, Outdent,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  TextColor, Highlight,
};

export default RichIcons;
