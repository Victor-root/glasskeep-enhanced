// src/components/admin/federation/FederationIcons.jsx
//
// The cross-server-collaboration motif: the server glyph with a small
// "user-plus" sitting at its bottom-right corner (no background — just the
// glyph on top), nudged mostly outside the server bounds so it stays
// legible. Used for the "pair a server" header.

import React from "react";
import TI from "../../../icons/editor/index.jsx";

export function ServerShareIcon({ className = "" }) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <TI.Server className="tabler-icon w-full h-full" />
      <TI.UserPlus
        className="tabler-icon absolute"
        style={{ right: "-24%", bottom: "-24%", width: "62%", height: "62%" }}
      />
    </span>
  );
}
