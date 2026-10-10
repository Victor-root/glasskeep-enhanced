// TV mode: light theme overrides (html[data-tv-theme="light"]).
// Part of the TV stylesheet, assembled in order by ../tvStyles.js.

export const tvLightThemeCSS = `
/* ===== LIGHT THEME OVERRIDES =====
   Everything below only fires when html[data-tv-theme="light"]. The
   dark palette above is the default. */
html[data-tv="1"][data-tv-theme="light"] .tv-header__hamburger,
html[data-tv="1"][data-tv-theme="light"] .tv-header__viewtoggle,
html[data-tv="1"][data-tv-theme="light"] .tv-header__themetoggle {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
  color: #1f2937;
}
html[data-tv="1"][data-tv-theme="light"] .tv-header__subtitle { color: #4b5563; }
html[data-tv="1"][data-tv-theme="light"] .tv-header__user {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
  color: #1f2937;
}
html[data-tv="1"][data-tv-theme="light"] .tv-header__count {
  color: #5b21b6;
  background: rgba(167, 139, 250, 0.18);
  border-color: rgba(124, 58, 237, 0.35);
}
html[data-tv="1"][data-tv-theme="light"] .tv-sidebar__group-label { color: #6b7280; }
html[data-tv="1"][data-tv-theme="light"] .tv-sidebar__item {
  background: rgba(255, 255, 255, 0.7);
  border-color: rgba(0, 0, 0, 0.06);
  color: #1f2937;
}
html[data-tv="1"][data-tv-theme="light"] .tv-sidebar__item[data-active="true"] {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.18), rgba(124, 58, 237, 0.12));
  border-color: rgba(124, 58, 237, 0.45);
  color: #4c1d95;
}
html[data-tv="1"][data-tv-theme="light"] .tv-sidebar__item-count {
  color: #4b5563;
  background: rgba(0, 0, 0, 0.05);
}
html[data-tv="1"][data-tv-theme="light"] .tv-detail { background: #f3f4f6; }
html[data-tv="1"][data-tv-theme="light"] .tv-detail__body code {
  background: rgba(0, 0, 0, 0.06);
}
html[data-tv="1"][data-tv-theme="light"] .tv-detail__body pre {
  background: rgba(0, 0, 0, 0.06);
}
html[data-tv="1"][data-tv-theme="light"] .tv-detail__close {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.12);
}
html[data-tv="1"][data-tv-theme="light"] .tv-checklist__item {
  background: rgba(0, 0, 0, 0.04);
}
html[data-tv="1"][data-tv-theme="light"] .tv-empty { color: #4b5563; }
html[data-tv="1"][data-tv-theme="light"] .tv-status {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
  color: #374151;
}
`;
