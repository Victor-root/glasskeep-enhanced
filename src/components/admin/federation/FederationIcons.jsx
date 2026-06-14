// src/components/admin/federation/FederationIcons.jsx
//
// "Pair a server" motif: the server glyph with a SIMPLE "+" tucked into
// its bottom-right corner. The plus is drawn in its own (accent) colour
// with bold perpendicular strokes, so it reads clearly against the server
// at small sizes without any background disc or a second crowded glyph.

import React from "react";
import TI from "../../../icons/editor/index.jsx";

export function ServerPlusIcon({
  className = "",
  plusClassName = "text-[var(--gk-chrome-accent)]",
}) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <TI.Server className="tabler-icon w-full h-full" />
      <svg
        viewBox="0 0 24 24"
        className={`absolute ${plusClassName}`}
        style={{ right: "-24%", bottom: "-22%", width: "60%", height: "60%" }}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <path d="M12 6v12M6 12h12" />
      </svg>
    </span>
  );
}

// "Linked server" motif: the server glyph with a check tucked into its
// bottom-right corner. Sized in px because `.tabler-icon` pins the inner
// glyph to 20px and (loading after Tailwind) overrides any w-* class.
export function ServerCheckIcon({ size = 22, className = "", checkClassName = "" }) {
  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <TI.Server className="tabler-icon" style={{ width: size, height: size }} />
      <svg
        viewBox="0 0 24 24"
        className={`absolute ${checkClassName}`}
        style={{ right: "-26%", bottom: "-24%", width: "58%", height: "58%" }}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12l5 5l10 -10" />
      </svg>
    </span>
  );
}

// "This server's name" motif: the server glyph with a FILLED user tucked
// into its bottom-right corner. A solid shape reads more clearly at small
// sizes than the thin line badges earlier attempts used.
// "This server's name": the Tabler server-cog shell (a server with its
// bottom-right corner carved out) — but with a FILLED user dropped into
// the carved notch instead of a cog. The carve-out means the user sits in
// cleanly, no overlap/merge tricks; the fill makes it read clearly.
export function ServerUserIcon({
  className = "",
  userClassName = "text-[var(--gk-chrome-accent)]",
}) {
  // Two stacked 20px glyphs (matching the .tabler-icon size of the panel's
  // other section icons), centred in the span.
  const layer = {
    position: "absolute",
    inset: 0,
    margin: "auto",
    width: "83.333%",
    height: "83.333%",
  };
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        viewBox="0 0 24 24"
        style={layer}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 7a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-2" />
        <path d="M12 20h-6a3 3 0 0 1 -3 -3v-2a3 3 0 0 1 3 -3h10.5" />
        <path d="M7 8v.01" />
        <path d="M7 16v.01" />
      </svg>
      <svg viewBox="0 0 24 24" className={userClassName} style={layer} fill="currentColor">
        <g transform="translate(10.8 11.3) scale(0.6)">
          {/* head a touch above the shoulders (small gap); scaled up a bit
              so the figure fills the carved notch */}
          <path d="M12 3.5a5 5 0 1 1 -5 5l.005 -.217a5 5 0 0 1 4.995 -4.783z" />
          <path d="M14 14a5 5 0 0 1 5 5v1a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-1a5 5 0 0 1 5 -5h4z" />
        </g>
      </svg>
    </span>
  );
}
