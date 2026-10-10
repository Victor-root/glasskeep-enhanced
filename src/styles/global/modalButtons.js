// Note modal icon buttons: pill container, save / pin / close states and
// coloured variants.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const modalButtonsCSS = `
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

/* AI toggle button — indigo-500 in light mode, indigo-300 in dark mode
   (brighter than 400 to stay readable on dark note backgrounds like
   dark-blue rgba(35,72,165) and dark-purple rgba(82,38,140)).
   Drop-shadow adds micro-contrast on tricky note colors (light purple,
   blue, mauve) where the indigo hue can blend with the background. */
.modal-icon-btn--ai {
  color: rgb(99, 102, 241) !important;
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.18));
}
html.dark .modal-icon-btn--ai {
  color: rgb(165, 180, 252) !important;
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.45));
}
.note-ai-panel-icon {
  color: rgb(99, 102, 241) !important;
}
html.dark .note-ai-panel-icon {
  color: rgb(165, 180, 252) !important;
}

.modal-icon-btn--mode {
  background: linear-gradient(90deg, #6366f1 0%, #7c3aed 100%) !important;
  color: #fff !important;
  /* Halo on hover only. */
  box-shadow: none !important;
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
  /* Halo on hover only. */
  box-shadow: none !important;
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
`;
