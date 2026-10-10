import React from "react";
import { t } from "../../i18n";
import { Popover } from "./Popover.jsx";
import Swatches from "./Swatches.jsx";
import { PRESET_UNDERLINE_COLORS, UNDERLINE_STYLES } from "./toolbarPresets.js";

// Underline options: line style, line colour, and removing the underline.
export default function UnderlinePopover({ editor, anchorRef, open, onClose }) {
  const attrs = editor.getAttributes("underline") || {};
  const currentStyle = attrs.style || "simple";
  const currentColor = attrs.color || null;
  const apply = (next) => {
    const merged = { style: currentStyle, color: currentColor, ...next };
    // If turning underline on for the first time this keystroke, make sure
    // the mark is applied, otherwise just update its attributes.
    editor.chain().focus().setUnderline(merged).run();
  };
  const removeColor = () => apply({ color: null });
  const off = () => {
    editor.chain().focus().unsetMark("underline").run();
    onClose?.();
  };
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--underline">
      <div className="rt-pop-label">{t("fmtUnderlineStyleLabel")}</div>
      <div className="rt-ul-styles">
        {UNDERLINE_STYLES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`rt-ul-style${currentStyle === s.value ? " is-current" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply({ style: s.value })}
            data-tooltip={t(s.label)}
          >
            <span style={{ textDecoration: s.preview, textDecorationColor: currentColor || undefined }}>
              Aa
            </span>
          </button>
        ))}
      </div>
      <div className="rt-pop-label rt-pop-label--spaced">{t("fmtUnderlineColorLabel")}</div>
      <Swatches
        colors={PRESET_UNDERLINE_COLORS}
        onPick={(c) => apply({ color: c })}
        current={currentColor}
        onClear={removeColor}
        clearLabel={t("fmtDefault")}
      />
      <button
        type="button"
        className="rt-pop-clear rt-pop-clear--danger"
        onMouseDown={(e) => e.preventDefault()}
        onClick={off}
      >
        {t("fmtUnderlineRemove")}
      </button>
    </Popover>
  );
}
