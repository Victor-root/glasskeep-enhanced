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
