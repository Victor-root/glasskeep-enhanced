// TV mode: fullscreen note detail: drawing, text body and checklist.
// Part of the TV stylesheet, assembled in order by ../tvStyles.js.

export const tvNoteDetailCSS = `
/* Drawing in the fullscreen detail viewer. Full available width,
   capped height so very tall drawings stay scrollable instead of
   eating the whole vertical space. */
html[data-tv="1"] .tv-detail__draw {
  margin: 10px 0 6px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
}
html[data-tv="1"] .tv-detail__draw > div {
  width: 100% !important;
  max-width: 1400px;
  margin: 0 auto;
}
html[data-tv="1"] .tv-detail__draw img {
  display: block;
  width: 100% !important;
  height: auto !important;
  max-height: 72vh;
  object-fit: contain;
}

/* ------- Note detail (FULLSCREEN) ------- */
html[data-tv="1"] .tv-detail {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  /* No padding around the card — true fullscreen viewer. */
  padding: 0;
  background: #0b0d12;
  animation: tv-detail-in 160ms ease-out;
}
@keyframes tv-detail-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
html[data-tv="1"] .tv-detail__card {
  width: 100%;
  max-width: none;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: none;
  min-height: 0;
}
html[data-tv="1"] .tv-detail__header {
  display: flex;
  align-items: center;
  gap: 14px;
  /* Keep the header dense — same vertical rhythm as before, no taller. */
  padding: calc(var(--tv-safe-y) * 0.5) calc(var(--tv-safe-x) * 1.4) 4px;
  flex-wrap: nowrap;
}
html[data-tv="1"] .tv-detail__title {
  font-size: 24px;
  font-weight: 800;
  line-height: 1.15;
  word-break: break-word;
  flex: 1 1 auto;
  min-width: 0;
}
html[data-tv="1"] .tv-detail__meta {
  font-size: 12px;
  opacity: 0.65;
  flex-shrink: 0;
}
html[data-tv="1"] .tv-detail__close {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: inherit;
}
html[data-tv="1"] .tv-detail__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 8px calc(var(--tv-safe-x) * 1.4) var(--tv-safe-y);
  font-size: 17px;
  line-height: 1.6;
}
html[data-tv="1"] .tv-detail__body * { max-width: 100%; word-break: break-word; }
html[data-tv="1"] .tv-detail__body h1 { font-size: 26px; font-weight: 800; margin: 18px 0 8px; }
html[data-tv="1"] .tv-detail__body h2 { font-size: 22px; font-weight: 700; margin: 16px 0 8px; }
html[data-tv="1"] .tv-detail__body h3 { font-size: 19px; font-weight: 700; margin: 14px 0 6px; }
html[data-tv="1"] .tv-detail__body p { margin: 0 0 8px; }
html[data-tv="1"] .tv-detail__body ul,
html[data-tv="1"] .tv-detail__body ol { padding-left: 1.4em; margin: 0 0 10px; }
html[data-tv="1"] .tv-detail__body li { margin-bottom: 4px; }
html[data-tv="1"] .tv-detail__body blockquote {
  border-left: 3px solid currentColor;
  padding: 4px 14px;
  margin: 10px 0;
  opacity: 0.85;
  font-style: italic;
}
html[data-tv="1"] .tv-detail__body code {
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 15px;
}
html[data-tv="1"] .tv-detail__body pre {
  background: rgba(0, 0, 0, 0.45);
  padding: 14px 18px;
  border-radius: 10px;
  font-size: 14px;
  /* Long lines wrap — better than horizontal scroll on a TV. */
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  margin: 10px 0;
}
html[data-tv="1"] .tv-detail__body pre code {
  white-space: inherit;
  word-break: inherit;
}
html[data-tv="1"] .tv-detail__body hr {
  border: none;
  border-top: 1px solid currentColor;
  opacity: 0.18;
  margin: 12px 0;
}
html[data-tv="1"] .tv-detail__body img {
  max-width: 100%;
  border-radius: 10px;
  margin: 10px 0;
}

/* Checklist body inside detail */
html[data-tv="1"] .tv-checklist {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
html[data-tv="1"] .tv-checklist__section-title {
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 10px 0 2px;
  opacity: 0.85;
}
html[data-tv="1"] .tv-checklist__item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 7px 11px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}
html[data-tv="1"] .tv-checklist__item--done { opacity: 0.45; text-decoration: line-through; }
html[data-tv="1"] .tv-checklist__item--indent { margin-left: 32px; }
html[data-tv="1"] .tv-checklist__box {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 5px;
  border: 2px solid currentColor;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 12px;
  margin-top: 2px;
}
html[data-tv="1"] .tv-checklist__item--done .tv-checklist__box { background: currentColor; color: rgba(255, 255, 255, 0.95); }
`;
