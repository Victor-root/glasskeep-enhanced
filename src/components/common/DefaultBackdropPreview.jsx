import React from "react";
import DecoCard from "./DecoCard.jsx";

// A few representative floating cards — a subset of the real login/app
// backdrop. Positioned across a virtual canvas that gets scaled down so
// several small cards fit inside a preview box.
const PREVIEW_LINES = ["85%", "60%"];
const PREVIEW_CARDS = [
  { rot: "-12deg", dur: "7s", delay: "0s", pos: { top: "6%", left: "5%" }, color: "99,102,241", lines: PREVIEW_LINES },
  { rot: "6deg", dur: "9s", delay: "-2s", pos: { top: "10%", left: "62%" }, color: "168,85,247", lines: PREVIEW_LINES },
  { rot: "8deg", dur: "8s", delay: "-4s", pos: { top: "55%", left: "8%" }, color: "16,185,129", lines: PREVIEW_LINES },
  { rot: "-8deg", dur: "10s", delay: "-1s", pos: { top: "52%", left: "66%" }, color: "245,158,11", lines: PREVIEW_LINES },
  { rot: "10deg", dur: "8.5s", delay: "-3s", pos: { top: "30%", left: "34%" }, color: "236,72,153", lines: PREVIEW_LINES },
  { rot: "-6deg", dur: "9.5s", delay: "-6s", pos: { top: "74%", left: "40%" }, color: "14,165,233", lines: PREVIEW_LINES },
];

// Mirror of the default backdrop (body gradient in light / solid dark)
// with the colored floating cards, scaled to fit a small preview box.
// Shown on a background-image setting when no custom image is configured,
// so the admin / user sees exactly what "no image" looks like. The
// .login-deco-card CSS already flips opacity/colors for dark mode, so
// this adapts to the active theme.
export default function DefaultBackdropPreview({ dark }) {
  const bg = dark
    ? "#1a1a1a"
    : "linear-gradient(135deg, #f0e8ff 0%, #e8f4fd 50%, #fde8f0 100%)";
  return (
    <div className="absolute inset-0" style={{ background: bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "278%",
          height: "278%",
          transform: "scale(0.36)",
          transformOrigin: "top left",
        }}
      >
        {PREVIEW_CARDS.map((card, i) => <DecoCard key={i} {...card} />)}
      </div>
    </div>
  );
}
