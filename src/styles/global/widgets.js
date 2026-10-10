// Popover arrows, the decorative floating cards (login and admin backdrop
// preview) and range sliders.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const widgetsCSS = `
/* Popover arrow — CSS-only via data-arrow attribute */
[data-arrow]::after {
  content: "";
  position: absolute;
  width: 12px;
  height: 12px;
  background: inherit;
  left: var(--arrow-left, 50%);
  transform: rotate(45deg);
  z-index: 1;
}
[data-arrow="up"]::after {
  top: -6px;
  border-left: 1px solid var(--border-light);
  border-top: 1px solid var(--border-light);
}
[data-arrow="down"]::after {
  bottom: -6px;
  border-right: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
}

/* Login decorative floating cards */
/* Fade in from 0 to the element's own opacity, held at 0 through the delay
   (backwards fill). No forwards fill on purpose: a finished animation that
   keeps filling still counts as a live opacity animation, and the browser
   then composited the whole full-screen layer through an extra off-screen
   pass on every frame, for as long as the page stayed open. */
@keyframes fadeInDecoCards {
  from { opacity: 0; }
}
.floating-cards-bg {
  /* Overrides the pre-injection hide in index.css. */
  opacity: 1;
  animation: fadeInDecoCards 0.6s ease 0.3s backwards;
}
@keyframes floatCard {
  0%   { transform: translateY(0px) rotate(var(--rot)); }
  50%  { transform: translateY(-18px) rotate(var(--rot)); }
  100% { transform: translateY(0px) rotate(var(--rot)); }
}
.login-deco-card {
  position: absolute;
  pointer-events: none;
  background-color: var(--card-bg-light);
  /* No backdrop-filter here on purpose: these cards animate forever
     (floatCard), and a moving element with backdrop-filter forces the GPU
     to re-rasterise the blurred backdrop every frame — ~17 cards × 60fps =
     a pegged GPU at idle (very visible on integrated graphics). The float
     is a pure transform (compositor-only, cheap); the translucent fill
     alone reads fine without the blur. */
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
  /* Touch / mobile: the .glass-card rule above already strips the header blur
     (!important). Make the header a FLAT block in the exact status-bar colour
     (--gk-statusbar) so the native status bar and the header read as one
     continuous surface — no gradient on mobile. The sidebar keeps its own
     fake-glass look. Also drop the top border + inset top highlight so there's
     no seam where the header meets the status bar; keep the bottom border +
     soft shadow to separate the header from the scrolling content. */
  header.glass-card {
    background: var(--gk-statusbar);
    border-top: 0;
    box-shadow:
      0 1px 2px var(--gk-chrome-shadow),
      0 6px 18px -12px var(--gk-chrome-shadow);
  }
  /* In dark, the html.dark .glass-card rule above (rgba(40,40,40,.92)) is more
     specific than header.glass-card, so without this the header fell back to
     that semi-transparent grey (looked black / not matching the sidebar).
     Re-assert the opaque status-bar colour at matching specificity. */
  html.dark header.glass-card {
    background: var(--gk-statusbar);
  }
  /* Sidebar matches the header on mobile: a flat, FULLY OPAQUE block in the
     same --gk-statusbar colour (no fake-glass gradient / translucency). */
  .gk-sidebar {
    background: var(--gk-statusbar);
  }
}
@media (max-width: 639px) {
  /* Keep only left-edge (1-3) and right-edge (13-15) cards on mobile */
  .floating-cards-bg > .login-deco-card:nth-child(n+4) { display: none; }
  .floating-cards-bg > .login-deco-card:nth-child(13),
  .floating-cards-bg > .login-deco-card:nth-child(14),
  .floating-cards-bg > .login-deco-card:nth-child(15) { display: block; }
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

/* Range slider (e.g. login-background blur). The filled portion is
   painted via an inline linear-gradient background set on the element
   (works in WebKit + Firefox); this block styles the rail height and a
   clearly-visible thumb that reads on both light and dark themes. */
.gk-range {
  -webkit-appearance: none;
  appearance: none;
  height: 8px;
  border-radius: 9999px;
  outline: none;
  cursor: pointer;
}
.gk-range::-webkit-slider-runnable-track {
  height: 8px;
  border-radius: 9999px;
  background: transparent;
}
.gk-range::-moz-range-track {
  height: 8px;
  border-radius: 9999px;
  background: transparent;
}
.gk-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  margin-top: -6px;
  border-radius: 9999px;
  background: #ffffff;
  border: 2px solid rgb(var(--rt-accent));
  box-shadow: 0 1px 4px rgba(var(--rt-accent), 0.45);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.gk-range::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border: 2px solid rgb(var(--rt-accent));
  border-radius: 9999px;
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(var(--rt-accent), 0.45);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.gk-range:hover::-webkit-slider-thumb { transform: scale(1.12); }
.gk-range:hover::-moz-range-thumb { transform: scale(1.12); }
.gk-range:focus-visible::-webkit-slider-thumb,
.gk-range:active::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgba(var(--rt-accent), 0.25); }
.gk-range:focus-visible::-moz-range-thumb,
.gk-range:active::-moz-range-thumb { box-shadow: 0 0 0 4px rgba(var(--rt-accent), 0.25); }
html.dark .gk-range::-webkit-slider-thumb {
  background: #e5e7eb;
  border-color: color-mix(in srgb, rgb(var(--rt-accent)) 65%, #fff);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
}
html.dark .gk-range::-moz-range-thumb {
  background: #e5e7eb;
  border-color: color-mix(in srgb, rgb(var(--rt-accent)) 65%, #fff);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
}
`;
