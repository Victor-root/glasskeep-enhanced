import React, { useEffect, useRef } from "react";
import { Popover } from "./Popover.jsx";
import { FONT_FAMILIES } from "./toolbarPresets.js";

// Font gallery, each row rendered in its own font.
export default function FontFamilyPopover({ editor, anchorRef, open, onClose }) {
  const current = editor.getAttributes("textStyle")?.fontFamily || "";
  const currentRowRef = useRef(null);
  const pick = (value) => {
    const chain = editor.chain().focus();
    if (value) chain.setFontFamily(value).run();
    else chain.unsetFontFamily().run();
    onClose?.();
  };
  // When the popover opens, centre the currently active font in the
  // scrollable list so the user doesn't have to hunt through the
  // alphabetic order each time. Direct scrollTop manipulation on the
  // immediate parent (the scroll container) keeps the side-effect
  // local: no risk of scrolling the document underneath.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const row = currentRowRef.current;
      if (!row) return;
      const container = row.parentElement;
      if (!container) return;
      const target = row.offsetTop - container.clientHeight / 2 + row.offsetHeight / 2;
      container.scrollTop = Math.max(0, target);
    });
  }, [open]);
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--font">
      {FONT_FAMILIES.map((f) => {
        const isCurrent = current === f.value;
        return (
          <button
            key={f.label}
            ref={isCurrent ? currentRowRef : null}
            type="button"
            className={`rt-font-row${isCurrent ? " is-current" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(f.value)}
            style={{ fontFamily: f.value || undefined }}
          >
            {f.label}
          </button>
        );
      })}
    </Popover>
  );
}
