// Multi-select floating dock, then note content as rendered in cards and in
// the modal: typography, task lists, ordered-list counters, links, code and
// blockquotes.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const notesCSS = `
/* ───────── Multi-select floating dock ─────────
   Premium floating dock anchored at the bottom of the viewport. Fully
   OPAQUE (no backdrop blur / glass) so notes behind never bleed through
   and compromise lisibility. Violet/blue tinted skin to give the dock
   a real identity within the Glasskeep palette. */
.multi-select-dock {
  position: fixed;
  left: 12px;
  right: 12px;
  /* Anchored flush against the bottom of NotesHeader (no gap).
     The header is sticky at top:0 with ~88px desktop / 72px mobile
     of content height, so the dock top equals header height +
     safe-area-inset-top. Header sits at z-40 and the dock at z-35,
     so any minor overlap from a banner row hides cleanly behind
     the header rather than poking through. */
  top: calc(var(--safe-top) + 96px);
  bottom: auto;
  z-index: 35;
  pointer-events: none;
  display: flex;
  justify-content: center;
  /* No max-width: the wrapper spans the real available content width
     (viewport minus left, right, and any sidebar offset). The inner
     card sits inside as a flex item sized to its content, so it stays
     compact while the wrapper carries the full budget for overflow
     detection. */
}
.multi-select-dock__inner {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  /* Size to content (compact dock) but never exceed the wrapper budget. */
  flex: 0 0 auto;
  max-width: 100%;
  min-width: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, #faf8ff 0%, #f1ecff 50%, #ebe4ff 100%);
  border: 2px solid rgba(124, 58, 237, 0.32);
  box-shadow:
    0 22px 56px -14px rgba(76, 29, 149, 0.32),
    0 12px 30px -10px rgba(99, 102, 241, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 0 0 1px rgba(124, 58, 237, 0.08);
  animation: multiDockIn 220ms cubic-bezier(.22,.61,.36,1) both;
}
html.dark .multi-select-dock__inner {
  background: linear-gradient(135deg, #1e1a3d 0%, #261f4f 50%, #2c2456 100%);
  border: 2px solid rgba(167, 139, 250, 0.36);
  box-shadow:
    0 22px 56px -14px rgba(0, 0, 0, 0.7),
    0 12px 30px -10px rgba(76, 29, 149, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 0 0 1px rgba(167, 139, 250, 0.12);
}
.multi-select-dock--exiting .multi-select-dock__inner {
  animation: multiDockOut 200ms ease-in both;
}
.multi-select-dock__divider {
  width: 1px;
  height: 24px;
  background: rgba(124, 58, 237, 0.22);
  flex-shrink: 0;
}
html.dark .multi-select-dock__divider {
  background: rgba(167, 139, 250, 0.22);
}

/* Off-screen ghost row used to measure each action button's natural
   width. Must NOT influence layout but must lay out naturally so each
   button reports its real intrinsic width. */
.multi-select-dock__measure {
  position: absolute;
  top: -10000px;
  left: -10000px;
  visibility: hidden;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

/* Kebab popover — opens BELOW the dock (dock is anchored at the top).
   Visual style matches the modal's kebab menu (ModalFooter): white
   background in light mode, #222 in dark, with colored TEXT items
   (set inline by JS) and a neutral grey hover. */
.multi-select-dock__menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 200px;
  padding: 4px 0;
  border-radius: 10px;
  background: #ffffff;
  color: #1f2937;
  border: 1px solid var(--border-light);
  box-shadow:
    0 14px 32px -10px rgba(15, 23, 42, 0.20),
    0 6px 16px -8px rgba(15, 23, 42, 0.15);
  z-index: 1;
  animation: multiDockMenuIn 160ms ease-out both;
}
html.dark .multi-select-dock__menu {
  background: #222222;
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 14px 32px -10px rgba(0, 0, 0, 0.65),
    0 6px 16px -8px rgba(0, 0, 0, 0.5);
}

@keyframes multiDockIn {
  from { opacity: 0; transform: translateY(-10px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0)     scale(1);    }
}
@keyframes multiDockOut {
  from { opacity: 1; transform: translateY(0)     scale(1);    }
  to   { opacity: 0; transform: translateY(-12px) scale(0.97); }
}
@keyframes multiDockMenuIn {
  from { opacity: 0; transform: translateY(-6px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}

@media (max-width: 639px) {
  .multi-select-dock {
    left: 8px;
    right: 8px;
  }
  .multi-select-dock__inner {
    padding: 6px 8px;
    gap: 6px;
    border-radius: 14px;
  }
}
/* Mobile: dock follows the header auto-hide. Transition matches the
   header slide duration so the two move in lockstep. */
@media (max-width: 699px) {
  .multi-select-dock {
    transition: top 180ms cubic-bezier(.22,.61,.36,1);
  }
  .multi-select-dock[data-header-visible="true"] {
    top: calc(var(--safe-top) + 80px);
  }
  .multi-select-dock[data-header-visible="false"] {
    top: calc(var(--safe-top) + 8px);
  }
  .multi-select-dock--exiting .multi-select-dock__inner {
    animation: none;
  }
}
.note-content { -webkit-user-select: text; user-select: text; }
/* Text cursor on the modal's note body (both edit AND view mode) so the
   user sees the selection cursor when hovering the text — useful for
   copy-paste in read mode. Scoped with .note-modal-anim so the closed-
   note cards in the grid keep their pointer cursor (clicking a card
   opens the modal). */
.note-modal-anim .note-content,
.note-modal-anim .note-content--dense {
  cursor: text;
}
/* Block margins are zeroed so that vertical spacing is driven solely by the
   blank lines the user typed — mirroring the textarea in edit mode.  Spacer
   elements are injected by renderSafeMarkdown() (see markdown.jsx). */
.note-content p { margin: 0; }
.note-content h1, .note-content h2, .note-content h3,
.note-content h4, .note-content h5, .note-content h6 { margin: 0; font-weight: 600; }
.note-content h1 { font-size: 1.5rem; line-height: 1.5; }
.note-content h2 { font-size: 1.25rem; line-height: 1.5; }
.note-content h3 { font-size: 1.125rem; line-height: 1.5; }
.note-content h4 { font-size: 1rem;    line-height: 1.5; }
.note-content h5 { font-size: 0.9rem;  line-height: 1.5; }
.note-content .md-blank-line { display: block; height: 1lh; }
/* Fallback for engines without the lh unit: approximate 1.5x font-size */
@supports not (height: 1lh) {
  .note-content .md-blank-line { height: 1.5em; }
}

/* NEW: Prevent long headings/URLs from overflowing, allow tables/code to scroll */
.note-content,
.note-content * { overflow-wrap: anywhere; word-break: break-word; }
.note-content pre { overflow: hidden; white-space: pre-wrap; word-break: break-word; }

/* Make pre relative so copy button can be positioned */
.note-content pre { position: relative; }

/* Wrapper for code blocks to anchor copy button outside scroll area */
.code-block-wrapper { position: relative; }
.code-block-wrapper .code-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
}


.note-content table { display: block; max-width: 100%; overflow-x: auto; }

/* Default lists (subtle spacing for inline previews) */
.note-content ul, .note-content ol { margin: 0.25rem 0 0.25rem 1.25rem; padding-left: 0.75rem; }
.note-content ul { list-style: disc; }
.note-content ol { list-style: decimal; }
.note-content li { margin: 0.15rem 0; line-height: 1.35; }

/* View-mode dense lists in modal: NO extra space between items */
.note-content--dense ul, .note-content--dense ol { margin: 0; padding-left: 1.1rem; }
.note-content--dense li { margin: 0; padding: 0; line-height: 1.45; }
.note-content--dense li > p { margin: 0; }
.note-content--dense li ul, .note-content--dense li ol { margin: 0.1rem 0 0; padding-left: 1rem; }

/* --------------------------------------------------------------------
   Task lists (checkbox lists) inside rich-text notes.

   Edit-mode reality check: TaskItem ships an addNodeView() that builds
   the live <li> by hand and only sets dataset.checked. The
   data-type="taskItem" attribute that TaskItem.renderHTML() injects is
   therefore ONLY present in the static HTML used by read mode /
   previews — never inside the editor. We anchor every selector on the
   <ul data-type="taskList"> (which IS marked in both modes) so the
   layout works identically in edit and read mode. Strike-on-check is
   then keyed off the per-item [data-checked="true"] which the NodeView
   sets via dataset, and which generateHTML emits as data-checked="true"
   in the static output. Same selector, both modes — no fragile data-type
   matching on the <li>.

   DOM shape (both modes):
       ul[data-type=taskList]
         > li[data-checked]
             > label > input[type=checkbox] (+ helper span)
             > div  > p   (the editable item text)
   -------------------------------------------------------------------- */
.rt-editor-content ul[data-type="taskList"],
.note-content ul[data-type="taskList"] {
  list-style: none;
  margin: 0.15rem 0;
  padding-left: 0;
}
.rt-editor-content ul[data-type="taskList"] > li,
.note-content ul[data-type="taskList"] > li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0.1rem 0;
  padding: 0;
  /* Kill the inherited bullet marker that would otherwise leak in from
     the generic .note-content ul rule. */
  list-style: none;
}
.rt-editor-content ul[data-type="taskList"] > li::marker,
.note-content ul[data-type="taskList"] > li::marker {
  content: "";
}
.rt-editor-content ul[data-type="taskList"] > li > label,
.note-content ul[data-type="taskList"] > li > label {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  margin: 0.18em 0 0;
  user-select: none;
}
/* Tiptap's NodeView appends an empty <span> next to the input as a
   styling hook. We don't use it — keep it out of the layout. */
.rt-editor-content ul[data-type="taskList"] > li > label > span,
.note-content ul[data-type="taskList"] > li > label > span {
  display: none;
}
.rt-editor-content ul[data-type="taskList"] > li > div,
.note-content ul[data-type="taskList"] > li > div {
  flex: 1 1 auto;
  min-width: 0;
}
.rt-editor-content ul[data-type="taskList"] > li > div > p,
.note-content ul[data-type="taskList"] > li > div > p {
  margin: 0;
}
.rt-editor-content ul[data-type="taskList"] input[type="checkbox"],
.note-content ul[data-type="taskList"] input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  margin: 0;
  accent-color: rgb(var(--rt-accent));
}
/* Read mode + card previews have no save path, so a checkbox toggle there
   would not persist — make them display-only. The editor's NodeView keeps
   them interactive on its own. */
.note-content:not(.rt-editor-content) ul[data-type="taskList"] input[type="checkbox"] {
  pointer-events: none;
  cursor: default;
}
/* Nested checklists keep a modest indent. */
.rt-editor-content ul[data-type="taskList"] ul[data-type="taskList"],
.note-content ul[data-type="taskList"] ul[data-type="taskList"] {
  margin-top: 0.15rem;
  padding-left: 1.25rem;
}
/* "Strike through checked items" reading preference (per device), gated by
   the gk-strike-checked class on <html>. Purely visual — the checked state
   itself lives in the note's Tiptap JSON, this only restyles the content
   wrapper. The selector matches BOTH modes because dataset.checked (edit)
   and renderHTML's data-checked (read) both produce data-checked="true". */
html.gk-strike-checked .rt-editor-content ul[data-type="taskList"] > li[data-checked="true"] > div,
html.gk-strike-checked .note-content ul[data-type="taskList"] > li[data-checked="true"] > div {
  text-decoration: line-through;
  opacity: 0.6;
}

/* --------------------------------------------------------------------
   Continuous numbering for ordered lists.

   Problem: when the user types an ordered list, a code block (or any
   other non-list block) and another ordered list, ProseMirror emits
   two separate <ol> elements. Each <ol> natively restarts at 1, which
   was confusing the user ("mon 2. est redevenu 1. après un bloc de
   code").

   Fix: a named CSS counter (gk-ol) scoped to the editor / view
   container, surfaced via ::marker so the NATIVE <ol> layout is kept
   untouched (no padding/indent change — only the digits displayed are
   replaced). Nested ordered lists (inside an <li>) explicitly reset
   the counter so sub-lists still start at 1.
   -------------------------------------------------------------------- */
.rt-editor-content,
.note-content--dense,
.note-content {
  counter-reset: gk-ol;
}
.rt-editor-content li ol,
.note-content--dense li ol,
.note-content li ol {
  counter-reset: gk-ol;
}
/* Restart the gk-ol counter when an ordered list directly follows a
   "break" element — paragraph, heading, blockquote, bullet list,
   horizontal rule. Matches the Word / Google Docs behaviour: leaving
   a list and typing a new title before starting a fresh list resets
   the numbering to 1. The code block (<pre>) is deliberately absent
   from this list, which preserves the existing "ol then code block
   then ol keeps counting" behaviour. Adjacent-sibling selector (the
   plus combinator) keeps the reset local to the ordered list itself,
   dodging the CSS counter scoping quirk where a counter-reset on a
   block leaks into its following siblings. */
.rt-editor-content :is(p, h1, h2, h3, h4, h5, h6, blockquote, ul, hr) + ol,
.note-content--dense :is(p, h1, h2, h3, h4, h5, h6, blockquote, ul, hr) + ol,
.note-content :is(p, h1, h2, h3, h4, h5, h6, blockquote, ul, hr) + ol {
  counter-reset: gk-ol;
}
.rt-editor-content ol > li,
.note-content--dense ol > li,
.note-content ol > li {
  counter-increment: gk-ol;
}
.rt-editor-content ol > li::marker,
.note-content--dense ol > li::marker,
.note-content ol > li::marker {
  content: counter(gk-ol) ". ";
  font-variant-numeric: tabular-nums;
}

/* Fix: marked outputs \n between block elements; with white-space:pre-wrap on
   the container these render as visible ~24px anonymous blocks.  Set normal on
   the wrapper so inter-block \n collapses, then restore pre-wrap on leaf text
   elements so user line-breaks inside paragraphs / list items are preserved. */
.note-content--dense { white-space: normal; }
.note-content--dense p,
.note-content--dense li,
.note-content--dense h1, .note-content--dense h2, .note-content--dense h3,
.note-content--dense h4, .note-content--dense h5, .note-content--dense h6,
.note-content--dense td, .note-content--dense th { white-space: pre-wrap; }
.note-content--dense p { margin: 0; }
/* Empty paragraphs in the editor render as one visible line (cursor +
   line-height); after serialisation they end up as bare <p></p> nodes
   that, with margin:0, collapse to zero height in the dense read view.
   That's what makes a deliberately-inserted blank line between two
   blocks (especially between a paragraph and a heading) disappear in
   lecture mode. Inject a non-breaking space via ::before so an empty
   <p> reserves one line of vertical space again. */
.note-content--dense p:empty::before {
  content: " ";
}
/* Match the rich-text editor's spacing (.rt-editor-content hr / pre)
   so the separator-to-block gap reads identically in lecture and
   édition mode. */
.note-content--dense pre { margin: 1rem 0; }
.note-content--dense hr { margin: 0.85rem 0; }

/* Hyperlinks in view mode */
.note-content a {
  color: #2563eb;
  text-decoration: underline;
}
html.dark .note-content a {
  color: #93c5fd;
}
.note-card .note-content a {
  pointer-events: none;
}

/* Closed-note size: body text in the card preview renders at 14 px so
   a card shows more of the note at a glance. Only applies to the CARD
   (.note-card). The modal's edit and view modes keep their configured
   rendering (default 16 px / the user's typography-preset size). */
.note-card .note-content,
.note-card .note-content--dense {
  font-size: 0.875rem;
}
.note-card .note-content--dense p {
  font-size: 0.875rem;
  font-weight: var(--gk-type-p-weight, 400);
}

/* Inline code and fenced code styling */
.note-content code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  background: rgba(0,0,0,0.06);
  padding: .12rem .35rem;
  border-radius: .35rem;
  border: 1px solid var(--border-light);
  font-size: .9em;
}

/* Fenced code block container (pre) */
.note-content pre {
  background: rgba(0,0,0,0.06);
  border: 1px solid var(--border-light);
  border-radius: .6rem;
  padding: .75rem .9rem;
}
/* Remove inner background on code inside pre */
.note-content pre code {
  border: none !important;
  background: transparent !important;
  padding: 0;
  display: block;
}

/* Blockquote – elegant styled citation, color-aware via --note-color */
.note-content blockquote,
.prose blockquote {
  border-left: 4px solid color-mix(in srgb, var(--note-color, #6366f1) 50%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--note-color, #6366f1) 18%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--note-color, #6366f1) 18%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--note-color, #6366f1) 18%, transparent);
  border-radius: 0.5rem;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--note-color, #6366f1) 8%, transparent) 0%,
    color-mix(in srgb, var(--note-color, #6366f1) 5%, transparent) 100%
  );
  font-style: italic;
  margin: 0 0 0.75rem 0;
  padding: 0.6rem 0.9rem 0.6rem 1.25rem;
  color: var(--text-light);
}
html.dark .note-content blockquote,
html.dark .prose blockquote {
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--note-color, #6366f1) 22%, #1e1e2e) 0%,
    color-mix(in srgb, var(--note-color, #6366f1) 14%, #1e1e2e) 100%
  );
  border-left-color: color-mix(in srgb, var(--note-color, #818cf8) 55%, white);
  border-right-color: color-mix(in srgb, var(--note-color, #818cf8) 30%, white);
  border-top-color: color-mix(in srgb, var(--note-color, #818cf8) 30%, white);
  border-bottom-color: color-mix(in srgb, var(--note-color, #818cf8) 30%, white);
}
/* Avoid double margins from <p> inside blockquote */
.note-content blockquote p,
.prose blockquote p {
  margin: 0;
}
.note-content blockquote p + p,
.prose blockquote p + p {
  margin-top: 0.35rem;
}
/* Prose plugin overrides: remove default quote pseudo-elements and italic */
.prose blockquote::before,
.prose blockquote::after {
  content: none !important;
}
.prose blockquote p:first-of-type::before,
.prose blockquote p:last-of-type::after {
  content: none !important;
}
`;
