import React from "react";
import PaletteColorIcon from "../common/PaletteColorIcon.jsx";
import ColorPickerPanel, { ColorSwatchGrid } from "../common/ColorPickerPanel.jsx";
import Sheet from "../common/Sheet.jsx";
import { COLOR_ORDER, LIGHT_COLORS } from "../../utils/colors.js";
import { t } from "../../i18n";

const NOTE_COLORS = COLOR_ORDER.filter((name) => LIGHT_COLORS[name]);

// Note colour button of the modal footer: a popover panel on desktop, a
// bottom sheet of labelled swatches on phones.
export default function FooterColorButton({
  dark,
  isDesktop,
  btnClass,
  sheetBg,
  mColor,
  setMColor,
  modalColorBtnRef,
  showModalColorPop,
  setShowModalColorPop,
}) {
  return (
    <>
      <button
        ref={modalColorBtnRef}
        className={`${btnClass} focus:outline-none`}
        onClick={() => setShowModalColorPop((v) => !v)}
        data-tooltip={!isDesktop ? t("color") : undefined}
      >
        <PaletteColorIcon size={16} />
        {isDesktop && <span>{t("color")}</span>}
      </button>
      {isDesktop ? (
        <ColorPickerPanel
          anchorRef={modalColorBtnRef}
          open={showModalColorPop}
          onClose={() => setShowModalColorPop(false)}
          colors={NOTE_COLORS}
          selectedColor={mColor}
          darkMode={dark}
          onSelect={(name) => setMColor(name)}
        />
      ) : (
        <Sheet open={showModalColorPop} onClose={() => setShowModalColorPop(false)} title={t("color")} background={sheetBg}>
          <div className="px-1 pt-1 pb-3">
            <ColorSwatchGrid
              labeled
              colors={NOTE_COLORS}
              selectedColor={mColor}
              darkMode={dark}
              onSelect={(name) => { setMColor(name); setShowModalColorPop(false); }}
            />
          </div>
        </Sheet>
      )}
    </>
  );
}
