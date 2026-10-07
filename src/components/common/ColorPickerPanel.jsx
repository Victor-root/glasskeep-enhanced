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
      const arrowLeft = r.left + r.width / 2 - left - 6;
      setPos({ top: dropUp ? r.top - 8 : r.bottom + 8, left, dropUp, arrowLeft });
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

  const arrowDir = pos.dropUp ? "down" : "up";
  const nearLeft = (pos.arrowLeft || 0) < 20;
  const nearRight = (pos.arrowLeft || 0) > 220;

  return createPortal(
    <div
      ref={panelRef}
      data-arrow={arrowDir}
      style={{
        ...panelStyle,
        '--arrow-left': `${pos.arrowLeft || 0}px`,
        ...(nearLeft && arrowDir === "up" && { borderTopLeftRadius: '4px' }),
        ...(nearLeft && arrowDir === "down" && { borderBottomLeftRadius: '4px' }),
        ...(nearRight && arrowDir === "up" && { borderTopRightRadius: '4px' }),
        ...(nearRight && arrowDir === "down" && { borderBottomRightRadius: '4px' }),
      }}
      className={`rounded-2xl shadow-2xl backdrop-blur-xl border ring-1 ring-black/5 dark:ring-white/5 p-3 ${
        darkMode
          ? "bg-gray-900/98 border-gray-700/50"
          : "bg-white/98 border-gray-100/80"
      }`}
    >
      <ColorSwatchGrid
        colors={colors}
        selectedColor={selectedColor}
        darkMode={darkMode}
        onSelect={(name) => { onSelect(name); onClose(); }}
      />
    </div>,
    document.body
  );
}

/** The swatches themselves, shared by the desktop popover above and the
 *  mobile note color sheet. `labeled` lays them out as a fluid 4-column
 *  grid with each color's name under its swatch. */
export function ColorSwatchGrid({ colors, selectedColor, darkMode, onSelect, labeled = false }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: labeled ? "repeat(4, minmax(0, 1fr))" : "repeat(4, 48px)",
        gap: labeled ? "18px 8px" : "12px",
      }}
    >
      {colors.map((name) => {
        const swatch = (
          <button
            key={labeled ? undefined : name}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(name); }}
            aria-label={trColorName(name)}
            data-tooltip={labeled ? undefined : trColorName(name)}
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
        );
        if (!labeled) return swatch;
        return (
          <div key={name} className="flex flex-col items-center gap-1.5 min-w-0">
            {swatch}
            <span className={`text-xs truncate max-w-full ${selectedColor === name ? "font-semibold" : "opacity-70"}`}>
              {trColorName(name)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
