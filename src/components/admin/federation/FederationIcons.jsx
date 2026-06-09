// src/components/admin/federation/FederationIcons.jsx
//
// The cross-server-collaboration motif: the server glyph with a small
// "user-plus" badge at its bottom-right corner — same server logo as
// elsewhere, just annotated. Used for the admin section header and the
// "pair a server" header.
//
// The badge is a solid accent-coloured disc with a white plus, so it
// reads cleanly on any background (the icon chip's own background is
// semi-transparent, so a punch-out mask wouldn't reliably hide the
// server strokes beneath). Accepts the usual icon sizing className.

import React from "react";
import TI from "../../../icons/editor/index.jsx";

export function ServerShareIcon({ className = "" }) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <TI.Server className="tabler-icon w-full h-full" />
      <span
        className="absolute flex items-center justify-center rounded-full"
        style={{
          right: "-20%",
          bottom: "-20%",
          width: "64%",
          height: "64%",
          background: "var(--gk-chrome-accent)",
          color: "#fff",
        }}
      >
        <TI.UserPlus className="tabler-icon" style={{ width: "78%", height: "78%" }} />
      </span>
    </span>
  );
}
