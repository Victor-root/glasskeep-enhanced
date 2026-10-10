// Theme tokens (GlassKeep and the alternate shell themes), theme-driven
// buttons, switches and focus rings, text selection, the page background and
// the installed-PWA navigation bar tint.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const baseCSS = `
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
/* ============================================================
   CHROME THEME TOKENS — header + sidebar ONLY.
   A lightweight, STATIC "fake glass" system: NO backdrop-filter,
   NO blur, NO image. The glass look is faked with cheap paint only —
   a soft tinted gradient + a top light "sheen" + a 1px rim highlight
   + a subtle cool border + a soft shadow. It composites as a plain
   alpha layer, so it never costs the GPU the per-frame re-raster a
   real blur would: performance stays flat while scrolling.

   These --gk-chrome-* variables are consumed EXCLUSIVELY by the
   header.glass-card, .gk-sidebar and .gk-side-item* rules below — they
   intentionally do NOT touch the notes canvas (body), the note cards,
   the panels, the create buttons or the login page.

   Multi-theme: the DEFAULT (:root / html.dark) is "GlassKeep" — a cool,
   modern blue / indigo / slate with a faint violet touch. Alternates are
   just token overrides on html.gk-theme-<name>; the glass recipe is
   identical, only the hues change. Activate one by adding the class on
   <html> (a picker can be wired later). Add a theme by copying a block. */
:root {
  /* GlassKeep — light. Tint stops are semi-opaque so the surface reads as
     glass yet stays legible; sheen/highlight are the shared "glass physics". */
  --gk-chrome-1: rgba(212, 221, 252, 0.90);  /* light indigo  */
  --gk-chrome-2: rgba(221, 217, 252, 0.90);  /* indigo→violet */
  --gk-chrome-3: rgba(231, 215, 252, 0.90);  /* light violet  */
  --gk-chrome-solid: #edf1fa;                /* opaque header base — kills see-through */
  /* Flat chrome colour for the Android status bar AND the mobile header (they
     read as one block). MUST match STATUS_BAR_LIGHT/DARK in src/utils/helpers.js. */
  --gk-statusbar: #dce1fb;
  --gk-chrome-border: rgba(120, 134, 196, 0.28);
  --gk-chrome-shadow: rgba(54, 64, 122, 0.10);
  --gk-chrome-sheen: rgba(255, 255, 255, 0.55);
  --gk-chrome-highlight: rgba(255, 255, 255, 0.70);
  --gk-chrome-accent: #4f46e5;
  /* Vivid brand gradient (mirrors the app's primary buttons) — used for the
     header/sidebar accent rail and the active sidebar item. Shared light/dark. */
  --gk-chrome-grad-from: #6366f1;
  --gk-chrome-grad-to: #7c3aed;
  --gk-chrome-hover: rgba(79, 70, 229, 0.08);
  --gk-chrome-active-bg: rgba(99, 102, 241, 0.16);
  --gk-chrome-active-fg: #3730a3;
  /* Notes-canvas background (body). Theme-driven so the main area follows the
     active theme; GlassKeep keeps its exact validated lavender/blue/pink. */
  --gk-app-bg: #eee5ff;
  --gk-app-bg-image: linear-gradient(135deg, #eee5ff 0%, #e5f3fd 50%, #fde5ee 100%);
  /* Derived shell-UI tokens (global scrollbars, side panels, panel section
     icons). Defined ONCE here and re-derived from each theme's base hue
     tokens via var()/color-mix, so every theme — and any future one — gets a
     coherent set for free without re-declaring. Light values. */
  --gk-scroll-track: color-mix(in srgb, var(--gk-chrome-accent) 16%, transparent);
  --gk-scroll-thumb: linear-gradient(180deg, var(--gk-chrome-grad-from), var(--gk-chrome-grad-to));
  --gk-scroll-thumb-hover: linear-gradient(180deg, color-mix(in srgb, var(--gk-chrome-grad-from) 82%, #000), color-mix(in srgb, var(--gk-chrome-grad-to) 82%, #000));
  --gk-panel-bg: color-mix(in srgb, var(--gk-chrome-accent) 6%, #ffffff);
  --gk-panel-card: color-mix(in srgb, var(--gk-chrome-accent) 4%, #ffffff);
  /* Mobile sheets (Sheet.jsx) not given a background of their own. */
  --gk-sheet-bg: color-mix(in srgb, var(--gk-chrome-accent) 7%, #f3f3f6);
  /* Two icon tiers so option-row vs section-header chips stay distinct
     (GlassKeep: indigo grad-from vs violet grad-to, as before). */
  --gk-icon-fg: var(--gk-chrome-grad-from);
  --gk-icon-bg: color-mix(in srgb, var(--gk-chrome-grad-from) 12%, transparent);
  --gk-icon2-fg: var(--gk-chrome-grad-to);
  --gk-icon2-bg: color-mix(in srgb, var(--gk-chrome-grad-to) 12%, transparent);
  /* Toggle "on" colour. GlassKeep keeps indigo-600; themes override below. */
  --gk-switch-on: #4f46e5;
  /* Soft accent chip (faint fill + border) — e.g. the header page badge.
     Re-resolves per theme/mode via the cascaded --gk-chrome-accent. */
  --gk-accent-soft-bg: color-mix(in srgb, var(--gk-chrome-accent) 12%, transparent);
  --gk-accent-soft-border: color-mix(in srgb, var(--gk-chrome-accent) 24%, transparent);
  /* Primary-button coloured glow — kept subtle at rest, a touch stronger on
     hover. GlassKeep default is indigo; themes override below. */
  --gk-btn-glow: rgba(99, 102, 241, 0.20);
  --gk-btn-glow-hover: rgba(99, 102, 241, 0.32);
}
html.dark {
  /* GlassKeep — dark. Cool slate-blue glass; sheen/highlight are barely
     there (white would blow out against a dark surface). */
  --gk-chrome-1: rgba(30, 36, 64, 0.90);
  --gk-chrome-2: rgba(36, 33, 66, 0.90);
  --gk-chrome-3: rgba(44, 32, 66, 0.90);
  --gk-chrome-solid: #1b2233;
  --gk-statusbar: #171f30;
  --gk-chrome-border: rgba(126, 142, 200, 0.20);
  --gk-chrome-shadow: rgba(0, 0, 0, 0.38);
  --gk-chrome-sheen: rgba(255, 255, 255, 0.05);
  --gk-chrome-highlight: rgba(255, 255, 255, 0.07);
  --gk-chrome-accent: #818cf8;
  --gk-chrome-hover: rgba(129, 140, 248, 0.14);
  --gk-chrome-active-bg: rgba(99, 102, 241, 0.24);
  --gk-chrome-active-fg: #c7d2fe;
  --gk-app-bg: #1a1a1a;
  --gk-app-bg-image: none;
  /* Derived shell-UI tokens — dark values (hover brightens instead of
     darkening; panels tint a dark base instead of white). */
  --gk-scroll-track: color-mix(in srgb, var(--gk-chrome-accent) 22%, transparent);
  --gk-scroll-thumb: linear-gradient(180deg, var(--gk-chrome-grad-from), var(--gk-chrome-grad-to));
  --gk-scroll-thumb-hover: linear-gradient(180deg, color-mix(in srgb, var(--gk-chrome-grad-from) 80%, #fff), color-mix(in srgb, var(--gk-chrome-grad-to) 80%, #fff));
  --gk-panel-bg: color-mix(in srgb, var(--gk-chrome-accent) 10%, #1f1f1f);
  --gk-panel-card: color-mix(in srgb, var(--gk-chrome-accent) 8%, #282828);
  --gk-sheet-bg: color-mix(in srgb, var(--gk-chrome-accent) 8%, #1c1c1e);
  /* Lighten the icon foregrounds on dark so they stay legible while keeping
     the two-tier (option vs section) hue distinction. */
  --gk-icon-fg: color-mix(in srgb, var(--gk-chrome-grad-from) 62%, #fff);
  --gk-icon-bg: color-mix(in srgb, var(--gk-chrome-grad-from) 22%, transparent);
  --gk-icon2-fg: color-mix(in srgb, var(--gk-chrome-grad-to) 62%, #fff);
  --gk-icon2-bg: color-mix(in srgb, var(--gk-chrome-grad-to) 22%, transparent);
}
/* ----- Alternate shell themes. Activated by a class on <html>
   (gk-theme-<id>), set from the saved preference (see src/theme/shellTheme.js
   + the Settings "Workspace theme" picker). GlassKeep is the DEFAULT and has
   NO class — it uses the :root / html.dark blocks above, untouched.

   Each theme overrides ONLY the hue-bearing tokens. The white "glass physics"
   (--gk-chrome-sheen / --gk-chrome-highlight) is deliberately NOT overridden,
   so the sheen, rim-highlight, contrast and the whole static fake-glass recipe
   are byte-identical across themes — only the colour shifts. Same paint, same
   performance profile (still no blur / backdrop-filter). grad-from/to are set
   in the light block and inherited by the dark block (matching GlassKeep). */

/* EMERALD — calm green / teal / blue-green. */
html.gk-theme-emerald {
  --gk-chrome-1: rgba(205, 238, 223, 0.90);
  --gk-chrome-2: rgba(206, 236, 228, 0.90);
  --gk-chrome-3: rgba(208, 235, 234, 0.90);
  --gk-chrome-solid: #e4f3ec;
  --gk-statusbar: #d2ecdf;
  --gk-chrome-border: rgba(45, 150, 120, 0.28);
  --gk-chrome-shadow: rgba(14, 90, 70, 0.10);
  --gk-chrome-accent: #0d9488;
  --gk-chrome-grad-from: #10b981;
  --gk-chrome-grad-to: #0d9488;
  --rt-accent: 16, 185, 129;
  --gk-chrome-hover: rgba(16, 185, 129, 0.09);
  --gk-chrome-active-bg: rgba(13, 148, 136, 0.16);
  --gk-chrome-active-fg: #0f5f53;
  --gk-app-bg: #e8f6ee;
  --gk-app-bg-image: linear-gradient(135deg, #e8f6ee 0%, #e3f4f1 50%, #eafaf0 100%);
}
html.dark.gk-theme-emerald {
  --gk-chrome-1: rgba(20, 40, 34, 0.90);
  --gk-chrome-2: rgba(22, 42, 38, 0.90);
  --gk-chrome-3: rgba(24, 44, 42, 0.90);
  --gk-chrome-solid: #14241f;
  --gk-statusbar: #10211b;
  --gk-chrome-border: rgba(64, 170, 134, 0.20);
  --gk-chrome-shadow: rgba(0, 0, 0, 0.38);
  --gk-chrome-accent: #34d399;
  --gk-chrome-hover: rgba(52, 211, 153, 0.14);
  --gk-chrome-active-bg: rgba(16, 185, 129, 0.24);
  --gk-chrome-active-fg: #a6e9cf;
  --gk-app-bg: #141a17;
  --gk-app-bg-image: none;
}

/* AMBER — warm amber / honey / champagne (kept saturated, never beige). */
html.gk-theme-amber {
  --gk-chrome-1: rgba(250, 232, 206, 0.90);
  --gk-chrome-2: rgba(250, 228, 204, 0.90);
  --gk-chrome-3: rgba(250, 224, 205, 0.90);
  --gk-chrome-solid: #f7ecdd;
  --gk-statusbar: #f6e3c9;
  --gk-chrome-border: rgba(190, 140, 60, 0.30);
  --gk-chrome-shadow: rgba(140, 95, 25, 0.11);
  --gk-chrome-accent: #d97706;
  --gk-chrome-grad-from: #d97706;
  --gk-chrome-grad-to: #b45309;
  --rt-accent: 217, 119, 6;
  --gk-chrome-hover: rgba(217, 119, 6, 0.10);
  --gk-chrome-active-bg: rgba(217, 119, 6, 0.16);
  --gk-chrome-active-fg: #8a4d09;
  --gk-app-bg: #fdf2e2;
  --gk-app-bg-image: linear-gradient(135deg, #fdf2e2 0%, #faecd6 50%, #fdeede 100%);
}
html.dark.gk-theme-amber {
  --gk-chrome-1: rgba(42, 33, 20, 0.90);
  --gk-chrome-2: rgba(44, 34, 20, 0.90);
  --gk-chrome-3: rgba(46, 34, 21, 0.90);
  --gk-chrome-solid: #241d12;
  --gk-statusbar: #20190f;
  --gk-chrome-border: rgba(200, 150, 70, 0.20);
  --gk-chrome-shadow: rgba(0, 0, 0, 0.38);
  --gk-chrome-accent: #fbbf24;
  --gk-chrome-hover: rgba(251, 191, 36, 0.14);
  --gk-chrome-active-bg: rgba(217, 119, 6, 0.26);
  --gk-chrome-active-fg: #f6d8a6;
  --gk-app-bg: #1b1712;
  --gk-app-bg-image: none;
}

/* ROSEWOOD — vivid ruby / cherry / cranberry (clean and modern, never brick,
   rust or dried-blood brown; deep but not a harsh pure red). */
html.gk-theme-rosewood {
  --gk-chrome-1: rgba(250, 210, 210, 0.90);
  --gk-chrome-2: rgba(250, 205, 205, 0.90);
  --gk-chrome-3: rgba(249, 202, 202, 0.90);
  --gk-chrome-solid: #f9dede;
  --gk-statusbar: #f7cccc;
  --gk-chrome-border: rgba(200, 40, 40, 0.32);
  --gk-chrome-shadow: rgba(150, 20, 20, 0.12);
  --gk-chrome-accent: #d61f1f;
  --gk-chrome-grad-from: #e11d1d;
  --gk-chrome-grad-to: #9f1010;
  --rt-accent: 225, 29, 29;
  --gk-chrome-hover: rgba(214, 31, 31, 0.10);
  --gk-chrome-active-bg: rgba(214, 31, 31, 0.16);
  --gk-chrome-active-fg: #9b1212;
  --gk-app-bg: #fdeaea;
  --gk-app-bg-image: linear-gradient(135deg, #fdeaea 0%, #fbe0e0 50%, #fef0f0 100%);
}
html.dark.gk-theme-rosewood {
  --gk-chrome-1: rgba(50, 22, 22, 0.90);
  --gk-chrome-2: rgba(54, 22, 22, 0.90);
  --gk-chrome-3: rgba(58, 22, 22, 0.90);
  --gk-chrome-solid: #2c1616;
  --gk-statusbar: #261010;
  --gk-chrome-border: rgba(248, 80, 80, 0.24);
  --gk-chrome-shadow: rgba(0, 0, 0, 0.40);
  --gk-chrome-accent: #f87171;
  --gk-chrome-hover: rgba(248, 113, 113, 0.14);
  --gk-chrome-active-bg: rgba(220, 38, 38, 0.30);
  --gk-chrome-active-fg: #fecaca;
  --gk-app-bg: #1a1212;
  --gk-app-bg-image: none;
}

/* GRAPHITE — cool slate / graphite neutral, discreet accent (not flat grey). */
html.gk-theme-graphite {
  --gk-chrome-1: rgba(223, 227, 233, 0.90);
  --gk-chrome-2: rgba(220, 224, 231, 0.90);
  --gk-chrome-3: rgba(218, 222, 229, 0.90);
  --gk-chrome-solid: #e8ebef;
  --gk-statusbar: #dde1e7;
  --gk-chrome-border: rgba(100, 116, 139, 0.30);
  --gk-chrome-shadow: rgba(30, 41, 59, 0.10);
  --gk-chrome-accent: #475569;
  --gk-chrome-grad-from: #64748b;
  --gk-chrome-grad-to: #475569;
  --rt-accent: 100, 116, 139;
  --gk-chrome-hover: rgba(71, 85, 105, 0.09);
  --gk-chrome-active-bg: rgba(71, 85, 105, 0.16);
  --gk-chrome-active-fg: #334155;
  --gk-app-bg: #eef1f5;
  --gk-app-bg-image: linear-gradient(135deg, #eef1f5 0%, #e9edf2 50%, #f3f5f8 100%);
}
html.dark.gk-theme-graphite {
  --gk-chrome-1: rgba(30, 33, 39, 0.90);
  --gk-chrome-2: rgba(32, 35, 41, 0.90);
  --gk-chrome-3: rgba(34, 37, 44, 0.90);
  --gk-chrome-solid: #1c1e22;
  --gk-statusbar: #17191d;
  --gk-chrome-border: rgba(148, 163, 184, 0.20);
  --gk-chrome-shadow: rgba(0, 0, 0, 0.42);
  --gk-chrome-accent: #94a3b8;
  --gk-chrome-hover: rgba(148, 163, 184, 0.13);
  --gk-chrome-active-bg: rgba(100, 116, 139, 0.26);
  --gk-chrome-active-fg: #cbd5e1;
  --gk-app-bg: #161719;
  --gk-app-bg-image: none;
}

/* BLUSH — modern soft pink (clean magenta-rose; not fluo, not Barbie, not a
   washed-out pastel). Clearly pinker/lighter than Rosewood's crimson red. */
html.gk-theme-blush {
  --gk-chrome-1: rgba(250, 219, 235, 0.90);
  --gk-chrome-2: rgba(250, 215, 233, 0.90);
  --gk-chrome-3: rgba(249, 213, 232, 0.90);
  --gk-chrome-solid: #f8e2f0;
  --gk-statusbar: #f7d4ea;
  --gk-chrome-border: rgba(200, 60, 140, 0.30);
  --gk-chrome-shadow: rgba(160, 30, 100, 0.11);
  --gk-chrome-accent: #db2777;
  --gk-chrome-grad-from: #ec4899;
  --gk-chrome-grad-to: #be185d;
  --rt-accent: 219, 39, 119;
  --gk-chrome-hover: rgba(219, 39, 119, 0.10);
  --gk-chrome-active-bg: rgba(219, 39, 119, 0.16);
  --gk-chrome-active-fg: #9d174d;
  --gk-app-bg: #fdeaf4;
  --gk-app-bg-image: linear-gradient(135deg, #fdeaf4 0%, #fce1ef 50%, #fef0f7 100%);
}
html.dark.gk-theme-blush {
  --gk-chrome-1: rgba(48, 24, 40, 0.90);
  --gk-chrome-2: rgba(52, 24, 42, 0.90);
  --gk-chrome-3: rgba(54, 24, 44, 0.90);
  --gk-chrome-solid: #2c1622;
  --gk-statusbar: #26101c;
  --gk-chrome-border: rgba(244, 114, 182, 0.24);
  --gk-chrome-shadow: rgba(0, 0, 0, 0.40);
  --gk-chrome-accent: #f472b6;
  --gk-chrome-hover: rgba(244, 114, 182, 0.14);
  --gk-chrome-active-bg: rgba(219, 39, 119, 0.28);
  --gk-chrome-active-fg: #fbcfe8;
  --gk-app-bg: #1b1218;
  --gk-app-bg-image: none;
}
/* Primary gradient buttons (.btn-gradient): follow the active theme's
   gradient. Scoped to any gk-theme-* class so GlassKeep — which has NO theme
   class — keeps its exact Tailwind indigo->violet untouched. Only the gradient
   colour changes; every other utility (shadow, scale, radius, hover scale)
   stays. The :hover variant just darkens the same themed gradient.
   The 4 note-creation buttons (.gk-create-btn) are excluded: they keep their
   own per-type colour gradients. */
/* Retint + soften the coloured glow for ALL primary gradient buttons
   (GlassKeep included): drive --tw-shadow-color from the glow tokens so the
   resting halo is subtle and the hover halo only slightly stronger. The
   injected stylesheet loads after Tailwind, so this wins over shadow-indigo-*
   at equal specificity; dark:shadow-none still wins (it zeroes --tw-shadow). */
.btn-gradient:not(.gk-create-btn):not(.gk-update-btn):not(.gk-fixed-btn) { --tw-shadow-color: var(--gk-btn-glow); }
.btn-gradient:not(.gk-create-btn):not(.gk-update-btn):not(.gk-fixed-btn):hover { --tw-shadow-color: var(--gk-btn-glow-hover); }
/* Halo on HOVER ONLY — for every primary gradient button, in both light and
   dark mode. At rest there is no glow; on hover the button gets a shadow-lg
   sized halo whose colour is the --tw-shadow-color each button already
   resolves (the themed glow above for primary buttons, the button's own
   colour for create / update buttons). This overrides the per-button
   Tailwind shadow utilities by source order (globalCSS loads after Tailwind);
   it also beats dark:hover:shadow-none, because Tailwind v4 wraps dark:
   variants in :where(), which contributes zero specificity. */
.btn-gradient { box-shadow: none; }
.btn-gradient:hover:not(:disabled) {
  box-shadow:
    0 10px 15px -3px var(--tw-shadow-color, transparent),
    0 4px 6px -4px var(--tw-shadow-color, transparent);
}
html[class*="gk-theme-"] .btn-gradient:not(.gk-create-btn):not(.gk-update-btn):not(.gk-fixed-btn) {
  background-image: linear-gradient(to right, var(--gk-chrome-grad-from), var(--gk-chrome-grad-to));
}
html[class*="gk-theme-"] .btn-gradient:not(.gk-create-btn):not(.gk-update-btn):not(.gk-fixed-btn):hover {
  background-image: linear-gradient(
    to right,
    color-mix(in srgb, var(--gk-chrome-grad-from) 88%, #000),
    color-mix(in srgb, var(--gk-chrome-grad-to) 88%, #000)
  );
}
/* The note's read/edit toggle paints its gradient via .modal-footer-btn--mode
   with !important, so it needs its own themed override (same scoping rule:
   GlassKeep keeps the base indigo->violet). Only the gradient changes. */
html[class*="gk-theme-"] .modal-footer-btn--mode,
html[class*="gk-theme-"] .modal-footer-labeled-btn.modal-footer-btn--mode {
  background: linear-gradient(90deg, var(--gk-chrome-grad-from) 0%, var(--gk-chrome-grad-to) 100%) !important;
  /* Halo on hover only. */
  box-shadow: none !important;
}
@media (hover: hover) {
  html[class*="gk-theme-"] .modal-footer-btn--mode:hover,
  html[class*="gk-theme-"] .modal-footer-labeled-btn.modal-footer-btn--mode:hover {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--gk-chrome-grad-from) 88%, #000) 0%,
      color-mix(in srgb, var(--gk-chrome-grad-to) 88%, #000) 100%
    ) !important;
    box-shadow: 0 8px 18px color-mix(in srgb, var(--gk-chrome-grad-from) 45%, transparent) !important;
  }
}
/* Toggle switches in the Settings / Admin panels: "on" colour follows the
   theme (GlassKeep keeps indigo-600 from :root). Also retint the button glow
   tokens to the theme accent (same subtle rest / stronger hover balance). */
html[class*="gk-theme-"] {
  --gk-switch-on: var(--gk-chrome-grad-from);
  --gk-btn-glow: color-mix(in srgb, var(--gk-chrome-grad-from) 22%, transparent);
  --gk-btn-glow-hover: color-mix(in srgb, var(--gk-chrome-grad-from) 34%, transparent);
}
/* Text-field focus ring follows the theme. Scoped to form fields so it only
   recolours the "box" that appears around a text zone on click/focus; the
   ring geometry (ring-2) still comes from the element's own utilities.
   GlassKeep (no theme class) keeps the indigo ring. */
html[class*="gk-theme-"] :is(input, textarea, select):focus {
  --tw-ring-color: var(--gk-chrome-accent);
}
/* Settings/Admin accordion body. Clipped while collapsed AND during the
   open/close transition so the grid-rows animation hides content cleanly;
   once open it switches to visible (after the 300ms expand, via a discrete
   transition-delay) so a button's hover glow or a focus ring on the last row
   isn't clipped at the section's bottom edge. Closing removes .is-open with
   no delay, restoring the clip immediately for a clean collapse. */
.gk-acc-body { overflow: hidden; transition: overflow 0s; }
.gk-acc-body.is-open { overflow-x: clip; overflow-y: visible; transition: overflow 0s 300ms; }
button, [role="button"] { cursor: pointer; }
/* Selection rules:
 *  - Body allows text selection so users can copy titles, error
 *    messages, slogans, recovery keys, etc. with the mouse.
 *  - Buttons opt back to user-select:none so a click doesn't drag-
 *    select the label. .note-card already has user-select:none
 *    defined further down in this file.
 *  - We deliberately do NOT touch caret-color anymore: browsers only
 *    paint the blinking caret on real editable elements (input,
 *    textarea, contenteditable=true), which is exactly the behaviour
 *    we want. Forcing caret-color: transparent on everything broke
 *    the Tiptap rich-text editor because caret-color is inherited —
 *    the rule cascaded into the editor's child <p> elements where
 *    the caret actually lives, hiding it in edit mode. (Carets on
 *    non-editable elements via F7 caret-browsing are an explicit
 *    accessibility opt-in by the user; we don't override it.) */
body { -webkit-user-select: text; user-select: text; }
input, textarea, [contenteditable="true"] {
  -webkit-user-select: text;
  user-select: text;
}
button, [role="button"] {
  -webkit-user-select: none;
  user-select: none;
}
body {
  /* Notes canvas — theme-driven via --gk-app-bg / --gk-app-bg-image so the
     main area follows the active workspace theme (light + dark cascade from
     the token blocks). GlassKeep keeps the exact validated lavender → blue →
     pink sweep. Stays clearly lighter than the bordered/shadowed chrome. */
  background-color: var(--gk-app-bg);
  background-image: var(--gk-app-bg-image);
  background-attachment: fixed;
  color: var(--text-light);
  transition: background-color 0.3s ease, color 0.3s ease;
}
/* Mobile PWA bottom system-bar tint — best effort. When an installed PWA is
   edge-to-edge under the Android navigation bar (gesture nav / newer Android),
   safe-area-inset-bottom > 0 and the browser samples the pixels behind the bar
   to colour it. Paint that strip with the chrome colour so, where the platform
   allows it, the nav bar matches the theme like the status bar.

   NOTE: on devices that letterbox the PWA between the bars (e.g. 3-button nav
   on older Android), safe-area-inset-bottom is 0 — the page never reaches the
   nav-bar region, so the bar stays the browser default and there is no web hook
   to recolour it (the native app uses the Android navigationBarColor API).

   Uses env(safe-area-inset-bottom) directly (NOT --safe-bottom): inside the
   native Android WebView that env() resolves to 0, so the strip has zero height
   there and the native navbar handling is left untouched. pointer-events:none
   + low z-index keep it clear of the FAB and bottom sheets. */
@media (display-mode: standalone) and (pointer: coarse) {
  body::after {
    content: "";
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: env(safe-area-inset-bottom);
    background: var(--gk-statusbar);
    z-index: 1;
    pointer-events: none;
    transition: background-color 0.3s ease;
  }
}
`;
