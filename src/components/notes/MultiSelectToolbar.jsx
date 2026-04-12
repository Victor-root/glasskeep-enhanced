import React, { useRef, useState } from "react";
import { t } from "../../i18n";
import { CloseIcon, PinIcon, ArchiveIcon } from "../../icons/index.jsx";
import ColorPickerPanel from "../common/ColorPickerPanel.jsx";
import { COLOR_ORDER, LIGHT_COLORS } from "../../utils/colors.js";

export default function MultiSelectToolbar({
  multiMode,
  dark,
  activeTagFilter,
  selectedIds,
  onBulkDownloadZip,
  onBulkRestore,
  onBulkDelete,
  onBulkColor,
  onBulkPin,
  onBulkArchive,
  onExitMulti,
  headerVisible,
}) {
  const multiColorBtnRef = useRef(null);
  const [showMultiColorPop, setShowMultiColorPop] = useState(false);

  if (!multiMode) return null;

  return (
        <div
          className="p-3 sm:p-4 flex items-center justify-between sticky top-0 z-[25] glass-card mb-2"
          style={{
            position: "sticky",
            transform: headerVisible === false ? "translateY(-100%)" : "translateY(0)",
            transition: "transform 0.3s ease",
          }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
              onClick={onBulkDownloadZip}
            >{t("downloadZip")}</button>
            {activeTagFilter === "TRASHED" ? (
              <>
                <button
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm flex items-center gap-1"
                  onClick={onBulkRestore}
                >{t("restoreFromTrash")}</button>
                <button
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm"
                  onClick={onBulkDelete}
                >{t("permanentlyDelete")}</button>
              </>
            ) : (
              <>
                <button
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm"
                  onClick={onBulkDelete}
                >{t("moveToTrash")}</button>
                <button
                  ref={multiColorBtnRef}
                  type="button"
                  onClick={() => setShowMultiColorPop((v) => !v)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
                  data-tooltip={t("color")}
                >{t("colorEmoji")}</button>
                <ColorPickerPanel
                  anchorRef={multiColorBtnRef}
                  open={showMultiColorPop}
                  onClose={() => setShowMultiColorPop(false)}
                  colors={COLOR_ORDER.filter((name) => LIGHT_COLORS[name])}
                  selectedColor={null}
                  darkMode={dark}
                  onSelect={(name) => { onBulkColor(name); }}
                />
                {activeTagFilter !== "ARCHIVED" && (
                  <button
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm flex items-center gap-1"
                    onClick={() => onBulkPin(true)}
                  >
                    <PinIcon />{t("pin")}</button>
                )}
                <button
                  className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm flex items-center gap-1"
                  onClick={onBulkArchive}
                >
                  <ArchiveIcon />
                  {activeTagFilter === "ARCHIVED" ? t("unarchive") : t("archive")}
                </button>
              </>
            )}
            <span className="text-xs opacity-70 ml-2">{t("selectedPrefix")} {selectedIds.length}
            </span>
          </div>
          <button
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            data-tooltip={t("exitMultiSelect")}
            onClick={onExitMulti}
          >
            <CloseIcon />
          </button>
        </div>
  );
}
