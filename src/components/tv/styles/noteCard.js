// TV mode: closed note card and its drawing thumbnail.
// Part of the TV stylesheet, assembled in order by ../tvStyles.js.

export const tvNoteCardCSS = `
/* ------- Note card (closed) ------- */
html[data-tv="1"] .tv-card {
  border-radius: 14px;
  padding: 16px 16px 14px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: #111827;
  border: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
  overflow: hidden;
  text-align: left;
  scroll-margin: 40px 24px 60px 24px;
}
html[data-tv="1"] .tv-card__title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4 !important;
  margin: 0 !important;
  word-break: break-word;
  /* flex-shrink: 0 so the flex algorithm doesn't squeeze the title
     between its min and max heights — the preview yields space
     instead via its own min-height: 0 + flex: 1 1 auto. */
  flex-shrink: 0 !important;
  display: block !important;
  min-height: 1.4em !important;
  /* No max-height in the grid view: long titles let the card grow
     naturally in the masonry layout. The pager's fixed-row layout
     re-applies a max-height of its own (see below). */
  height: auto !important;
  overflow: visible !important;
}
/* Pager cards live in a fixed-height row, so the title MUST cap at
   two lines there — otherwise a long title would push the preview
   and footer past the viewport. */
html[data-tv="1"] .tv-pager .tv-card__title {
  font-size: 22px;
  max-height: 2.8em !important;
  overflow: hidden !important;
}
html[data-tv="1"] .tv-card__preview {
  font-size: 14px;
  line-height: 1.45;
  max-height: 12em;
  overflow: hidden;
  opacity: 0.92;
  word-break: break-word;
  /* No mask-image fade — running a GPU-composited mask on every card
     in a 100+ note grid was a measurable Shield bottleneck. Clean cut
     via overflow:hidden is fast and just as readable. */
}
html[data-tv="1"] .tv-card__preview > * { margin: 0 0 0.4em !important; }
html[data-tv="1"] .tv-card__preview > *:last-child { margin-bottom: 0 !important; }
html[data-tv="1"] .tv-card__preview h1,
html[data-tv="1"] .tv-card__preview h2,
html[data-tv="1"] .tv-card__preview h3 {
  font-weight: 700 !important;
  font-size: 14.5px !important;
  margin: 0.2em 0 0.4em !important;
}
html[data-tv="1"] .tv-card__preview ul,
html[data-tv="1"] .tv-card__preview ol { padding-left: 1.15em !important; }
html[data-tv="1"] .tv-card__preview pre {
  display: block;
  font-family: 'Fira Code', 'JetBrains Mono', monospace !important;
  font-size: 13px !important;
  background: rgba(0, 0, 0, 0.18) !important;
  padding: 6px 9px !important;
  border-radius: 6px !important;
  margin: 5px 0 !important;
  /* Wrap long lines so the preview doesn't silently clip them. */
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
  max-height: 7em;
}
html[data-tv="1"] .tv-card__preview code {
  font-family: 'Fira Code', 'JetBrains Mono', monospace !important;
  font-size: 13px !important;
  background: rgba(0, 0, 0, 0.18) !important;
  padding: 1px 5px !important;
  border-radius: 4px !important;
}
html[data-tv="1"] .tv-card__preview pre code {
  padding: 0 !important;
  background: transparent !important;
}
html[data-tv="1"] .tv-card__preview hr {
  border: none;
  border-top: 1px solid currentColor;
  opacity: 0.18;
  margin: 7px 0 !important;
}
html[data-tv="1"] .tv-card__preview blockquote {
  border-left: 2px solid currentColor;
  padding: 2px 9px;
  opacity: 0.75;
  margin: 5px 0 !important;
}
html[data-tv="1"] .tv-card__preview img {
  max-width: 100%;
  border-radius: 6px;
  margin: 4px 0 !important;
}
html[data-tv="1"] .tv-card--dark { color: #f3f4f6; }
html[data-tv="1"] .tv-card__footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11.5px;
  opacity: 0.7;
  margin-top: 6px;
}
html[data-tv="1"] .tv-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.18);
  font-size: 11.5px;
  font-weight: 600;
}
html[data-tv="1"] .tv-card--dark .tv-card__badge { background: rgba(255, 255, 255, 0.14); }
html[data-tv="1"] .tv-card__images {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
  margin-bottom: 4px;
}
html[data-tv="1"] .tv-card__images--multi { grid-template-columns: 1fr 1fr; }
html[data-tv="1"] .tv-card__images img {
  width: 100%;
  height: 80px;
  /* 'contain' (not 'cover') matches the phone / desktop closed cards:
     show the whole image with letterboxing rather than cropping the
     left & right edges. Cover was making landscape screenshots
     unrecognisable on TV. */
  object-fit: contain;
  border-radius: 7px;
  background: rgba(0,0,0,0.15);
}
html[data-tv="1"] .tv-carousel .tv-card__images img {
  object-fit: contain;
}

/* Drawing thumbnail on the closed card. DrawingPreview's inner wrapper
   uses Tailwind's w-[90%]; we strip the side margin in TV cards so the
   image fills the card width (the card already pads internally). */
html[data-tv="1"] .tv-card__draw {
  margin: 4px 0 2px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.15);
}
html[data-tv="1"] .tv-card__draw > div {
  width: 100% !important;
}
html[data-tv="1"] .tv-card__draw img {
  display: block;
  width: 100% !important;
  height: auto !important;
}
`;
