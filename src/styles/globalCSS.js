/** ---------- Global CSS injection ---------- */
export const globalCSS = `
:root {
  --bg-light: #f0f2f5;
  --bg-dark: #1a1a1a;
  --card-bg-light: rgba(255, 255, 255, 0.6);
  --card-bg-dark: rgba(40, 40, 40, 0.6);
  --text-light: #1f2937;
  --text-dark: #e5e7eb;
  --border-light: rgba(209, 213, 219, 0.3);
  --border-dark: rgba(75, 85, 99, 0.3);
}
html.dark {
  --bg-light: var(--bg-dark);
  --card-bg-light: var(--card-bg-dark);
  --text-light: var(--text-dark);
  --border-light: var(--border-dark);
}
button, [role="button"] { cursor: pointer; }
/* Prevent blinking caret on non-editable elements */
body { -webkit-user-select: none; user-select: none; }
input, textarea, [contenteditable="true"] { -webkit-user-select: text; user-select: text; }
body {
  background-color: #f0e8ff;
  background-image: linear-gradient(135deg, #f0e8ff 0%, #e8f4fd 50%, #fde8f0 100%);
  background-attachment: fixed;
  color: var(--text-light);
  transition: background-color 0.3s ease, color 0.3s ease;
}
html.dark body {
  background-color: #1a1a1a;
  background-image: none;
  background-attachment: fixed;
}
.glass-card {
  background-color: var(--card-bg-light);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-light);
  box-shadow: 0 4px 24px rgba(139, 92, 246, 0.07);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  break-inside: avoid;
}
/* Note cards: skip rendering when off-screen, isolate paint */
.note-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 200px;
  contain: layout style paint;
  animation: noteAppear 0.15s ease-out;
  -webkit-user-select: none;
  user-select: none;
}
.note-card { cursor: pointer; }
/* Draw note cards: disable content-visibility which forces paint containment */
.note-card--draw {
  content-visibility: visible;
  contain: layout style;
}
/* Drag & drop reorder styles */
.note-card.dragging {
  opacity: 0.35;
  transform: scale(0.97);
}
.note-card.drag-over {
  outline: 2.5px dashed #6366f1;
  outline-offset: 4px;
  transition: outline-offset 0.15s ease;
}
@keyframes noteAppear {
  from { opacity: 0; }
  to   { opacity: 1; }
}
header.glass-card {
  background: linear-gradient(
    90deg,
    rgba(99, 102, 241, 0.07) 0%,
    rgba(168, 85, 247, 0.07) 50%,
    rgba(236, 72, 153, 0.05) 100%
  ), var(--card-bg-light);
  border-bottom: 1px solid rgba(139, 92, 246, 0.18);
  box-shadow: 0 2px 20px rgba(139, 92, 246, 0.10);
}
html.dark header.glass-card {
  background: var(--card-bg-light);
  border-bottom: 1px solid var(--border-light);
  box-shadow: none;
}
header.multi-select-bar {
  border: 2px solid rgba(139, 92, 246, 0.45);
  box-shadow: 0 4px 24px rgba(139, 92, 246, 0.18), inset 0 0 0 1px rgba(139, 92, 246, 0.08);
}
html.dark header.multi-select-bar {
  border: 2px solid rgba(139, 92, 246, 0.5);
  box-shadow: 0 4px 24px rgba(139, 92, 246, 0.22), inset 0 0 0 1px rgba(139, 92, 246, 0.1);
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
.note-content--dense pre { margin: 0.4rem 0; }
.note-content--dense hr { margin: 0; }

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

/* ── Modal icon pill container ─────────────────────────────────────────── */
.modal-icon-group {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.25rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.08),
    0 4px 16px rgba(0, 0, 0, 0.05);
}
html.dark .modal-icon-group {
  background: rgba(28, 28, 34, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.09);
  box-shadow:
    0 1px 4px rgba(0, 0, 0, 0.5),
    0 6px 20px rgba(0, 0, 0, 0.4);
}

/* ── Buttons ───────────────────────────────────────────────────────────── */
.modal-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #4b5563;
  cursor: pointer;
  position: relative;
  transition:
    background 0.14s ease,
    color      0.14s ease,
    transform  0.18s cubic-bezier(0.34, 1.5, 0.64, 1);
}
.modal-icon-btn svg {
  display: block;
  transition: transform 0.18s cubic-bezier(0.34, 1.5, 0.64, 1);
}
.modal-icon-btn:hover {
  background: rgba(0, 0, 0, 0.07);
  color: #111827;
}
.modal-icon-btn:hover svg {
  transform: scale(1.18);
}
.modal-icon-btn:active {
  transform: scale(0.9) !important;
  transition: transform 0.08s ease !important;
}
html.dark .modal-icon-btn {
  color: rgba(255, 255, 255, 0.65);
}
html.dark .modal-icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.96);
}


.modal-icon-btn--mode {
  background: linear-gradient(90deg, #6366f1 0%, #7c3aed 100%) !important;
  color: #fff !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35) !important;
}
.modal-icon-btn--mode:hover {
  background: linear-gradient(90deg, #4f46e5 0%, #6d28d9 100%) !important;
  color: #fff !important;
  box-shadow: 0 8px 18px rgba(99, 102, 241, 0.45) !important;
}
html.dark .modal-icon-btn--mode {
  color: #fff !important;
}


/* ── Save checkmark states ──────────────────────────────────────────── */
.modal-icon-btn--save-active {
  color: #fff !important;
  background: linear-gradient(90deg, #10b981 0%, #059669 100%) !important;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35) !important;
}
.modal-icon-btn--save-active:hover {
  background: linear-gradient(90deg, #059669 0%, #047857 100%) !important;
  box-shadow: 0 8px 18px rgba(16, 185, 129, 0.45) !important;
}
html.dark .modal-icon-btn--save-active {
  color: #fff !important;
}
.modal-icon-btn--save-idle {
  color: rgba(16, 185, 129, 0.25) !important;
  border: 1.5px solid rgba(16, 185, 129, 0.15) !important;
  background: transparent !important;
}
html.dark .modal-icon-btn--save-idle {
  color: rgba(52, 211, 153, 0.45) !important;
  border-color: rgba(52, 211, 153, 0.25) !important;
}

/* ── Séparateur avant le bouton close ──────────────────────────────────── */
.modal-icon-btn--close {
  margin-left: 1rem;
}
.modal-icon-btn--close::before {
  content: '';
  position: absolute;
  left: -0.5rem;
  top: 18%;
  height: 64%;
  width: 1px;
  background: rgba(0, 0, 0, 0.12);
  border-radius: 1px;
}
html.dark .modal-icon-btn--close::before {
  background: rgba(255, 255, 255, 0.12);
}

/* ── Close hover rouge ──────────────────────────────────────────────────── */
.modal-icon-btn--close:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  color: #dc2626 !important;
}
html.dark .modal-icon-btn--close:hover {
  background: rgba(239, 68, 68, 0.18) !important;
  color: #fca5a5 !important;
}

/* ── Active (pin épinglé) — accent indigo fixe ──────────────────────────── */
.modal-icon-btn--active {
  background: #1e293b !important;
  color: #ffffff !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22) !important;
}
.modal-icon-btn--active:hover {
  background: #0f172a !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3) !important;
}
.modal-icon-btn--active svg {
  transform: none !important;
}
html.dark .modal-icon-btn--active {
  background: rgba(255, 255, 255, 0.16) !important;
  color: #ffffff !important;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.4),
    inset 0 0 0 1px rgba(255, 255, 255, 0.2) !important;
}
html.dark .modal-icon-btn--active:hover {
  background: rgba(255, 255, 255, 0.22) !important;
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.5),
    inset 0 0 0 1px rgba(255, 255, 255, 0.28) !important;
}

/* ── Colored icon variants (desktop inline) ───────────────────────────── */
.modal-icon-btn--trash {
  color: #dc2626;
}
.modal-icon-btn--trash:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  color: #b91c1c !important;
}
html.dark .modal-icon-btn--trash {
  color: #f87171;
}
html.dark .modal-icon-btn--trash:hover {
  background: rgba(239, 68, 68, 0.18) !important;
  color: #fca5a5 !important;
}

.modal-icon-btn--download {
  color: #16a34a;
}
.modal-icon-btn--download:hover {
  background: rgba(22, 163, 74, 0.1) !important;
  color: #15803d !important;
}
html.dark .modal-icon-btn--download {
  color: #4ade80;
}
html.dark .modal-icon-btn--download:hover {
  background: rgba(34, 197, 94, 0.15) !important;
  color: #86efac !important;
}

.modal-icon-btn--archive {
  color: #a16207;
}
.modal-icon-btn--archive:hover {
  background: rgba(161, 98, 7, 0.1) !important;
  color: #854d0e !important;
}
html.dark .modal-icon-btn--archive {
  color: #fbbf24;
}
html.dark .modal-icon-btn--archive:hover {
  background: rgba(251, 191, 36, 0.15) !important;
  color: #fcd34d !important;
}

.modal-icon-btn--collab {
  color: #7c3aed;
}
.modal-icon-btn--collab:hover {
  background: rgba(124, 58, 237, 0.1) !important;
  color: #6d28d9 !important;
}
html.dark .modal-icon-btn--collab {
  color: #a78bfa;
}
html.dark .modal-icon-btn--collab:hover {
  background: rgba(167, 139, 250, 0.15) !important;
  color: #c4b5fd !important;
}

.modal-icon-btn--image {
  color: #0284c7;
}
.modal-icon-btn--image:hover {
  background: rgba(2, 132, 199, 0.1) !important;
  color: #0369a1 !important;
}
html.dark .modal-icon-btn--image {
  color: #38bdf8;
}
html.dark .modal-icon-btn--image:hover {
  background: rgba(56, 189, 248, 0.15) !important;
  color: #7dd3fc !important;
}

/* ── Modal footer toolbar (Google Keep style) ─────────────────────────── */
.modal-footer-toolbar {
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.04);
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.06);
}
html.dark .modal-footer-toolbar {
  background: rgba(0, 0, 0, 0.15);
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.2);
}
.modal-footer-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(0, 0, 0, 0.54);
  cursor: pointer;
  transition:
    background 0.14s ease,
    color      0.14s ease,
    transform  0.18s cubic-bezier(0.34, 1.5, 0.64, 1);
}

/* Labeled variant (desktop): pill with icon + text */
.modal-footer-labeled-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  height: 32px;
  padding: 0 0.6rem;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: rgba(0, 0, 0, 0.58);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.14s ease,
    color      0.14s ease,
    transform  0.18s cubic-bezier(0.34, 1.5, 0.64, 1);
}
.modal-footer-labeled-btn span {
  line-height: 1;
}

.modal-footer-btn svg,
.modal-footer-labeled-btn svg {
  display: block;
  flex-shrink: 0;
  transition: transform 0.18s cubic-bezier(0.34, 1.5, 0.64, 1);
}
.modal-footer-btn:hover,
.modal-footer-labeled-btn:hover {
  background: rgba(0, 0, 0, 0.07);
  color: #111827;
}
.modal-footer-btn:hover svg,
.modal-footer-labeled-btn:hover svg {
  transform: scale(1.12);
}
.modal-footer-btn:active,
.modal-footer-labeled-btn:active {
  transform: scale(0.9) !important;
  transition: transform 0.08s ease !important;
}
html.dark .modal-footer-btn,
html.dark .modal-footer-labeled-btn {
  color: rgba(255, 255, 255, 0.92);
}
html.dark .modal-footer-btn:hover,
html.dark .modal-footer-labeled-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

/* Responsive: collapse labels to icon-only below 1024px, distribute evenly */
@media (max-width: 1023px) {
  .modal-footer-labeled-btn {
    width: 34px;
    height: 34px;
    padding: 0;
    border-radius: 50%;
    justify-content: center;
    gap: 0;
    flex-shrink: 0;
  }
  .modal-footer-labeled-btn > span {
    display: none;
  }
  .modal-footer-btn {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
  }
  .modal-footer-inner {
    justify-content: space-evenly;
    gap: 0;
    padding-left: 0;
    padding-right: 0;
  }
  .modal-footer-spacer {
    display: none;
  }
}

/* Footer colored variants (apply to both icon-only and labeled) */
.modal-footer-btn--trash, .modal-footer-labeled-btn.modal-footer-btn--trash { color: #dc2626; }
.modal-footer-btn--trash:hover, .modal-footer-labeled-btn.modal-footer-btn--trash:hover { background: rgba(239, 68, 68, 0.1) !important; color: #b91c1c !important; }
html.dark .modal-footer-btn--trash, html.dark .modal-footer-labeled-btn.modal-footer-btn--trash { color: #fca5a5; }
html.dark .modal-footer-btn--trash:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--trash:hover { background: rgba(239, 68, 68, 0.22) !important; color: #fecaca !important; }

.modal-footer-btn--download, .modal-footer-labeled-btn.modal-footer-btn--download { color: #16a34a; }
.modal-footer-btn--download:hover, .modal-footer-labeled-btn.modal-footer-btn--download:hover { background: rgba(22, 163, 74, 0.1) !important; color: #15803d !important; }
html.dark .modal-footer-btn--download, html.dark .modal-footer-labeled-btn.modal-footer-btn--download { color: #86efac; }
html.dark .modal-footer-btn--download:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--download:hover { background: rgba(34, 197, 94, 0.2) !important; color: #bbf7d0 !important; }

.modal-footer-btn--archive, .modal-footer-labeled-btn.modal-footer-btn--archive { color: #a16207; }
.modal-footer-btn--archive:hover, .modal-footer-labeled-btn.modal-footer-btn--archive:hover { background: rgba(161, 98, 7, 0.1) !important; color: #854d0e !important; }
html.dark .modal-footer-btn--archive, html.dark .modal-footer-labeled-btn.modal-footer-btn--archive { color: #fcd34d; }
html.dark .modal-footer-btn--archive:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--archive:hover { background: rgba(251, 191, 36, 0.2) !important; color: #fde68a !important; }

.modal-footer-btn--collab, .modal-footer-labeled-btn.modal-footer-btn--collab { color: #7c3aed; }
.modal-footer-btn--collab:hover, .modal-footer-labeled-btn.modal-footer-btn--collab:hover { background: rgba(124, 58, 237, 0.1) !important; color: #6d28d9 !important; }
html.dark .modal-footer-btn--collab, html.dark .modal-footer-labeled-btn.modal-footer-btn--collab { color: #c4b5fd; }
html.dark .modal-footer-btn--collab:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--collab:hover { background: rgba(167, 139, 250, 0.2) !important; color: #ddd6fe !important; }

.modal-footer-btn--image, .modal-footer-labeled-btn.modal-footer-btn--image { color: #0284c7; }
.modal-footer-btn--image:hover, .modal-footer-labeled-btn.modal-footer-btn--image:hover { background: rgba(2, 132, 199, 0.1) !important; color: #0369a1 !important; }
html.dark .modal-footer-btn--image, html.dark .modal-footer-labeled-btn.modal-footer-btn--image { color: #7dd3fc; }
html.dark .modal-footer-btn--image:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--image:hover { background: rgba(56, 189, 248, 0.2) !important; color: #bae6fd !important; }

.modal-footer-btn--mode, .modal-footer-labeled-btn.modal-footer-btn--mode {
  background: linear-gradient(90deg, #6366f1 0%, #7c3aed 100%) !important;
  color: #fff !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35) !important;
}
.modal-footer-btn--mode:hover, .modal-footer-labeled-btn.modal-footer-btn--mode:hover {
  background: linear-gradient(90deg, #4f46e5 0%, #6d28d9 100%) !important;
  color: #fff !important;
  box-shadow: 0 8px 18px rgba(99, 102, 241, 0.45) !important;
}
html.dark .modal-footer-btn--mode, html.dark .modal-footer-labeled-btn.modal-footer-btn--mode {
  color: #fff !important;
}

/* Footer save checkmark states */
.modal-footer-btn--save-active {
  color: #fff !important;
  background: linear-gradient(90deg, #10b981 0%, #059669 100%) !important;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35) !important;
}
.modal-footer-btn--save-active:hover {
  background: linear-gradient(90deg, #059669 0%, #047857 100%) !important;
  box-shadow: 0 8px 18px rgba(16, 185, 129, 0.45) !important;
}
html.dark .modal-footer-btn--save-active { color: #fff !important; }
.modal-footer-btn--save-idle {
  color: rgba(16, 185, 129, 0.25) !important;
  border: 1.5px solid rgba(16, 185, 129, 0.15) !important;
  background: transparent !important;
}
html.dark .modal-footer-btn--save-idle {
  color: rgba(52, 211, 153, 0.2) !important;
  border-color: rgba(52, 211, 153, 0.1) !important;
}

/* Footer pin active state */
.modal-footer-btn--pin-active {
  background: #1e293b !important;
  color: #ffffff !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22) !important;
}
.modal-footer-btn--pin-active:hover {
  background: #0f172a !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3) !important;
}
.modal-footer-btn--pin-active svg { transform: none !important; }
html.dark .modal-footer-btn--pin-active {
  background: rgba(255, 255, 255, 0.16) !important;
  color: #ffffff !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(255, 255, 255, 0.2) !important;
}
html.dark .modal-footer-btn--pin-active:hover {
  background: rgba(255, 255, 255, 0.22) !important;
}

/* Copy buttons */
/* Hide scrollbars on mobile (keep scrolling) */
@media (max-width: 639px) {
  html, body {
    scrollbar-width: none;      /* Firefox */
    -ms-overflow-style: none;   /* IE/Edge legacy */
  }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    display: none;              /* Chrome/Safari/Brave */
  }
  .mobile-hide-scrollbar {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .mobile-hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
}

.note-content pre .code-copy-btn,
.code-block-wrapper .code-copy-btn {
  font-size: .75rem;
  padding: .2rem .45rem;
  border-radius: .35rem;
  background: var(--note-color, #111);
  color: #fff;
  border: none;
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 2;
  cursor: pointer;
}
.code-block-wrapper:hover .code-copy-btn {
  opacity: 1;
}
.code-block-wrapper .code-copy-btn:hover {
  opacity: 1;
  background: var(--note-color-opaque, #111);
}
html:not(.dark) .code-block-wrapper .code-copy-btn {
  color: rgba(0,0,0,0.75);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.inline-code-copy-btn {
  margin-left: 6px;
  font-size: .7rem;
  padding: .05rem .35rem;
  border-radius: .35rem;
  border: 1px solid var(--border-light);
  background: rgba(0,0,0,0.06);
}

.checklist-drag-clone {
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  border-radius: 8px;
  will-change: top;
}

/* Drag handle cursor – native OS move cursor */
.checklist-grab-handle { cursor: move; }
.checklist-grab-handle:active { cursor: move; }
.masonry-grid { display: flex; margin-left: -0.75rem; width: auto; }
.masonry-grid-column { padding-left: 0.75rem; background-clip: padding-box; }
.masonry-grid-column > div { margin-bottom: 0.75rem; }

/* === Scrollbars thématiques (indigo→violet, même thème que les boutons) === */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-button { display: none; height: 0; width: 0; }
::-webkit-scrollbar-track { background: #7547ee3d; }
::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #6366f1 0%, #7c3aed 100%); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #4f46e5 0%, #6d28d9 100%); }
/* Descendants of html.dark */
.dark ::-webkit-scrollbar-track { background: #1e1b4b !important; }
.dark ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #6366f1 0%, #7c3aed 100%) !important; }
.dark ::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #4f46e5 0%, #6d28d9 100%) !important; }
/* html element itself (main page scrollbar) */
html.dark::-webkit-scrollbar-track { background: #1e1b4b !important; }
html.dark::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #6366f1 0%, #7c3aed 100%) !important; border-radius: 10px; }
html.dark::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #4f46e5 0%, #6d28d9 100%) !important; }
/* Firefox fallback (no webkit support) */
@supports not selector(::-webkit-scrollbar) {
  * { scrollbar-width: thin; scrollbar-color: #6366f1 #7547ee3d; }
  .dark * { scrollbar-color: #6366f1 #1e1b4b; }
  html.dark { scrollbar-color: #6366f1 #1e1b4b; scrollbar-width: thin; }
}
/* Modal — scrollbar adaptée à la couleur de la note */
.modal-scroll-themed::-webkit-scrollbar-track { background: var(--sb-track); }
.modal-scroll-themed::-webkit-scrollbar-thumb { background: var(--sb-thumb); border-radius: 10px; }
.modal-scroll-themed::-webkit-scrollbar-thumb:hover { filter: brightness(1.15); }
/* Fallback si CSS vars non résolues sur webkit (Safari) */
html.dark .modal-scroll-themed::-webkit-scrollbar-track { background: var(--sb-track, #3b0764) !important; }
html.dark .modal-scroll-themed::-webkit-scrollbar-thumb { background: var(--sb-thumb, #7c3aed) !important; border-radius: 10px; }

/* clamp for text preview */
.line-clamp-6 {
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* scrim blur */
.modal-scrim {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* modal header blur */
.modal-header-blur {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Note modal enter / exit animations — only transform+opacity (GPU composited, no layout) */
@keyframes noteModalIn {
  from { opacity: 0; transform: scale(0.92) translateY(10px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);    }
}
@keyframes noteModalOut {
  from { opacity: 1; transform: scale(1)    translateY(0);   }
  to   { opacity: 0; transform: scale(0.97) translateY(6px); }
}
/* Mobile: full-screen modal → slide-up only, no scale (avoids jitter on small screens) */
@media (max-width: 639px) {
  @keyframes noteModalIn  { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes noteModalOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(14px); } }
}
@keyframes scrimFadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes scrimFadeOut { from { opacity: 1; } to { opacity: 0; } }
/* Intentionally NOT using "both" for the open animation — retaining the
   "transform: scale(1) translateY(0)" after the keyframes ends turns the
   modal card into a containing block, which in turn broke "position: sticky"
   (toolbar stops following scroll) and "position: fixed" (popovers landed
   in the middle of the modal). Ending the animation returns the card to
   its declared no-transform state, which is visually identical. */
.note-modal-anim         { animation: noteModalIn  200ms ease-out; }
.note-modal-anim.closing { animation: noteModalOut 180ms ease-in  both; }
.note-scrim-anim         { animation: scrimFadeIn  200ms ease-out both; }
.note-scrim-anim.closing { animation: scrimFadeOut 180ms ease-in  both; }

/* Smooth content fade when toggling view/edit mode */
@keyframes modalContentFade {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* No "both" — same reason as .note-modal-anim. Keeping a transform on an
   ancestor of the rich-text toolbar prevented position: sticky from binding
   to the real modal scroll container. */
.modal-content-fade { animation: modalContentFade 200ms ease-out; }

/* Smooth expand/collapse when entering/leaving draw canvas mode */
@media (min-width: 640px) {
  @keyframes drawExpand {
    from { transform: scale(0.72); border-radius: 12px; opacity: 0.8; }
    to   { transform: scale(1);    border-radius: 0;    opacity: 1; }
  }
  @keyframes drawCollapse {
    from { transform: scale(1.15); opacity: 0.7; }
    to   { transform: scale(1);    opacity: 1; }
  }
  .draw-expand   { animation: drawExpand   400ms cubic-bezier(.16,1,.3,1) both; }
  .draw-collapse { animation: drawCollapse 350ms cubic-bezier(.16,1,.3,1) both; }
}

/* Remove glass-card shadow on modal to avoid edge halos */
.note-modal-anim.glass-card {
  box-shadow: none !important;
}

/* Popover arrow — CSS-only via data-arrow attribute */
[data-arrow]::after {
  content: "";
  position: absolute;
  width: 12px;
  height: 12px;
  background: inherit;
  left: var(--arrow-left, 50%);
  transform: rotate(45deg);
  z-index: 1;
}
[data-arrow="up"]::after {
  top: -6px;
  border-left: 1px solid var(--border-light);
  border-top: 1px solid var(--border-light);
}
[data-arrow="down"]::after {
  bottom: -6px;
  border-right: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
}

/* formatting popover base */
.fmt-pop {
  border: 1px solid var(--border-light);
  border-radius: 0.75rem;
  box-shadow: 0 10px 30px rgba(0,0,0,.2);
  padding: .5rem;
}
.fmt-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: .35rem .5rem;
  border-radius: .5rem;
  font-size: .85rem;
}
@media (max-width: 639px) {
  .fmt-pop {
    position: fixed !important;
    left: 0.5rem !important;
    right: 0.5rem !important;
    bottom: 52px !important;
    top: auto !important;
    width: auto !important;
    border-radius: 1rem;
    padding: 0.6rem 0.5rem;
    backdrop-filter: blur(12px);
  }
  .fmt-pop::after {
    content: "";
    position: absolute;
    bottom: -6px;
    left: var(--fmt-arrow-left, 50%);
    width: 12px;
    height: 12px;
    background: inherit;
    border-right: 1px solid var(--border-light);
    border-bottom: 1px solid var(--border-light);
    transform: rotate(45deg);
  }
  .fmt-pop-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.3rem;
  }
  .fmt-pop-grid .fmt-sep {
    display: none;
  }
  .fmt-pop-grid .fmt-btn {
    width: 100%;
    justify-content: center;
    padding: 0.45rem 0;
    font-size: 0.9rem;
  }
}

/* Login decorative floating cards */
@keyframes fadeInDecoCards {
  to { opacity: 1; }
}
.floating-cards-bg {
  opacity: 0;
  animation: fadeInDecoCards 0.6s ease 0.3s forwards;
}
@keyframes floatCard {
  0%   { transform: translateY(0px) rotate(var(--rot)); }
  50%  { transform: translateY(-18px) rotate(var(--rot)); }
  100% { transform: translateY(0px) rotate(var(--rot)); }
}
.login-deco-card {
  position: absolute;
  pointer-events: none;
  background-color: var(--card-bg-light);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-light);
  border-radius: 0.75rem;
  padding: 1rem;
  opacity: 0.55;
  animation: floatCard var(--dur, 6s) ease-in-out infinite;
  animation-delay: var(--delay, 0s);
  will-change: transform;
  width: 160px;
}
@media (pointer: coarse) {
  .login-deco-card {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background-color: rgba(255,255,255,0.55);
  }
  html.dark .login-deco-card {
    background-color: rgba(30,30,40,0.65);
  }
  /* Disable expensive backdrop-filter on touch devices (tablets/phones) */
  .glass-card,
  .modal-scrim,
  .modal-header-blur {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  .glass-card {
    background-color: rgba(255, 255, 255, 0.92);
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.06);
  }
  html.dark .glass-card {
    background-color: rgba(40, 40, 40, 0.92);
  }
  .modal-scrim {
    background-color: rgba(0, 0, 0, 0.5);
  }
  .modal-header-blur {
    background-color: inherit;
  }
  header.glass-card {
    background: linear-gradient(
      90deg,
      rgba(99, 102, 241, 0.07) 0%,
      rgba(168, 85, 247, 0.07) 50%,
      rgba(236, 72, 153, 0.05) 100%
    ), rgba(255, 255, 255, 0.92);
  }
  html.dark header.glass-card {
    background: rgba(40, 40, 40, 0.92);
  }
}
@media (max-width: 639px) {
  /* Keep only left-edge (1-3) and right-edge (13-15) cards on mobile */
  .floating-cards-bg > .login-deco-card:nth-child(n+4) { display: none; }
  .floating-cards-bg > .login-deco-card:nth-child(13),
  .floating-cards-bg > .login-deco-card:nth-child(14),
  .floating-cards-bg > .login-deco-card:nth-child(15) { display: block; }
}
html.dark .login-deco-card {
  opacity: 0.35;
}
.login-deco-card .deco-title {
  height: 10px;
  border-radius: 4px;
  background: var(--text-light);
  opacity: 0.25;
  margin-bottom: 10px;
  width: 70%;
}
.login-deco-card .deco-line {
  height: 7px;
  border-radius: 4px;
  background: var(--text-light);
  opacity: 0.15;
  margin-bottom: 7px;
}

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
  --rt-btn-active-text: rgb(165, 180, 252);
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
  border-left: 3px solid rgba(var(--rt-accent), 0.45);
  padding: 0.15rem 0.85rem;
  margin: 0.4rem 0;
  color: inherit;
  opacity: 0.92;
  background: rgba(var(--rt-accent), 0.05);
  border-radius: 4px;
  /* Hug the content: a 1-word quote stays narrow, a multi-line one
     wraps inside the modal width. Only the highlighted "card" shrinks
     — vertical stacking with siblings is preserved. */
  width: fit-content;
  max-width: 100%;
}
html.dark .rt-editor-content blockquote,
html.dark .note-content--dense blockquote,
html.dark .note-content blockquote {
  background: rgba(var(--rt-accent), 0.08);
}
.rt-editor-content pre {
  background: rgba(0, 0, 0, 0.06);
  border-radius: 0.5rem;
  padding: 0.6rem 0.85rem;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  border: 1px solid var(--rt-divider);
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
     the toolbar, matching the reference screenshot. */
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
  padding: 4px 10px 6px;
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
.rt-btn--wide { min-width: 90px; justify-content: space-between; }
.rt-btn--narrow { min-width: 46px; justify-content: space-between; }
.rt-btn--chevron { min-width: 20px; padding: 0 3px; }
.rt-btn--swatch { padding: 0 6px; min-width: 34px; }
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
.rt-sg--style { gap: 3px; }
.rt-sg--style .rt-sg-row { gap: 3px; }

.rt-style-btn {
  min-width: 88px;
  height: 32px;
  padding: 0 10px;
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
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
.rt-style-btn--p  .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-p-size,  1rem)    * 0.82), 1rem);
  font-weight: var(--gk-type-p-weight, 400);
  color: var(--gk-type-p-color, inherit);
  font-style: var(--gk-type-p-italic, normal);
  text-decoration: var(--gk-type-p-underline, none);
}
.rt-style-btn--h1 .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-h1-size, 1.5rem)  * 0.82), 1.25rem);
  font-weight: var(--gk-type-h1-weight, 600);
  color: var(--gk-type-h1-color, inherit);
  font-style: var(--gk-type-h1-italic, normal);
  text-decoration: var(--gk-type-h1-underline, none);
}
.rt-style-btn--h2 .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-h2-size, 1.25rem) * 0.82), 1.12rem);
  font-weight: var(--gk-type-h2-weight, 600);
  color: var(--gk-type-h2-color, inherit);
  font-style: var(--gk-type-h2-italic, normal);
  text-decoration: var(--gk-type-h2-underline, none);
}
.rt-style-btn--h3 .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-h3-size, 1.125rem) * 0.82), 1rem);
  font-weight: var(--gk-type-h3-weight, 600);
  color: var(--gk-type-h3-color, inherit);
  font-style: var(--gk-type-h3-italic, normal);
  text-decoration: var(--gk-type-h3-underline, none);
}
.rt-style-btn--h4 .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-h4-size, 1rem)    * 0.82), 0.95rem);
  font-weight: var(--gk-type-h4-weight, 600);
  color: var(--gk-type-h4-color, inherit);
  font-style: var(--gk-type-h4-italic, normal);
  text-decoration: var(--gk-type-h4-underline, none);
}
.rt-style-btn--h5 .rt-style-btn-sample {
  font-size: min(calc(var(--gk-type-h5-size, 0.9rem)  * 0.82), 0.88rem);
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

/* ---------- Popovers ---------- */
.rt-pop-wrap { position: relative; display: inline-flex; }
.rt-pop {
  /* Fixed positioning: coordinates come from usePopoverPosition so the
     popover never extends the parent's scroll area (previously, opening a
     popover near the modal's right edge pushed a horizontal scrollbar). */
  position: fixed;
  z-index: 9999;
  min-width: 180px;
  padding: 8px;
  border-radius: 10px;
  background: var(--rt-pop-bg);
  border: 1px solid var(--rt-pop-border);
  box-shadow: var(--rt-pop-shadow);
  /* Fully opaque — no backdrop blur. Popovers now look like proper menus. */
  animation: rt-pop-in 0.12s ease-out;
}
@keyframes rt-pop-in {
  from { opacity: 0; transform: translateY(-2px); }
  to   { opacity: 1; transform: translateY(0); }
}
.rt-pop-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.65;
  margin-bottom: 4px;
}
.rt-pop-label--spaced { margin-top: 8px; }

.rt-pop--blocks, .rt-pop--font, .rt-pop--fontsize, .rt-pop--more {
  min-width: 180px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 260px;
  overflow-y: auto;
}

.rt-menu-item--action .rt-menu-item-icon,
.rt-menu-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
}
.rt-menu-item--action .rt-menu-item-icon svg,
.rt-menu-item-icon .tabler-icon,
.rt-menu-item-icon .tabler-icon svg { width: 18px; height: 18px; }
.rt-menu-item--action .rt-menu-item-label { flex: 1; font-weight: 500; font-size: 0.85rem; }

/* Menu rows (block types, fonts) */
.rt-menu-item, .rt-font-row, .rt-size-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font-size: 0.85rem;
}
.rt-menu-item:hover, .rt-font-row:hover, .rt-size-row:hover { background: var(--rt-btn-hover); }
.rt-menu-item.is-current, .rt-font-row.is-current, .rt-size-row.is-current {
  background: var(--rt-btn-active-bg);
  color: var(--rt-btn-active-text);
}
.rt-menu-item-sample {
  font-weight: 700;
  min-width: 28px;
  text-align: center;
}
.rt-menu-item--h1 .rt-menu-item-sample { font-size: 1.15rem; }
.rt-menu-item--h2 .rt-menu-item-sample { font-size: 1.05rem; }
.rt-menu-item--h3 .rt-menu-item-sample { font-size: 1rem; }
.rt-menu-item--p  .rt-menu-item-sample { font-weight: 500; opacity: 0.8; }
.rt-menu-item-label { flex: 1; font-weight: 500; }

/* Font-size popover — default row gets the ghost "Default" label after the
   number so the numeric size still reads cleanly. */
.rt-size-row { justify-content: space-between; }
.rt-size-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-width: 26px;
  text-align: right;
}
.rt-size-label {
  font-size: 0.72rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
}
/* "par défaut" badge on the 16-row — small chip on the right side so
   the list stays a single ordered sequence (12, 14, 16, 18 …) without a
   duplicated row at the top. */
.rt-size-default-badge {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.14);
  color: rgb(99, 102, 241);
  line-height: 1;
}
html.dark .rt-size-default-badge {
  background: rgba(129, 140, 248, 0.22);
  color: rgb(165, 180, 252);
}
.rt-size-row--is-default {
  font-weight: 700;
}

/* Colour popovers */
.rt-pop--color, .rt-pop--highlight, .rt-pop--underline { min-width: 208px; }
.rt-swatches {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 5px;
}
.rt-swatch {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  /* Inner ring keeps pale highlight swatches visible against the opaque
     popover background; outer border gives a clean outline. */
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.08);
  border: 0;
  cursor: pointer;
  padding: 0;
  transition: transform 0.08s ease, box-shadow 0.12s ease;
}
.rt-swatch:hover { transform: scale(1.1); }
.rt-swatch.is-current {
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.2),
    0 0 0 2px rgba(var(--rt-accent), 0.9);
}
html.dark .rt-swatch {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.12);
}
html.dark .rt-swatch.is-current {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.25),
    0 0 0 2px rgba(var(--rt-accent), 0.9);
}
.rt-pop-clear {
  margin-top: 8px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: transparent;
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  font-weight: 500;
}
.rt-pop-clear:hover { background: var(--rt-btn-hover); }
.rt-pop-clear--danger {
  margin-top: 6px;
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.28);
}
html.dark .rt-pop-clear--danger { color: #f87171; border-color: rgba(248, 113, 113, 0.32); }
.rt-pop-clear--danger:hover { background: rgba(220, 38, 38, 0.08); }

/* Underline variants popover */
.rt-ul-styles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.rt-ul-style {
  height: 36px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.95rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s;
}
.rt-ul-style:hover { background: var(--rt-btn-hover); }
.rt-ul-style.is-current {
  background: var(--rt-btn-active-bg);
  border-color: rgba(var(--rt-accent), 0.45);
  color: var(--rt-btn-active-text);
}

/* Link popover */
.rt-pop--link {
  min-width: 280px;
  padding: 10px;
}
.rt-link-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: transparent;
  color: inherit;
  font-size: 0.88rem;
  outline: none;
}
.rt-link-input:focus {
  border-color: rgba(var(--rt-accent), 0.5);
  box-shadow: 0 0 0 3px rgba(var(--rt-accent), 0.18);
}
.rt-link-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.rt-link-btn {
  flex: 0 0 auto;
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 500;
}
.rt-link-btn:hover { background: var(--rt-btn-hover); }
.rt-link-btn--primary {
  flex: 1 1 auto;
  background: rgb(var(--rt-accent));
  color: #fff;
  border-color: transparent;
}
.rt-link-btn--primary:hover { background: rgba(var(--rt-accent), 0.9); }
.rt-link-btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
.rt-link-btn--danger {
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.28);
}
html.dark .rt-link-btn--danger { color: #f87171; border-color: rgba(248, 113, 113, 0.32); }
.rt-link-btn--icon {
  width: 34px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.rt-link-btn--icon svg { width: 16px; height: 16px; }

/* ---------- Settings — typography preview grid ---------- */
.settings-type-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
}
/* Per-block card. Preview sits at the top, controls flow below in a
   flexible grid that wraps gracefully — settings panels are narrow
   (side sheet on desktop, full-width on mobile) so a single horizontal
   row of controls can't fit and would get cut off. */
.settings-type-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--rt-divider);
}
html.dark .settings-type-row { background: rgba(255, 255, 255, 0.04); }
.settings-type-preview {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 0;
  border-bottom: 1px dashed var(--rt-divider);
}
.settings-type-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: flex-end;
}
.settings-type-field {
  display: inline-flex;
  flex-direction: column;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.72;
  gap: 2px;
}
.settings-type-field-label { font-weight: 600; }
.settings-type-field select {
  height: 28px;
  padding: 0 6px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: rgba(255, 255, 255, 0.6);
  color: inherit;
  font-size: 0.85rem;
}
html.dark .settings-type-field select {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.12);
}

/* Colour swatches in the typography settings panel — one row per block.
   A "none" chip (diagonal slash) resets the colour to inherit. */
.settings-type-colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  max-width: 100%;
}
.settings-type-color {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  cursor: pointer;
  padding: 0;
  transition: transform 0.08s ease, box-shadow 0.12s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.settings-type-color:hover { transform: scale(1.12); }
.settings-type-color.is-current {
  box-shadow: 0 0 0 2px rgba(var(--rt-accent), 0.85);
  border-color: transparent;
}
html.dark .settings-type-color { border-color: rgba(255, 255, 255, 0.18); }
.settings-type-color--none {
  background: #ffffff;
  color: rgba(0, 0, 0, 0.35);
}
html.dark .settings-type-color--none {
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.4);
}

/* Italic / underline toggle pair — small pill buttons showing the style. */
.settings-type-field--inline .settings-type-field-label { margin-bottom: 2px; }
.settings-type-toggles { display: inline-flex; gap: 4px; }
.settings-type-toggle {
  width: 28px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid var(--rt-divider);
  background: rgba(255, 255, 255, 0.6);
  color: inherit;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
  font-family: Georgia, "Times New Roman", serif;
  padding: 0;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  text-transform: none;
  letter-spacing: 0;
}
.settings-type-toggle:hover { background: var(--rt-btn-hover); }
.settings-type-toggle.is-current {
  background: var(--rt-btn-active-bg);
  color: var(--rt-btn-active-text);
  border-color: rgba(var(--rt-accent), 0.45);
}
html.dark .settings-type-toggle {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.12);
}

/* ================================================================
   Typography customisation modal — dedicated full-viewport surface
   for size / weight / colour / italic / underline per block type.
   ================================================================ */
.typo-modal-scrim {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(17, 24, 39, 0.48);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.typo-modal-scrim--dark { background: rgba(0, 0, 0, 0.62); }

.typo-modal {
  width: min(820px, 100%);
  max-height: min(92vh, 960px);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 16px 44px -6px rgba(17, 24, 39, 0.35), 0 4px 12px rgba(17, 24, 39, 0.12);
  overflow: hidden;
  color: inherit;
}
html.dark .typo-modal {
  background: #1f2937;
  box-shadow: 0 16px 44px -6px rgba(0, 0, 0, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5);
}

.typo-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--rt-divider);
}
.typo-modal-header-main {
  min-width: 0;
  flex: 1 1 auto;
}
.typo-modal-title {
  font-size: 1.05rem;
  font-weight: 700;
}
.typo-modal-desc {
  font-size: 0.85rem;
  opacity: 0.7;
  margin-top: 2px;
  line-height: 1.35;
}

/* Profile tabs — segmented control under the title so the user can
   switch which profile they're editing without leaving the modal. */
.typo-modal-profiles {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  padding: 3px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  border: 1px solid var(--rt-divider);
}
html.dark .typo-modal-profiles {
  background: rgba(255, 255, 255, 0.06);
}
.typo-modal-profile {
  padding: 5px 12px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, transform 0.08s ease;
}
.typo-modal-profile:hover:not(.is-active) {
  background: var(--rt-btn-hover);
}
.typo-modal-profile.is-active {
  background: #ffffff;
  color: rgb(var(--rt-accent));
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(17, 24, 39, 0.12);
}
html.dark .typo-modal-profile.is-active {
  background: rgba(99, 102, 241, 0.22);
  color: rgb(196, 181, 253);
  box-shadow: none;
}

.typo-modal-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.typo-modal-reset {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: transparent;
  color: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
}
.typo-modal-reset:hover { background: var(--rt-btn-hover); }
.typo-modal-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.typo-modal-close:hover { background: var(--rt-btn-hover); }

.typo-modal-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 14px 16px 18px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.typo-modal-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 16px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--rt-divider);
}
html.dark .typo-modal-card { background: rgba(255, 255, 255, 0.04); }

.typo-modal-card-preview {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 0 6px;
  border-bottom: 1px dashed var(--rt-divider);
}
.typo-modal-card-hint {
  font-size: 0.72rem;
  opacity: 0.6;
  line-height: 1.3;
}

.typo-modal-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}
.typo-modal-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.75;
}
.typo-modal-field--wide { grid-column: 1 / -1; }
.typo-modal-field-label { font-weight: 600; }
.typo-modal-field select {
  height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: rgba(255, 255, 255, 0.6);
  color: inherit;
  font-size: 0.85rem;
  text-transform: none;
  letter-spacing: 0;
}
html.dark .typo-modal-field select {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.12);
}

.typo-modal-colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.typo-modal-color {
  width: 24px;
  height: 24px;
  border-radius: 5px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  cursor: pointer;
  padding: 0;
  transition: transform 0.08s ease, box-shadow 0.12s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.typo-modal-color:hover { transform: scale(1.1); }
.typo-modal-color.is-current {
  box-shadow: 0 0 0 2px rgba(var(--rt-accent), 0.85);
  border-color: transparent;
}
html.dark .typo-modal-color { border-color: rgba(255, 255, 255, 0.18); }
.typo-modal-color--none {
  background: #ffffff;
  color: rgba(0, 0, 0, 0.4);
}
html.dark .typo-modal-color--none {
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.5);
}
.typo-modal-color-custom {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px dashed var(--rt-divider);
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  background: linear-gradient(135deg, #ef4444, #eab308, #22c55e, #0ea5e9, #a855f7);
}
.typo-modal-color-custom input[type="color"] {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  opacity: 0;
}

.typo-modal-toggles { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.typo-modal-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--rt-divider);
  background: rgba(255, 255, 255, 0.55);
  color: inherit;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}
.typo-modal-toggle:hover { background: var(--rt-btn-hover); }
.typo-modal-toggle.is-current {
  background: var(--rt-btn-active-bg);
  color: var(--rt-btn-active-text);
  border-color: rgba(var(--rt-accent), 0.45);
}
html.dark .typo-modal-toggle {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.12);
}
.typo-modal-toggle-sample {
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1;
  min-width: 14px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
/* Tabler icons used inside the italic / underline toggles — same look
   as the note-modal toolbar for visual consistency. */
.typo-modal-toggle-sample .tabler-icon { width: 18px; height: 18px; }
.typo-modal-toggle-sample .tabler-icon svg { width: 18px; height: 18px; }
.typo-modal-toggle-label { font-size: 0.78rem; font-weight: 500; }

@media (max-width: 560px) {
  .typo-modal { max-height: 100vh; border-radius: 0; }
  .typo-modal-scrim { padding: 0; }
  .typo-modal-body {
    grid-template-columns: 1fr;
    padding: 12px 12px 16px;
  }
}

/* Mobile squeeze: the toolbar stays on one or two lines and each row uses
   the horizontal scroll container instead of wrapping aggressively on tiny
   screens. Groups stay grouped visually via the separators. */
@media (max-width: 640px) {
  .rt-toolbar {
    flex-wrap: wrap;
    padding: 4px 6px 6px;
    margin: 2px 6px 6px;
    row-gap: 4px;
  }
  /* Touch-friendly minimum size on mobile, matching the enlarged desktop
     density. */
  .rt-btn { min-width: 36px; height: 36px; padding: 0 7px; }
  .rt-btn--wide { min-width: 80px; }
  .rt-btn--block { min-width: 50px; }
  .rt-btn svg { width: 20px; height: 20px; }
  .rt-pop { min-width: 220px; }
  .rt-sep { margin: 0 4px; height: 26px; }
  .rt-style-btn { min-width: 76px; height: 34px; padding: 0 8px; }
}

/* Read-only note-content renderings (cards + modal view) should ALSO honour
   typography presets AND the per-block indent marker so edit↔view stays
   visually identical even before the user edits a legacy note. */
.note-content [data-indent],
.rt-editor-content [data-indent] {
  /* Inline style handles the actual margin; this hook just lets us attach
     responsive overrides if ever needed. */
}
`;
