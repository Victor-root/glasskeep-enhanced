import React from "react";
import { createPortal } from "react-dom";
import { t } from "../../i18n";

// Colour swatches of a checklist section, in a portal under the header's
// colour dot; closes on a pointer down outside it.
export default function SectionColorPicker({ colors, colorKey, onChange, onClose, onOutsideClose, triggerRef }) {
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });

  React.useLayoutEffect(() => {
    const place = () => {
      const a = triggerRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      // 5 cols × 32px + 4 gaps × 8px + padding 2×8px = 216px
      const panelW = 216;
      let left = Math.min(r.left, window.innerWidth - panelW - 8);
      left = Math.max(8, left);
      setPos({ top: r.bottom + 6, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [triggerRef]);

  React.useEffect(() => {
    const onPointerDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (triggerRef?.current?.contains(e.target)) return;
      e.preventDefault();
      onOutsideClose(e);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onOutsideClose, triggerRef]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999 }}
      className="p-2 rounded-lg shadow-xl bg-white dark:bg-gray-800 border border-[var(--border-light)]"
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 2rem)", gap: "0.5rem" }}>
        {/* No-color option */}
        <button
          type="button"
          aria-label={t("noColor")}
          onClick={() => { onChange("none"); onClose(); }}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none"
          style={{
            boxShadow: colorKey === "none" ? "0 0 0 2px white, 0 0 0 3.5px #94a3b8" : "none",
          }}
        >
          <svg viewBox="0 0 24 24" className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>
        {colors.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-label={c.key}
            onClick={() => { onChange(c.key); onClose(); }}
            className="w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none"
            style={{
              background: c.hex,
              boxShadow: c.key === colorKey ? `0 0 0 2px white, 0 0 0 3.5px ${c.hex}` : "none",
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}
