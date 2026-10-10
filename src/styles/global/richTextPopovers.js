// Rich-text popovers: block / font menus, task-list options, reminder
// picker, font size, colours, underline and link.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const richTextPopoversCSS = `
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

/* Task-list options popover — one labelled checkbox row. */
.rt-pop--task { min-width: 232px; }
.rt-pop-check {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
}
.rt-pop-check:hover { background: var(--rt-btn-hover); }
.rt-pop-check input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  flex: 0 0 auto;
  accent-color: rgb(var(--rt-accent));
  cursor: pointer;
}
.rt-pop-check span { flex: 1 1 auto; }

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

/* ── Reminder picker ─────────────────────────────────────────────────
   On desktop it reuses the rich-text menu shell (.rt-pop--reminder) so it
   looks exactly like the font / block-type dropdowns: opaque, themed, same
   rows; on phones it sits in a bottom sheet. Its content is styled under
   .gk-reminder, in both. The date is a custom mini-calendar and the time a
   custom stepper + chips: no native browser controls, all theme-aware via
   the accent token. */
.rt-pop--reminder {
  width: 286px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  padding: 6px;
}
.gk-reminder .rt-pop-label { padding: 0 4px; }
.gk-reminder .gk-reminder-sep { height: 1px; margin: 7px 4px; background: var(--rt-pop-border); }

/* Mini calendar */
.gk-reminder .gk-cal { padding: 2px 2px 4px; }
.gk-reminder .gk-cal-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; padding: 0 2px;
}
.gk-reminder .gk-cal-title { font-size: 0.85rem; font-weight: 600; text-transform: capitalize; }
.gk-reminder .gk-cal-nav {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 0; border-radius: 8px;
  background: transparent; color: inherit; cursor: pointer; transition: background 0.12s ease;
}
.gk-reminder .gk-cal-nav:hover { background: var(--rt-btn-hover); }
.gk-reminder .gk-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.gk-reminder .gk-cal-dow {
  text-align: center; font-size: 0.62rem; font-weight: 600; opacity: 0.55;
  padding: 2px 0; text-transform: uppercase;
}
.gk-reminder .gk-cal-day {
  aspect-ratio: 1 / 1; min-height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: 9px; background: transparent; color: inherit;
  font-size: 0.8rem; cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, transform 0.12s ease;
}
/* Hover = a gentle grow for every day. Plain days also get a soft
   background; the selected day keeps its accent fill (handled below) and
   only grows — so hovering it no longer swaps to a near-white background
   while the text stays white. */
.gk-reminder .gk-cal-day:hover:not(:disabled) { transform: scale(1.12); }
.gk-reminder .gk-cal-day:hover:not(:disabled):not(.gk-cal-day--selected) { background: var(--rt-btn-hover); }
.gk-reminder .gk-cal-day--muted { opacity: 0.32; }
.gk-reminder .gk-cal-day:disabled { opacity: 0.25; cursor: default; }
.gk-reminder .gk-cal-day--today {
  font-weight: 700;
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--gk-chrome-accent) 45%, transparent);
}
.gk-reminder .gk-cal-day--selected,
.gk-reminder .gk-cal-day--selected:hover {
  background: var(--gk-chrome-accent); color: #fff; font-weight: 600;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--gk-chrome-accent) 45%, transparent);
}

/* Time stepper + chips */
/* In a sheet (on the note's colour) the faded parts stay readable. */
.gk-sheet .gk-reminder .rt-pop-label { opacity: 0.8; }
.gk-sheet .gk-reminder .gk-cal-dow { opacity: 0.75; }
.gk-sheet .gk-reminder .gk-cal-day--muted { opacity: 0.45; }
.gk-sheet .gk-reminder .gk-cal-day:disabled { opacity: 0.38; }
.gk-sheet .gk-reminder .gk-time-sep { opacity: 0.7; }
.gk-reminder .gk-time { padding: 2px 4px; }
.gk-reminder .gk-time-stepper { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 9px; }
.gk-reminder .gk-time-col { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.gk-reminder .gk-time-btn {
  width: 34px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: 7px; background: var(--rt-btn-hover); color: inherit; cursor: pointer;
  transition: background 0.12s ease;
}
.gk-reminder .gk-time-btn:hover { background: color-mix(in srgb, var(--gk-chrome-accent) 22%, transparent); }
.gk-reminder .gk-time-val {
  font-size: 1.3rem; font-weight: 700; font-variant-numeric: tabular-nums;
  min-width: 2.2ch; text-align: center; padding: 1px 0;
}
/* The HH / MM values are editable inputs (type to set them by hand) — reset
   the native chrome so they read like the old static numbers. */
.gk-reminder .gk-time-input {
  width: 2.4ch; box-sizing: content-box;
  border: 0; border-radius: 7px; background: transparent; color: inherit;
  outline: none; cursor: text; -moz-appearance: textfield;
  transition: background 0.12s ease, box-shadow 0.12s ease;
}
.gk-reminder .gk-time-input:focus {
  background: color-mix(in srgb, var(--gk-chrome-accent) 14%, transparent);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--gk-chrome-accent) 55%, transparent);
}
.gk-reminder .gk-time-sep { font-size: 1.3rem; font-weight: 700; opacity: 0.45; }
.gk-reminder .gk-time-chips { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; }
.gk-reminder .gk-time-chip {
  font-size: 0.78rem; font-weight: 600; padding: 5px 10px; border-radius: 999px;
  border: 1px solid var(--rt-pop-border); background: var(--rt-btn-hover); color: inherit;
  cursor: pointer; transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.gk-reminder .gk-time-chip:hover { border-color: color-mix(in srgb, var(--gk-chrome-accent) 50%, transparent); }
.gk-reminder .gk-time-chip--active {
  background: color-mix(in srgb, var(--gk-chrome-accent) 16%, transparent);
  border-color: var(--gk-chrome-accent);
  color: var(--gk-chrome-accent);
}
html.dark .gk-reminder .gk-time-chip--active {
  color: #fff; background: color-mix(in srgb, var(--gk-chrome-accent) 32%, transparent);
}
/* Pencil chip — opens the inline "edit suggestions" mode. */
.gk-reminder .gk-time-chip--edit {
  display: inline-flex; align-items: center; justify-content: center; padding: 5px 9px;
}
.gk-reminder .gk-time-chip--edit:hover { color: var(--gk-chrome-accent); }

/* Inline editor for the quick-time suggestions (max 5). */
.gk-reminder .gk-time-chips-edit {
  display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; align-items: center; padding: 2px 4px;
}
.gk-reminder .gk-chip-edit-row { display: inline-flex; align-items: center; gap: 1px; }
.gk-reminder .gk-chip-edit-input {
  width: 5.4ch; text-align: center; font-size: 0.82rem; font-weight: 600;
  font-variant-numeric: tabular-nums;
  border: 1px solid var(--rt-pop-border); border-radius: 8px;
  background: var(--rt-btn-hover); color: inherit; padding: 4px 2px; outline: none;
  transition: border-color 0.12s ease;
}
.gk-reminder .gk-chip-edit-input:focus { border-color: var(--gk-chrome-accent); }
.gk-reminder .gk-chip-edit-del {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border: 0; border-radius: 6px;
  background: transparent; color: #dc2626; cursor: pointer; transition: background 0.12s ease;
}
.gk-reminder .gk-chip-edit-del:hover { background: color-mix(in srgb, #ef4444 14%, transparent); }
html.dark .gk-reminder .gk-chip-edit-del { color: #f87171; }
.gk-reminder .gk-chip-edit-actions { display: inline-flex; align-items: center; gap: 6px; }
.gk-reminder .gk-chip-edit-add {
  width: 28px; height: 28px; border-radius: 999px; font-size: 1.15rem; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px dashed var(--rt-pop-border); background: transparent; color: inherit; cursor: pointer;
  transition: border-color 0.12s ease, color 0.12s ease;
}
.gk-reminder .gk-chip-edit-add:hover { border-color: var(--gk-chrome-accent); color: var(--gk-chrome-accent); }
.gk-reminder .gk-chip-edit-done {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 0.78rem; font-weight: 600; padding: 5px 11px; border-radius: 999px;
  border: 1px solid var(--gk-chrome-accent);
  background: color-mix(in srgb, var(--gk-chrome-accent) 14%, transparent);
  color: var(--gk-chrome-accent); cursor: pointer;
}
html.dark .gk-reminder .gk-chip-edit-done { color: #fff; background: color-mix(in srgb, var(--gk-chrome-accent) 32%, transparent); }

.gk-reminder .gk-reminder-past-hint { font-size: 0.72rem; color: #dc2626; padding: 0 4px 4px; text-align: center; }
html.dark .gk-reminder .gk-reminder-past-hint { color: #f87171; }

.gk-reminder .gk-reminder-actions { display: flex; align-items: center; gap: 8px; padding: 2px 4px; }
.gk-reminder .gk-reminder-remove {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 8px;
  color: #dc2626;
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: background 0.15s ease;
}
html.dark .gk-reminder .gk-reminder-remove { color: #f87171; }
.gk-reminder .gk-reminder-remove:hover { background: color-mix(in srgb, #ef4444 14%, transparent); }
.gk-reminder .gk-reminder-set { margin-left: auto; }

/* The mini-calendar / chips have more room in the mobile bottom sheet. */
.gk-sheet .gk-reminder .gk-cal-day { min-height: 38px; font-size: 0.92rem; }
.gk-sheet .gk-reminder .gk-time-chip { font-size: 0.86rem; padding: 7px 13px; }
.gk-sheet .gk-reminder .gk-reminder-actions { padding: 10px 0 2px; }
.gk-sheet .gk-reminder .gk-reminder-set {
  flex: 1 1 auto;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 1rem;
}

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
  /* Follow the active theme accent (same vocabulary as the is-current rows).
     The tokens already resolve light vs dark, so no separate dark rule. */
  background: var(--rt-btn-active-bg);
  color: var(--rt-btn-active-text);
  line-height: 1;
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
  /* Same indigo→violet "Personnaliser" pill as the typography settings
     button (and LoginView / ChangePasswordModal). Mirrors Tailwind's
     "from-indigo-500 to-violet-600 text-white shadow-md
      shadow-indigo-300/40 hover:from-indigo-600 hover:to-violet-700
      hover:shadow-lg hover:shadow-indigo-300/50 hover:scale-[1.03]
      active:scale-[0.98] transition-all duration-200 btn-gradient"
     so the "Par défaut" pills feel like deliberate theme buttons
     instead of neutral border boxes — and use the same shimmer
     sweep on hover for parity. */
  position: relative;
  overflow: hidden;
  margin-top: 8px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: linear-gradient(to right, rgb(99, 102, 241), rgb(124, 58, 237));
  color: #ffffff;
  font-size: 0.8rem;
  cursor: pointer;
  font-weight: 600;
  /* No resting halo — the coloured glow appears on :hover only (see below). */
  box-shadow: none;
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}
.rt-pop-clear::after {
  content: "";
  position: absolute;
  inset: 0;
  width: 45%;
  background: linear-gradient(
    105deg,
    transparent 0%,
    transparent 35%,
    rgba(255, 255, 255, 0.25) 45%,
    rgba(255, 255, 255, 0.4) 50%,
    rgba(255, 255, 255, 0.25) 55%,
    transparent 65%,
    transparent 100%
  );
  transform: translateX(-100%) skewX(-15deg);
  pointer-events: none;
}
.rt-pop-clear:hover {
  background: linear-gradient(to right, rgb(79, 70, 229), rgb(109, 40, 217));
  box-shadow:
    0 10px 15px -3px rgba(165, 180, 252, 0.5),
    0 4px 6px -4px rgba(165, 180, 252, 0.5);
  transform: scale(1.03);
}
.rt-pop-clear:hover::after {
  animation: btn-shimmer 0.7s ease-in-out;
}
.rt-pop-clear:active {
  transform: scale(0.98);
}
/* Themed gradient + halo — both the background AND the coloured hover glow
   follow the active workspace theme (GlassKeep keeps the original
   indigo→violet + indigo-300 halo since it has no class). Every other
   style — shape, padding, ::after shimmer, hover scale, transition — is
   inherited unchanged. Excludes the --danger variant (flat red, no fill).
   The halo is hover-only and shows in BOTH light and dark mode. */
html[class*="gk-theme-"] .rt-pop-clear:not(.rt-pop-clear--danger) {
  background: linear-gradient(to right, var(--gk-chrome-grad-from), var(--gk-chrome-grad-to));
}
html[class*="gk-theme-"] .rt-pop-clear:not(.rt-pop-clear--danger):hover {
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--gk-chrome-grad-from) 88%, #000),
    color-mix(in srgb, var(--gk-chrome-grad-to) 88%, #000)
  );
  box-shadow:
    0 10px 15px -3px color-mix(in srgb, var(--gk-chrome-grad-from) 50%, transparent),
    0 4px 6px -4px color-mix(in srgb, var(--gk-chrome-grad-from) 50%, transparent);
}
.rt-pop-clear--danger {
  /* Danger variant overrides the gradient — it's a "remove" action,
     not a primary CTA, so it reads as a flat red link button. */
  margin-top: 6px;
  background: transparent;
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.28);
  box-shadow: none;
  font-weight: 500;
}
.rt-pop-clear--danger::after { display: none; }
.rt-pop-clear--danger:hover {
  background: rgba(220, 38, 38, 0.08);
  box-shadow: none;
  transform: none;
}
html.dark .rt-pop-clear--danger { color: #f87171; border-color: rgba(248, 113, 113, 0.32); }

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
  /* Same Personnaliser theme as the typography settings button:
     indigo→violet gradient, indigo-300 shadows, hover scale 1.03,
     200 ms transition, plus the shared btn-shimmer ::after sweep. */
  position: relative;
  overflow: hidden;
  flex: 1 1 auto;
  background: linear-gradient(to right, rgb(99, 102, 241), rgb(124, 58, 237));
  color: #fff;
  border-color: transparent;
  font-weight: 600;
  /* No resting halo — the coloured glow appears on :hover only (see below). */
  box-shadow: none;
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}
.rt-link-btn--primary::after {
  content: "";
  position: absolute;
  inset: 0;
  width: 45%;
  background: linear-gradient(
    105deg,
    transparent 0%,
    transparent 35%,
    rgba(255, 255, 255, 0.25) 45%,
    rgba(255, 255, 255, 0.4) 50%,
    rgba(255, 255, 255, 0.25) 55%,
    transparent 65%,
    transparent 100%
  );
  transform: translateX(-100%) skewX(-15deg);
  pointer-events: none;
}
.rt-link-btn--primary:hover:not(:disabled) {
  background: linear-gradient(to right, rgb(79, 70, 229), rgb(109, 40, 217));
  box-shadow:
    0 10px 15px -3px rgba(165, 180, 252, 0.5),
    0 4px 6px -4px rgba(165, 180, 252, 0.5);
  transform: scale(1.03);
}
.rt-link-btn--primary:hover:not(:disabled)::after {
  animation: btn-shimmer 0.7s ease-in-out;
}
.rt-link-btn--primary:active:not(:disabled) { transform: scale(0.98); }
.rt-link-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
/* Themed gradient + halo — same scoping rule as .rt-pop-clear above:
   GlassKeep keeps indigo→violet + its indigo-300 halo; every other theme
   swaps in its own gradient stops AND glow hue. Only the colours change;
   the rest of the button is untouched. The halo is hover-only and shows
   in BOTH light and dark mode. */
html[class*="gk-theme-"] .rt-link-btn--primary {
  background: linear-gradient(to right, var(--gk-chrome-grad-from), var(--gk-chrome-grad-to));
}
html[class*="gk-theme-"] .rt-link-btn--primary:hover:not(:disabled) {
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--gk-chrome-grad-from) 88%, #000),
    color-mix(in srgb, var(--gk-chrome-grad-to) 88%, #000)
  );
  box-shadow:
    0 10px 15px -3px color-mix(in srgb, var(--gk-chrome-grad-from) 50%, transparent),
    0 4px 6px -4px color-mix(in srgb, var(--gk-chrome-grad-from) 50%, transparent);
}
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
`;
