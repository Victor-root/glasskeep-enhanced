import React from "react";

// One decorative floating note card (.login-deco-card) of the login and app
// backdrops: tilt, float timing, position, accent colour ("r,g,b") and the
// widths of its text lines. `wideOnly` hides it below the md breakpoint.
export default function DecoCard({ rot, dur, delay, pos, color, lines, wideOnly = false }) {
  return (
    <div
      className={wideOnly ? "login-deco-card hidden md:block" : "login-deco-card"}
      style={{ "--rot": rot, "--dur": dur, "--delay": delay, ...pos, borderTop: `3px solid rgba(${color},0.7)` }}
    >
      <div className="deco-title" style={{ background: `rgba(${color},0.5)` }} />
      {lines.map((width, i) => (
        <div key={i} className="deco-line" style={{ width }} />
      ))}
    </div>
  );
}
