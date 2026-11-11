// The files attached to a note, in the note modal and on its card.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const attachmentsCSS = `
/* Rows sit on the note's own colour: their surface is a shade of it, not a
   colour of their own, so they hold on every note colour and in both modes. */
.gk-attachments {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: 8px;
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
}
.gk-attachment {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.035);
  transition: background-color 0.12s ease;
}
html.dark .gk-attachment { background: rgba(255, 255, 255, 0.06); }
.gk-attachment[data-failed] { border-color: rgba(220, 38, 38, 0.55); }
@media (hover: hover) {
  .gk-attachment:hover { background: rgba(0, 0, 0, 0.065); }
  html.dark .gk-attachment:hover { background: rgba(255, 255, 255, 0.1); }
}
.gk-attachment-main {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 7px 4px 7px 7px;
  border-radius: 11px;
  text-align: left;
  color: inherit;
}
button.gk-attachment-main { cursor: pointer; }
button.gk-attachment-main:active { opacity: 0.7; }
button.gk-attachment-main:focus-visible,
.gk-attachment-btn:focus-visible {
  outline: 2px solid var(--note-color, #6366f1);
  outline-offset: -2px;
}
.gk-attachment-thumb,
.gk-attachment-tile {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 8px;
}
.gk-attachment-thumb { object-fit: cover; }
/* A tile can share its colour with the note. */
html.dark .gk-attachment-thumb,
html.dark .gk-attachment-tile { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22); }
.gk-attachment-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #64748b;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.gk-attachment-tile[data-family="pdf"] { background: #dc2626; }
.gk-attachment-tile[data-family="doc"] { background: #2563eb; }
.gk-attachment-tile[data-family="sheet"] { background: #059669; }
.gk-attachment-tile[data-family="slides"] { background: #ea580c; }
.gk-attachment-tile[data-family="archive"] { background: #b45309; }
.gk-attachment-tile[data-family="audio"] { background: #7c3aed; }
.gk-attachment-tile[data-family="video"] { background: #db2777; }
.gk-attachment-tile[data-family="image"] { background: #0891b2; }
.gk-attachment-tile[data-family="code"] { background: #4f46e5; }
.gk-attachment-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.gk-attachment-name {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gk-attachment-meta {
  overflow: hidden;
  font-size: 12px;
  opacity: 0.68;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gk-attachment[data-failed] .gk-attachment-meta { color: #dc2626; opacity: 1; }
html.dark .gk-attachment[data-failed] .gk-attachment-meta { color: #f87171; }
.gk-attachment-btn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 40px;
  border-radius: 10px;
  color: inherit;
  opacity: 0.68;
  cursor: pointer;
  transition: opacity 0.12s ease, background-color 0.12s ease;
}
.gk-attachment-btn:last-of-type { margin-right: 3px; }
.gk-attachment-btn .tabler-icon { width: 20px; height: 20px; }
.gk-attachment-btn:active { background-color: rgba(0, 0, 0, 0.1); }
html.dark .gk-attachment-btn:active { background-color: rgba(255, 255, 255, 0.14); }
@media (hover: hover) {
  .gk-attachment-btn:hover { opacity: 1; background-color: rgba(0, 0, 0, 0.07); }
  html.dark .gk-attachment-btn:hover { background-color: rgba(255, 255, 255, 0.12); }
  .gk-attachment-btn--danger:hover { color: #dc2626; }
  html.dark .gk-attachment-btn--danger:hover { color: #f87171; }
}
.gk-attachment-progress {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 3px;
  background: var(--note-color-opaque, #6366f1);
  transform-origin: left;
  transition: transform 0.2s linear;
}
@media (max-width: 639px) {
  .gk-attachment-btn { width: 40px; height: 44px; }
  .gk-attachment-thumb, .gk-attachment-tile { width: 44px; height: 44px; }
}

/* Files dragged over an open note. */
.gk-attachment-drop {
  position: absolute;
  inset: 8px;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 2px dashed currentColor;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: 600;
  pointer-events: none;
}
.gk-attachment-drop .tabler-icon { width: 24px; height: 24px; }

/* Number of files on a closed note. */
.gk-card-attachments {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.72;
}
.gk-card-attachments .tabler-icon { width: 15px; height: 15px; }
`;
