import React from "react";
import DecoCard from "./DecoCard.jsx";

const CARDS = [
  // Colonne gauche
  { rot: "-12deg", dur: "7s", delay: "0s", pos: { top: "5%", left: "2%" }, color: "99,102,241", lines: ["90%", "75%", "60%"] },
  { rot: "5deg", dur: "9s", delay: "-2s", pos: { top: "32%", left: "1%" }, color: "168,85,247", lines: ["85%", "55%"] },
  { rot: "8deg", dur: "8s", delay: "-4s", pos: { top: "60%", left: "3%" }, color: "16,185,129", lines: ["80%", "65%", "45%"] },
  { rot: "-6deg", dur: "10s", delay: "-7s", pos: { top: "83%", left: "5%" }, color: "245,158,11", lines: ["78%", "55%"] },
  // Colonne centre-gauche
  { rot: "10deg", dur: "8.5s", delay: "-1.5s", pos: { top: "12%", left: "22%" }, color: "249,115,22", lines: ["82%", "64%", "50%"] },
  { rot: "-7deg", dur: "9.5s", delay: "-6s", pos: { top: "46%", left: "20%" }, color: "14,165,233", lines: ["88%", "58%"] },
  { rot: "13deg", dur: "7.5s", delay: "-3.5s", pos: { top: "75%", left: "25%" }, color: "132,204,22", lines: ["76%", "52%", "68%"] },
  // Colonne centre
  { rot: "-4deg", dur: "11s", delay: "-0.5s", pos: { top: "4%", left: "44%" }, color: "236,72,153", lines: ["90%", "70%"] },
  { rot: "9deg", dur: "9s", delay: "-8s", pos: { top: "80%", left: "48%" }, color: "20,184,166", lines: ["74%", "88%", "55%"] },
  // Colonne centre-droite
  { rot: "-9deg", dur: "10.5s", delay: "-2.5s", pos: { top: "10%", left: "65%" }, color: "244,63,94", lines: ["76%", "92%", "55%"] },
  { rot: "7deg", dur: "8s", delay: "-7s", pos: { top: "44%", left: "63%" }, color: "99,102,241", lines: ["80%", "62%"] },
  { rot: "-11deg", dur: "9s", delay: "-4.5s", pos: { top: "73%", left: "67%" }, color: "168,85,247", lines: ["85%", "60%", "72%"] },
  // Colonne droite
  { rot: "6deg", dur: "10s", delay: "-1s", pos: { top: "6%", right: "3%" }, color: "16,185,129", lines: ["88%", "70%"] },
  { rot: "-8deg", dur: "7.5s", delay: "-3s", pos: { top: "35%", right: "2%" }, color: "245,158,11", lines: ["90%", "60%", "78%"] },
  { rot: "-15deg", dur: "11s", delay: "-5s", pos: { top: "62%", right: "4%" }, color: "249,115,22", lines: ["75%", "50%"] },
  { rot: "4deg", dur: "8s", delay: "-9s", pos: { top: "85%", right: "6%" }, color: "14,165,233", lines: ["82%", "66%", "50%"] },
];

/** Decorative floating background cards — fixed wallpaper, z-1 keeps it below all UI (desktop only) */
// The float pauses while the user scrolls: see useScrollActivity.
export default function FloatingCardsBackground() {
  return (
    <div aria-hidden="true" className="floating-cards-bg" style={{position:"fixed",inset:0,zIndex:1,pointerEvents:"none",overflow:"hidden"}}>
      {CARDS.map((card, i) => <DecoCard key={i} {...card} />)}
    </div>
  );
}
