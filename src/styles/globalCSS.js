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
body {
  background: linear-gradient(135deg, #f0e8ff 0%, #e8f4fd 50%, #fde8f0 100%);
  background-attachment: fixed;
  color: var(--text-light);
  transition: background 0.3s ease, color 0.3s ease;
}
html.dark body {
  background: var(--bg-dark);
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
.note-content p { margin-bottom: 0.5rem; }
.note-content h1, .note-content h2, .note-content h3 { margin-bottom: 0.75rem; font-weight: 600; }
.note-content h1 { font-size: 1.5rem; line-height: 1.3; }
.note-content h2 { font-size: 1.25rem; line-height: 1.35; }
.note-content h3 { font-size: 1.125rem; line-height: 1.4; }

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
.note-content--dense li { margin: 0; padding: 0; line-height: 1.15; }
.note-content--dense li > p { margin: 0; }
.note-content--dense li ul, .note-content--dense li ol { margin: 0.1rem 0 0 1.1rem; padding-left: 1.1rem; }

/* Hyperlinks in view mode */
.note-content a {
  color: #2563eb;
  text-decoration: underline;
}
.note-card .note-content a {
  pointer-events: none;
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
  color: rgba(52, 211, 153, 0.2) !important;
  border-color: rgba(52, 211, 153, 0.1) !important;
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
  color: rgba(255, 255, 255, 0.6);
}
html.dark .modal-footer-btn:hover,
html.dark .modal-footer-labeled-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.95);
}

/* Responsive: collapse labels to icon-only below 1024px, distribute evenly */
@media (max-width: 1023px) {
  .modal-footer-labeled-btn {
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
    justify-content: center;
    gap: 0;
  }
  .modal-footer-labeled-btn > span {
    display: none;
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
html.dark .modal-footer-btn--trash, html.dark .modal-footer-labeled-btn.modal-footer-btn--trash { color: #f87171; }
html.dark .modal-footer-btn--trash:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--trash:hover { background: rgba(239, 68, 68, 0.18) !important; color: #fca5a5 !important; }

.modal-footer-btn--download, .modal-footer-labeled-btn.modal-footer-btn--download { color: #16a34a; }
.modal-footer-btn--download:hover, .modal-footer-labeled-btn.modal-footer-btn--download:hover { background: rgba(22, 163, 74, 0.1) !important; color: #15803d !important; }
html.dark .modal-footer-btn--download, html.dark .modal-footer-labeled-btn.modal-footer-btn--download { color: #4ade80; }
html.dark .modal-footer-btn--download:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--download:hover { background: rgba(34, 197, 94, 0.15) !important; color: #86efac !important; }

.modal-footer-btn--archive, .modal-footer-labeled-btn.modal-footer-btn--archive { color: #a16207; }
.modal-footer-btn--archive:hover, .modal-footer-labeled-btn.modal-footer-btn--archive:hover { background: rgba(161, 98, 7, 0.1) !important; color: #854d0e !important; }
html.dark .modal-footer-btn--archive, html.dark .modal-footer-labeled-btn.modal-footer-btn--archive { color: #fbbf24; }
html.dark .modal-footer-btn--archive:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--archive:hover { background: rgba(251, 191, 36, 0.15) !important; color: #fcd34d !important; }

.modal-footer-btn--collab, .modal-footer-labeled-btn.modal-footer-btn--collab { color: #7c3aed; }
.modal-footer-btn--collab:hover, .modal-footer-labeled-btn.modal-footer-btn--collab:hover { background: rgba(124, 58, 237, 0.1) !important; color: #6d28d9 !important; }
html.dark .modal-footer-btn--collab, html.dark .modal-footer-labeled-btn.modal-footer-btn--collab { color: #a78bfa; }
html.dark .modal-footer-btn--collab:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--collab:hover { background: rgba(167, 139, 250, 0.15) !important; color: #c4b5fd !important; }

.modal-footer-btn--image, .modal-footer-labeled-btn.modal-footer-btn--image { color: #0284c7; }
.modal-footer-btn--image:hover, .modal-footer-labeled-btn.modal-footer-btn--image:hover { background: rgba(2, 132, 199, 0.1) !important; color: #0369a1 !important; }
html.dark .modal-footer-btn--image, html.dark .modal-footer-labeled-btn.modal-footer-btn--image { color: #38bdf8; }
html.dark .modal-footer-btn--image:hover, html.dark .modal-footer-labeled-btn.modal-footer-btn--image:hover { background: rgba(56, 189, 248, 0.15) !important; color: #7dd3fc !important; }

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

/* === Scrollbars thématiques === */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-button { display: none; height: 0; width: 0; }
::-webkit-scrollbar-track { background: #e3d0ff; }
::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #c4b5fd 0%, #7c3aed 100%); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #ddd6fe 0%, #6d28d9 100%); }
* { scrollbar-width: thin; scrollbar-color: #a78bfa #e3d0ff; }
.dark * { scrollbar-color: #7c3aed #3b0764; }
html.dark { scrollbar-color: #7c3aed #3b0764; scrollbar-width: thin; }
/* Descendants of html.dark */
.dark ::-webkit-scrollbar-track { background: #3b0764 !important; }
.dark ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #7c3aed 0%, #4c1d95 100%) !important; }
.dark ::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #8b5cf6 0%, #5b21b6 100%) !important; }
/* html element itself (main page scrollbar) */
html.dark::-webkit-scrollbar-track { background: #3b0764 !important; }
html.dark::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #7c3aed 0%, #4c1d95 100%) !important; border-radius: 10px; }
html.dark::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #8b5cf6 0%, #5b21b6 100%) !important; }
/* Modal — scrollbar adaptée à la couleur de la note */
.modal-scroll-themed::-webkit-scrollbar-track { background: var(--sb-track); }
.modal-scroll-themed::-webkit-scrollbar-thumb { background: var(--sb-thumb); border-radius: 10px; }
.modal-scroll-themed::-webkit-scrollbar-thumb:hover { filter: brightness(1.15); }
/* Fallback si CSS vars non résolues sur webkit (Safari) */
html.dark .modal-scroll-themed::-webkit-scrollbar-track { background: var(--sb-track, #3b0764); }
html.dark .modal-scroll-themed::-webkit-scrollbar-thumb { background: var(--sb-thumb, #7c3aed); border-radius: 10px; }

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
  from { opacity: 0; transform: scale(0.97) translateY(6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);   }
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
.note-modal-anim         { animation: noteModalIn  200ms ease-out both; }
.note-modal-anim.closing { animation: noteModalOut 180ms ease-in  both; }
.note-scrim-anim         { animation: scrimFadeIn  200ms ease-out both; }
.note-scrim-anim.closing { animation: scrimFadeOut 180ms ease-in  both; }

/* Remove glass-card shadow & backdrop-filter on modal to avoid edge halos */
.note-modal-anim.glass-card {
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: none !important;
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

/* Login decorative floating cards */
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
`;
