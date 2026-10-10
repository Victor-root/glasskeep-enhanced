import React from "react";
import { t } from "../../i18n";
import { Popover } from "./Popover.jsx";
import { DEFAULT_FONT_SIZE, FONT_SIZES } from "./toolbarPresets.js";

// Font size list. The default size is marked and picking it removes the
// explicit size.
export default function FontSizePopover({ editor, anchorRef, open, onClose }) {
  const current = editor.getAttributes("textStyle")?.fontSize || "";
  const pick = (v) => {
    const chain = editor.chain().focus();
    // Clicking the "default" size removes the explicit attribute so the
    // text goes back to inheriting whatever the block's default size is.
    if (!v || v === DEFAULT_FONT_SIZE) chain.unsetFontSize().run();
    else chain.setFontSize(v).run();
    onClose?.();
  };
  // Whether the "default" marker is effectively active: no explicit size OR
  // explicit size equal to the default.
  const defaultActive = !current || current === DEFAULT_FONT_SIZE;
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--fontsize">
      {FONT_SIZES.map((s) => {
        const isDefault = s === DEFAULT_FONT_SIZE;
        const isCurrent = isDefault ? defaultActive : current === s;
        return (
          <button
            key={s}
            type="button"
            className={`rt-size-row${isCurrent ? " is-current" : ""}${isDefault ? " rt-size-row--is-default" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(s)}
          >
            <span className="rt-size-value">{s.replace("px", "")}</span>
            {isDefault && <span className="rt-size-default-badge">{t("fmtDefault")}</span>}
          </button>
        );
      })}
    </Popover>
  );
}
