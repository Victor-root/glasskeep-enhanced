import React, { useRef, useState, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { trColorName, solid, bgFor } from "../../utils/colors.js";

/** ---------- Color Picker Panel ---------- */
export default function ColorPickerPanel({ anchorRef, open, onClose, colors, selectedColor, darkMode, onSelect }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, dropUp: false });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const panelW = 256;
      const spaceBelow = window.innerHeight - r.bottom;
      const dropUp = spaceBelow < 240;
      let left = Math.min(r.left, window.innerWidth - panelW - 8);
      left = Math.max(8, left);
      setPos({ top: dropUp ? r.top - 8 : r.bottom + 8, left, dropUp });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  const panelStyle = {
    position: "fixed",
    left: pos.left,
    zIndex: 99999,
    width: 256,
    ...(pos.dropUp
      ? { bottom: window.innerHeight - pos.top }
      : { top: pos.top }),
  };

  return createPortal(
    <div
      ref={panelRef}
      style={panelStyle}
      className={`rounded-2xl shadow-2xl backdrop-blur-xl border overflow-hidden ring-1 ring-black/5 dark:ring-white/5 p-3 ${
        darkMode
          ? "bg-gray-900/98 border-gray-700/50"
          : "bg-white/98 border-gray-100/80"
      }`}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 48px)", gap: "12px" }}>
        {colors.map((name) => (
          <button
            key={name}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(name); onClose(); }}
            aria-label={trColorName(name)}
            data-tooltip={trColorName(name)}
            className={`w-12 h-12 rounded-full transition-transform active:scale-95 hover:scale-110 focus:outline-none flex items-center justify-center ${
              name === "default"
                ? "border-2 border-gray-300 dark:border-gray-500"
                : ""
            } ${
              selectedColor === name
                ? "ring-[3px] ring-indigo-500 ring-offset-2 dark:ring-offset-gray-900"
                : ""
            }`}
            style={{
              backgroundColor:
                name === "default" ? "transparent" : solid(bgFor(name, darkMode)),
            }}
          >
            {name === "default" && (
              <div
                className="w-8 h-8 rounded-full"
                style={{ backgroundColor: darkMode ? "#1f2937" : "#fff" }}
              />
            )}
            {selectedColor === name && name !== "default" && (
              <svg className="w-5 h-5 text-white drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
