// Elements tinted with the active theme's accent: the admin user-edit button
// and the Tags popover.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const themedAccentsCSS = `
/* ── Admin user-edit icon button (themed square icon button) ── */
.gk-admin-edit-btn {
  background-color: var(--gk-icon-bg);
  color: var(--gk-icon-fg);
}
.gk-admin-edit-btn:hover {
  background-color: color-mix(in srgb, var(--gk-chrome-grad-from) 22%, transparent);
}

/* ── Tags popover — elements that follow the active theme ── */

/* Count badge on the Tags toolbar button */
.gk-tag-count-badge {
  background: linear-gradient(135deg, var(--gk-chrome-grad-from), var(--gk-chrome-grad-to));
  color: #fff;
}

/* Popover container border tint */
.gk-tag-popover {
  border-color: color-mix(in srgb, var(--gk-chrome-accent) 22%, transparent);
}

/* Search input focus ring */
.gk-tag-search-wrap:focus-within {
  border-color: var(--gk-chrome-accent);
}

/* Tag list item hover background */
.gk-tag-popover button:hover {
  background-color: color-mix(in srgb, var(--gk-chrome-grad-from) 8%, transparent);
}

/* Checkbox — checked fill and border */
.gk-tag-cb.gk-tag-cb--on {
  background-color: var(--gk-chrome-grad-from);
  border-color: var(--gk-chrome-grad-from);
}

/* Checkbox — unchecked hover border */
.gk-tag-popover button:hover .gk-tag-cb:not(.gk-tag-cb--on) {
  border-color: var(--gk-chrome-accent);
}

/* Applied tag chips */
.gk-tag-chip {
  background-color: color-mix(in srgb, var(--gk-chrome-accent) 12%, transparent);
  color: var(--gk-icon-fg);
  border-color: color-mix(in srgb, var(--gk-chrome-accent) 24%, transparent);
}
.gk-tag-chip-remove {
  color: color-mix(in srgb, var(--gk-chrome-accent) 65%, transparent);
}
.gk-sheet .gk-tag-chip-remove { color: var(--gk-icon-fg); }
/* In a dark sheet the accent tint sinks into the note's colour: neutral
   translucent chips instead. */
html.dark .gk-sheet .gk-tag-chip {
  background-color: rgb(255 255 255 / 0.14);
  color: inherit;
  border-color: transparent;
}
html.dark .gk-sheet .gk-tag-chip-remove { color: rgb(243 244 246 / 0.75); }
`;
