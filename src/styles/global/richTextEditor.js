// Rich-text editor (Tiptap): tokens, editor surface, block typography and
// the toolbar.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const richTextEditorCSS = `
/* ================================================================
   Rich-text editor (Tiptap) — refined GlassKeep look
   ================================================================ */
:root {
  --gk-type-p-size: 1rem;
  --gk-type-p-weight: 400;
  --gk-type-h1-size: 1.5rem;
  --gk-type-h1-weight: 600;
  --gk-type-h2-size: 1.25rem;
  --gk-type-h2-weight: 600;
  --gk-type-h3-size: 1.125rem;
  --gk-type-h3-weight: 600;
  --gk-type-h4-size: 1rem;
  --gk-type-h4-weight: 600;
  --gk-type-h5-size: 0.9rem;
  --gk-type-h5-weight: 600;

  --rt-accent: 99, 102, 241;  /* indigo-500 */
  --rt-divider: rgba(0, 0, 0, 0.08);
  --rt-divider-strong: rgba(0, 0, 0, 0.14);
  --rt-btn-hover: rgba(0, 0, 0, 0.055);
  --rt-btn-active-bg: rgba(var(--rt-accent), 0.14);
  --rt-btn-active-text: rgb(var(--rt-accent));
  /* Checklist toolbar icon — dark gray, clearly not black at icon size. */
  --rt-task-icon: #4b5563;
  --rt-pop-bg: #ffffff;
  --rt-pop-border: rgba(0, 0, 0, 0.1);
  --rt-pop-shadow: 0 12px 32px -6px rgba(17, 24, 39, 0.28), 0 2px 8px rgba(17, 24, 39, 0.1);

  /* Highlight palette — 8 THEMED slots. The editor stores the variable
     REFERENCE in the mark's style (background-color: var(--rt-hl-N))
     instead of a concrete hex, so switching theme re-resolves the
     variable and the highlight automatically swaps to the light /
     dark variant that stays readable. */
  --rt-hl-1: #fde047; /* yellow */
  --rt-hl-2: #fdba74; /* orange */
  --rt-hl-3: #fca5a5; /* red */
  --rt-hl-4: #f9a8d4; /* pink */
  --rt-hl-5: #c4b5fd; /* violet */
  --rt-hl-6: #93c5fd; /* blue */
  --rt-hl-7: #86efac; /* green */
  --rt-hl-8: #d1d5db; /* gray */
}
html.dark {
  --rt-divider: rgba(255, 255, 255, 0.1);
  --rt-divider-strong: rgba(255, 255, 255, 0.18);
  --rt-btn-hover: rgba(255, 255, 255, 0.08);
  --rt-btn-active-bg: rgba(var(--rt-accent), 0.26);
  /* Lightened theme accent so the active label stays legible on the dark
     toolbar; follows --rt-accent for every theme (GlassKeep ~= indigo-300). */
  --rt-btn-active-text: color-mix(in srgb, rgb(var(--rt-accent)) 60%, #fff);
  /* Light gray on the dark toolbar — the dark-gray light-mode value would
     be invisible here; keeps the checklist icon neutral but legible. */
  --rt-task-icon: #cbd5e1;
  --rt-hl-1: #b45309;
  --rt-hl-2: #c2410c;
  --rt-hl-3: #b91c1c;
  --rt-hl-4: #be185d;
  --rt-hl-5: #6d28d9;
  --rt-hl-6: #1d4ed8;
  --rt-hl-7: #047857;
  --rt-hl-8: #4b5563;
}

/* Defensive fallback: Tiptap's Highlight mark stores the variable
   string both as inline style AND as data-color. If the sanitizer
   strips var() from the inline style during view-mode rendering, these
   rules rescue the highlight via the data-color attribute — which is
   always kept. Comparison is a literal string match, so the stored
   data-color must be EXACTLY "var(--rt-hl-N)" (which is what the
   highlight popover writes). */
mark[data-color="var(--rt-hl-1)"] { background-color: var(--rt-hl-1); color: inherit; }
mark[data-color="var(--rt-hl-2)"] { background-color: var(--rt-hl-2); color: inherit; }
mark[data-color="var(--rt-hl-3)"] { background-color: var(--rt-hl-3); color: inherit; }
mark[data-color="var(--rt-hl-4)"] { background-color: var(--rt-hl-4); color: inherit; }
mark[data-color="var(--rt-hl-5)"] { background-color: var(--rt-hl-5); color: inherit; }
mark[data-color="var(--rt-hl-6)"] { background-color: var(--rt-hl-6); color: inherit; }
mark[data-color="var(--rt-hl-7)"] { background-color: var(--rt-hl-7); color: inherit; }
mark[data-color="var(--rt-hl-8)"] { background-color: var(--rt-hl-8); color: inherit; }
html.dark {
  --rt-pop-bg: #1f2937;
  --rt-pop-border: rgba(255, 255, 255, 0.12);
  --rt-pop-shadow: 0 12px 32px -6px rgba(0, 0, 0, 0.7), 0 2px 8px rgba(0, 0, 0, 0.5);
}

/* ---------- Editor surface ---------- */
/* Block layout (not flex) so the sticky toolbar has a clean containing
   block. In a flex column the sticky element's "stick area" depends on the
   flex sizing pass, which led to the toolbar occasionally ignoring scroll. */
.rt-editor { display: block; }
.rt-toolbar + .rt-editor-content,
.rt-toolbar + .ProseMirror {
  margin-top: 0.4rem;
}
.rt-editor-content {
  outline: none;
  cursor: text;
  padding: 0.15rem 0.1rem;
  line-height: 1.55;
}
.rt-editor-content p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: #9ca3af;
  pointer-events: none;
  height: 0;
}
html.dark .rt-editor-content p.is-editor-empty:first-child::before { color: #6b7280; }

/* Typography driven by user presets (applied on :root). Covers BOTH the
   rich editor and the read-only view mode, so the preferred rendering is
   consistent between edit and display. */
.rt-editor-content p,
.note-content--dense p {
  font-size: var(--gk-type-p-size);
  font-weight: var(--gk-type-p-weight);
}
/* Every block style reads from the --gk-type-{key}-* family of CSS
   variables so edit-mode, rich view-mode and legacy markdown view-mode
   all share exactly the same rendering rules. An inline text-colour
   mark (textStyle.color) keeps priority over this baseline because the
   inline span wins specificity-wise. */
.rt-editor-content h1,
.note-content--dense h1,
.note-content h1 {
  font-size: var(--gk-type-h1-size);
  font-weight: var(--gk-type-h1-weight);
  color: var(--gk-type-h1-color, inherit);
  font-style: var(--gk-type-h1-italic, normal);
  text-decoration: var(--gk-type-h1-underline, none);
}
.rt-editor-content h2,
.note-content--dense h2,
.note-content h2 {
  font-size: var(--gk-type-h2-size);
  font-weight: var(--gk-type-h2-weight);
  color: var(--gk-type-h2-color, inherit);
  font-style: var(--gk-type-h2-italic, normal);
  text-decoration: var(--gk-type-h2-underline, none);
}
.rt-editor-content h3,
.note-content--dense h3,
.note-content h3 {
  font-size: var(--gk-type-h3-size);
  font-weight: var(--gk-type-h3-weight);
  color: var(--gk-type-h3-color, inherit);
  font-style: var(--gk-type-h3-italic, normal);
  text-decoration: var(--gk-type-h3-underline, none);
}
.rt-editor-content h4,
.note-content--dense h4,
.note-content h4 {
  font-size: var(--gk-type-h4-size);
  font-weight: var(--gk-type-h4-weight);
  color: var(--gk-type-h4-color, inherit);
  font-style: var(--gk-type-h4-italic, normal);
  text-decoration: var(--gk-type-h4-underline, none);
}
.rt-editor-content h5,
.note-content--dense h5,
.note-content h5 {
  font-size: var(--gk-type-h5-size);
  font-weight: var(--gk-type-h5-weight);
  color: var(--gk-type-h5-color, inherit);
  font-style: var(--gk-type-h5-italic, normal);
  text-decoration: var(--gk-type-h5-underline, none);
}

.rt-editor-content blockquote,
.note-content--dense blockquote,
.note-content blockquote {
  /* "Otro-blockquote" inspired layout — chunky coloured bar on the
     left, italic body, and a big curly opening quote glyph rendered
     via ::before sitting inside the padded gutter. Themed with the
     indigo accent so it stays consistent with the rest of GlassKeep
     instead of the upstream teal. */
  position: relative;
  font-style: italic;
  border-left: 8px solid rgba(var(--rt-accent), 0.85);
  background: rgba(var(--rt-accent), 0.07);
  padding: 0.9rem 1.1rem 0.9rem 2.6rem;
  margin: 0.6rem 0;
  line-height: 1.6;
  color: inherit;
  border-radius: 0 8px 8px 0;
  /* Hug the content: a 1-word quote stays narrow, a multi-line one
     wraps inside the modal width. Only the highlighted "card" shrinks
     — vertical stacking with siblings is preserved. */
  width: fit-content;
  max-width: 100%;
}
.rt-editor-content blockquote::before,
.note-content--dense blockquote::before,
.note-content blockquote::before {
  content: "“";
  position: absolute;
  left: 0.45rem;
  top: -0.25rem;
  font-family: Georgia, "Times New Roman", serif;
  font-style: normal;
  font-size: 3.4rem;
  line-height: 1;
  color: rgba(var(--rt-accent), 0.55);
  pointer-events: none;
  user-select: none;
}
/* Author/citation line — Tiptap doesn't auto-generate this, but if a
   user manually adds <span>…</span> at the end of their quote (paste,
   raw HTML) we render it as a small bold attribution under the body. */
.rt-editor-content blockquote span,
.note-content--dense blockquote span,
.note-content blockquote span {
  display: block;
  font-style: normal;
  font-weight: 600;
  margin-top: 0.6rem;
  opacity: 0.85;
}
html.dark .rt-editor-content blockquote,
html.dark .note-content--dense blockquote,
html.dark .note-content blockquote {
  /* Dark mode: the indigo-500 accent bar drowns against the dark
     surface, so we swap to the brighter indigo-300 (165 180 252)
     and crank the background tint up so the card is clearly
     readable as a quote. */
  border-left-color: rgb(165, 180, 252);
  background: rgba(165, 180, 252, 0.13);
}
html.dark .rt-editor-content blockquote::before,
html.dark .note-content--dense blockquote::before,
html.dark .note-content blockquote::before {
  color: rgba(165, 180, 252, 0.6);
}
.rt-editor-content pre {
  background: rgba(0, 0, 0, 0.06);
  border-radius: 0.5rem;
  padding: 0.6rem 0.85rem;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  border: 1px solid var(--rt-divider);
  /* Explicit 1 rem (the browser default for <pre>) so the dense read
     view can mirror the same value and the gap between, e.g., a
     separator and the code block reads identically in edit and
     lecture mode. */
  margin: 1rem 0;
}
html.dark .rt-editor-content pre {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--rt-divider);
}
.rt-editor-content code {
  background: rgba(0, 0, 0, 0.06);
  padding: 0.08em 0.32em;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}
html.dark .rt-editor-content code { background: rgba(255, 255, 255, 0.08); }
.rt-editor-content pre code { background: transparent; padding: 0; border: 0; }
.rt-editor-content hr {
  border: none;
  border-top: 1px solid rgba(0, 0, 0, 0.2);
  margin: 0.85rem 0;
}
html.dark .rt-editor-content hr { border-top-color: rgba(255, 255, 255, 0.2); }
.rt-editor-content a { color: #2563eb; text-decoration: underline; }
html.dark .rt-editor-content a { color: #93c5fd; }
.rt-editor-content mark { border-radius: 2px; padding: 0 2px; }
.rt-editor-content ul[data-type="taskList"] { list-style: none; padding-left: 0; }

/* ---------- Toolbar ---------- */
.rt-toolbar-slot {
  /* Slot inside the ModalHeader sticky container that receives the rich
     text toolbar via a React portal. Empty when no text note is being
     edited — collapses to no height. */
  display: contents;
}
.rt-toolbar {
  /* Word-style ribbon. Each "super-group" (.rt-sg) is a 2-row internal
     column; super-groups sit side by side, separated by a full-height
     vertical divider. When the viewport is too narrow for all
     super-groups on one ribbon row, a super-group wraps as a whole
     block — it never spills its own items across different rows of
     the toolbar, matching the reference screenshot.

     container-type lets the @container rules further down query the
     toolbar's own inline-size so we can switch to a tighter layout
     when the modal is at its max-w-4xl floor (~880 px usable). This
     is independent of viewport width — the same toolbar can appear
     in different container widths if the modal layout ever changes. */
  container-type: inline-size;
  container-name: rt-toolbar;
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  column-gap: 0;
  row-gap: 6px;
  /* Horizontal padding stays on the toolbar so buttons breathe, but we
     deliberately drop horizontal MARGIN + border-radius: the top border
     below is now a flat line spanning the full sticky-header width
     (no rounded corners clipping its ends). The negative top margin
     pulls the toolbar up toward the close/pin/save row, giving more
     vertical room to the note body in edit mode. */
  padding: 4px 8px 6px;
  margin: -6px 0 0;
  border-radius: 0;
  background: transparent;
  /* Two flush dividers framing the toolbar: one above (between the
     close/pin/save row and the toolbar) and one below (between the
     toolbar and the note body). Same hairline as the existing top
     separator so the two read as a matched pair. */
  border-top: 1px solid var(--rt-divider);
  border-bottom: 1px solid var(--rt-divider);
}
html.dark .rt-toolbar {
  border-top-color: rgba(255, 255, 255, 0.1);
  border-bottom-color: rgba(255, 255, 255, 0.1);
}
.rt-toolbar--compact { padding: 2px 8px 4px; }

/* Super-group — two vertically stacked rows of flush buttons. */
.rt-sg {
  display: inline-flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 2px;
}

/* Sub-row inside a super-group — buttons flush, no gap between them. */
.rt-sg-row {
  display: inline-flex;
  align-items: center;
  gap: 0;
  flex-wrap: nowrap;
}

/* Advanced toolbar — Paragraph / list super-group. Both rows push their
   last button to the right with margin-left: auto. The top row's last
   button (Increase indent) is then shifted back inward by exactly half a
   button width, so it sits centred horizontally above the gap between
   the bottom row's last two buttons (Justify and Decrease indent),
   echoing how the font group's Tx button reads as "between" the bottom
   row's X₂ / X². Scoped to this group only — the simple toolbar has
   no indent buttons and is untouched. */
.rt-sg[data-sg="paragraph"] .rt-sg-row > .rt-btn:last-child {
  margin-left: auto;
}
.rt-sg[data-sg="paragraph"] > .rt-sg-row:first-child > .rt-btn:last-child {
  /* 17px ≈ .rt-btn's 34px min-width / 2 — one half-button slot back from
     the right edge, which centres Increase indent on the Justify/
     Decrease-indent join below it. */
  margin-right: 17px;
}
.rt-sg[data-sg="paragraph"] > .rt-sg-row:last-child > .rt-btn:last-child {
  /* Nudge Decrease indent very slightly left of the group's right edge. */
  margin-right: 6px;
}

.rt-btn {
  position: relative;
  min-width: 34px;
  height: 34px;
  padding: 0 7px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font-size: 0.92rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.1s ease;
  user-select: none;
}
.rt-btn:hover:not(:disabled) { background: var(--rt-btn-hover); }
.rt-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--rt-accent), 0.55);
}
.rt-btn.is-active {
  background: var(--rt-btn-active-bg);
  color: var(--rt-btn-active-text);
}
.rt-btn[disabled] { opacity: 0.38; cursor: not-allowed; }
.rt-btn:active:not(:disabled) { transform: translateY(0.5px); }
.rt-btn--menu { padding: 0 8px; gap: 4px; }
.rt-btn--block { min-width: 50px; }
.rt-btn--wide {
  /* Font picker button. FIXED width — no min/max, no flex grow/shrink —
     so picking ANY font (even "Source Code Pro" rendered in its own
     wide mono glyphs) never resizes the button and therefore never
     reflows the rest of the toolbar. The label inside clips with
     ellipsis when the chosen name doesn't fit. 130 px matches the
     natural button size when Bebas Neue is the active font, which
     the user confirmed as the visually perfect toolbar layout. */
  width: 130px;
  flex: 0 0 130px;
  justify-content: space-between;
  /* Prevent the chevron from being pushed out by an outsized label. */
  overflow: hidden;
  /* Always wear the accent background — gives the picker a visible
     "filled" look so it never reads as empty / faded next to the
     other controls, and matches the active-state vocabulary used
     throughout the toolbar. */
  background: var(--rt-btn-active-bg);
  color: var(--rt-btn-active-text);
  border-color: rgba(var(--rt-accent), 0.35);
}
.rt-btn--wide:hover:not(:disabled) {
  background: rgba(var(--rt-accent), 0.24);
}
.rt-btn--wide .rt-btn-label {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Size button — ALWAYS sits next to the Font button (which wears a
   permanent indigo "active" background). Adding margin-left here pushes
   the Size button a few pixels right so its OWN active outline never
   overlaps the Font button's edge when a non-default size is picked.
   The room is borrowed from the empty space SG A had between the
   Clear-formatting button and the right separator. */
.rt-btn--narrow {
  min-width: 64px;
  justify-content: space-between;
  margin-left: 6px;
}
.rt-btn--chevron { min-width: 20px; padding: 0 3px; }
.rt-btn--swatch { padding: 0 6px; min-width: 34px; }
/* Link button — sits in SG C row 2 next to the HR button. Carries an
   icon AND a "www" label so the row matches the visual length of row
   1 (CodeBlock / Code / Quote). The icon is shrunk to 16 px and the
   gap to 2 px so the pair reads as one tight "icon + caption" unit;
   a thin underline drawn via ::after spans both elements so they
   visually belong to the same glyph — like a hyperlink — instead of
   reading as two stacked controls. The accent indigo is reserved for
   :hover / .is-active states like every other button on the toolbar. */
.rt-btn--link {
  position: relative;
  width: 68px;
  flex: 0 0 68px;
  padding: 0 6px 2px;
  gap: 0;
  justify-content: center;
}
.rt-btn--link::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 7px;
  width: 39px;
  height: 1.5px;
  transform: translateX(-45%);
  background: #2563eb;
  border-radius: 1px;
  pointer-events: none;
}
.rt-btn--link .tabler-icon { width: 16px; height: 16px; }
.rt-btn--link .tabler-icon > svg { width: 100%; height: 100%; }
.rt-btn--link .rt-btn-label {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: lowercase;
  /* Pull the label flush against the icon so the pair reads as a
     single "icon + caption" unit, not two side-by-side controls. */
  margin-left: 0;
}
.rt-btn-label {
  font-size: 0.88rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.rt-btn-inner { display: inline-flex; align-items: center; justify-content: center; }

/* Tabler icons are rendered inline via <span dangerouslySetInnerHTML>. The
   wrapping span acts as the sizing box; the inner <svg> fills it. Using
   stroke-width: 1.75 nudges the Tabler stroke a touch lighter so the
   toolbar doesn't feel heavy at 20 px. */
.tabler-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  line-height: 0;
  color: inherit;
  flex-shrink: 0;
}
.tabler-icon > svg {
  width: 100%;
  height: 100%;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}
/* Filled Tabler glyphs (anything from the tabler-icons-filled set —
   e.g. bell-ringing-filled, info-circle-filled). The default rule
   above strokes everything and clears fill, which strips a filled
   icon to outlines; this restores the intended look. */
.tabler-icon--filled > svg {
  fill: currentColor;
  stroke: none;
}
.tabler-icon--filled > svg [fill="none"] { fill: none; }
.tabler-icon--chevron,
.tabler-icon--chevron > svg { width: 12px; height: 12px; stroke-width: 2; opacity: 0.75; }

/* Legacy .rt-btn svg rules kept for anything still rendering a bare SVG
   (Underline variant, text-only marks). Tabler-backed spans are sized
   by .tabler-icon above and ignore this rule. */
.rt-btn svg { width: 20px; height: 20px; }
.rt-btn--chevron svg { width: 12px; height: 12px; }

/* Chevron appended INSIDE a .rt-btn (colour / highlight buttons) — small
   so it signals "dropdown" without competing with the swatch. */
.rt-btn--has-chevron { gap: 2px; }
.rt-btn--has-chevron > .tabler-icon--chevron { opacity: 0.7; }

/* Block-type button — typographic badge that stands visually apart
   from the line-based icons of the rest of the toolbar. */
.rt-block-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 22px;
  padding: 0 6px;
  border-radius: 5px;
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1;
  background: rgba(99, 102, 241, 0.12);
  color: rgb(99, 102, 241);
  letter-spacing: 0.02em;
}
.rt-block-badge--p   { font-size: 1.15rem; }
.rt-block-badge--h1  { font-size: 0.92rem; }
.rt-block-badge--h2  { font-size: 0.88rem; }
.rt-block-badge--h3  { font-size: 0.82rem; }
html.dark .rt-block-badge {
  background: rgba(129, 140, 248, 0.18);
  color: rgb(165, 180, 252);
}
.rt-btn.is-active .rt-block-badge {
  background: rgba(255, 255, 255, 0.25);
}

/* Block-style gallery (Paragraph / H1 / H2 / H3) — four preview buttons
   arranged 2x2 inside their own super-group at the right of the toolbar. */
.rt-sg--style {
  gap: 3px;
  /* Style super-group sits at the END of the toolbar but no margin-
     left: auto: the giant gap that used to appear between SG C's
     separator and the Style block (when the toolbar didn't fully
     fill the modal width) was visually unbalanced. Adjacent to the
     last separator now — empty room, if any, sits at the right
     edge of the modal where it reads as natural padding. */
}
.rt-sg--style .rt-sg-row { gap: 3px; }

.rt-style-btn {
  /* Fixed width — all six buttons render at the same exact size so
     the gallery reads as a uniform 2x3 grid. Labels that don't fit
     ("Paragraphe" at the longer end) clip with ellipsis via the
     .rt-style-btn-sample rules. */
  width: 84px;
  flex: 0 0 84px;
  height: 32px;
  padding: 0 6px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: transparent;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  text-align: left;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.1s ease;
  user-select: none;
  overflow: hidden;
}
.rt-style-btn:hover:not(:disabled) {
  background: var(--rt-btn-hover);
  border-color: var(--rt-divider-strong);
}
.rt-style-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--rt-accent), 0.55);
}
.rt-style-btn.is-active {
  background: var(--rt-btn-active-bg);
  color: var(--rt-btn-active-text);
  border-color: rgba(var(--rt-accent), 0.45);
}
.rt-style-btn:active:not(:disabled) { transform: translateY(0.5px); }

.rt-style-btn-sample {
  /* line-height bumped to 1.3 so descenders (g, p in "Paragraphe")
     have room below the baseline and don't get clipped by the button's
     overflow: hidden + ellipsis stack. */
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* Slight vertical breathing room — clears the bottom of g / p
     when align-items: center pulls the line box upward. */
  padding-block: 1px 3px;
  /* Inherit the note's typography so the preview actually MATCHES what
     the user will see once the style is applied — font family, italic /
     oblique, colour, all carry through to the sample. The per-block
     font-size / weight come from the --gk-type-* variables the
     typography-presets panel drives, scaled to fit the button. */
  font-family: inherit;
  font-style: inherit;
  color: inherit;
}
/* Per-block preview: font-size is the user's configured value * 0.7
   (scaled so the H1 preview fits in the 32-px button), capped by min()
   so extreme values still sit inside the row. font-weight is the raw
   configured weight — keeping that exact preserves the visual impact
   of Bold vs Medium vs Regular in the preview. */
/* Per-block sample. font-size is the user's configured value scaled
   down (* 0.7) AND capped via min() so even with aggressive presets
   the label fits inside the 84-px button without overflowing.
   font-weight stays exact so "Bold" looks bold and "Normal" looks
   normal in the preview. */
.rt-style-btn--p  .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-p-size,  1rem)    * 0.7), 0.78rem);
  font-weight: var(--gk-type-p-weight, 400);
  color: var(--gk-type-p-color, inherit);
  font-style: var(--gk-type-p-italic, normal);
  text-decoration: var(--gk-type-p-underline, none);
}
.rt-style-btn--h1 .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-h1-size, 1.5rem)  * 0.7), 1.1rem);
  font-weight: var(--gk-type-h1-weight, 600);
  color: var(--gk-type-h1-color, inherit);
  font-style: var(--gk-type-h1-italic, normal);
  text-decoration: var(--gk-type-h1-underline, none);
}
.rt-style-btn--h2 .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-h2-size, 1.25rem) * 0.7), 1rem);
  font-weight: var(--gk-type-h2-weight, 600);
  color: var(--gk-type-h2-color, inherit);
  font-style: var(--gk-type-h2-italic, normal);
  text-decoration: var(--gk-type-h2-underline, none);
}
.rt-style-btn--h3 .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-h3-size, 1.125rem) * 0.7), 0.9rem);
  font-weight: var(--gk-type-h3-weight, 600);
  color: var(--gk-type-h3-color, inherit);
  font-style: var(--gk-type-h3-italic, normal);
  text-decoration: var(--gk-type-h3-underline, none);
}
.rt-style-btn--h4 .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-h4-size, 1rem)    * 0.7), 0.82rem);
  font-weight: var(--gk-type-h4-weight, 600);
  color: var(--gk-type-h4-color, inherit);
  font-style: var(--gk-type-h4-italic, normal);
  text-decoration: var(--gk-type-h4-underline, none);
}
.rt-style-btn--h5 .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-h5-size, 0.9rem)  * 0.7), 0.78rem);
  font-weight: var(--gk-type-h5-weight, 600);
  color: var(--gk-type-h5-color, inherit);
  font-style: var(--gk-type-h5-italic, normal);
  text-decoration: var(--gk-type-h5-underline, none);
}
/* When the button is active (current block matches), the indigo active
   colour wins over the preset colour so the selection state stays
   readable against the active-background tint. */
.rt-style-btn.is-active .rt-style-btn-sample { color: inherit; }

.rt-splitbtn {
  display: inline-flex;
  align-items: stretch;
  position: relative;
  border-radius: 6px;
}
.rt-splitbtn > .rt-btn:first-child { border-top-right-radius: 0; border-bottom-right-radius: 0; padding-right: 3px; }
.rt-splitbtn > .rt-btn--chevron { border-top-left-radius: 0; border-bottom-left-radius: 0; padding-left: 2px; }

/* Separator spans the full super-group height (both sub-rows) so the
   visual break between groups reads unambiguously in the Word-ribbon
   layout. 6 px horizontal margin matches the ribbon padding rhythm. */
.rt-sep {
  width: 1px;
  align-self: stretch;
  background: var(--rt-divider-strong);
  margin: 2px 6px;
  display: inline-block;
  flex-shrink: 0;
  opacity: 0.75;
}

/* Inline swatch markers on the text-colour / highlight buttons. The Tabler
   typography/highlight glyph stacks on top of a colour bar that shows the
   currently picked colour — matches Word's "A + bar" pattern. */
.rt-icon-swatch {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  line-height: 0;
}
.rt-icon-swatch .tabler-icon { width: 18px; height: 18px; }
.rt-icon-swatch-bar {
  display: block;
  width: 16px;
  height: 3px;
  border-radius: 1px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}
html.dark .rt-icon-swatch-bar { border-color: rgba(255, 255, 255, 0.12); }
`;
