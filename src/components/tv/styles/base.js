// TV mode: root tokens, the light-theme root and the focus ring.
// Part of the TV stylesheet, assembled in order by ../tvStyles.js.

export const tvBaseCSS = `
/* ------- Root ------- */
:root {
  /* Header sits at 3vh from the top — most TVs only overscan 2-3%
     vertically and the previous 5.5vh was leaving a visible gap. */
  --tv-safe-x: 2vw;
  --tv-safe-y: 3vh;
  --tv-focus-pad: 14px;
  --tv-gap: 14px;
}
html[data-tv="1"], html[data-tv="1"] body {
  background: #0b0d12 !important;
  color: #e5e7eb;
  font-size: 16px;
  line-height: 1.45;
  overflow: hidden !important;
  height: 100vh;
  width: 100vw;
  margin: 0;
  box-sizing: border-box;
}
html[data-tv="1"] body {
  background: radial-gradient(circle at 20% 0%, #1a1530 0%, #0b0d12 55%, #06070b 100%) !important;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
/* Light theme override — flipped via data-tv-theme on <html>. */
html[data-tv="1"][data-tv-theme="light"], html[data-tv="1"][data-tv-theme="light"] body {
  background: #f3f4f6 !important;
  color: #1f2937;
}
html[data-tv="1"][data-tv-theme="light"] body {
  background: radial-gradient(circle at 20% 0%, #ede9fe 0%, #f3f4f6 55%, #e5e7eb 100%) !important;
}
html[data-tv="1"] *, html[data-tv="1"] *::before, html[data-tv="1"] *::after {
  box-sizing: border-box;
}
html[data-tv="1"] *::-webkit-scrollbar { width: 0; height: 0; display: none; }
html[data-tv="1"] * { scrollbar-width: none; }
html[data-tv="1"] { user-select: none; -webkit-user-select: none; }
html[data-tv="1"] .tv-allow-select { user-select: text; -webkit-user-select: text; }

/* ------- Focus ring -------
   Single box-shadow (was 3 stacked) and no transform on the cards
   themselves; older Shields stutter when 100+ cards each have to
   interpolate a multi-shadow + scale. We rely on a sharp violet
   outline ring instead, which is one GPU layer per focused element. */
html[data-tv="1"] *:focus { outline: none; }
html[data-tv="1"] .tv-focusable {
  position: relative;
  transition: box-shadow 90ms ease;
  cursor: default;
}
html[data-tv="1"] .tv-focusable:focus,
html[data-tv="1"] .tv-focusable[data-tv-focused="true"] {
  box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.95);
  z-index: 50;
}
html[data-tv="1"] .tv-focusable.tv-focusable--flat:focus,
html[data-tv="1"] .tv-focusable.tv-focusable--flat[data-tv-focused="true"] {
  box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.95);
}
`;
