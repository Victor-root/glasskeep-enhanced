import React from "react";
import { t } from "../../i18n";

// Grid of colour swatches for the toolbar popovers, with an optional
// "default" button underneath that clears the colour.
export default function Swatches({ colors, onPick, current, onClear, clearLabel }) {
  return (
    <div>
      <div className="rt-swatches">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            className={`rt-swatch${current === c ? " is-current" : ""}`}
            style={{ background: c }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(c)}
            aria-label={c}
          />
        ))}
      </div>
      {onClear && (
        <button
          type="button"
          className="rt-pop-clear"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
        >
          {clearLabel || t("fmtDefault")}
        </button>
      )}
    </div>
  );
}
