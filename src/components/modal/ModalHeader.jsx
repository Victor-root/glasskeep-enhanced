import React, { useRef, useEffect, useCallback } from "react";
import { PinOutline, PinFilled, CloseIcon } from "../../icons/index.jsx";
import FormatToolbar from "../common/FormatToolbar.jsx";
import Popover from "../common/Popover.jsx";
import { modalBgFor } from "../../utils/colors.js";
import { t } from "../../i18n";

/**
 * Sticky header of the note modal — title input, save/pin/close buttons,
 * desktop formatting toolbar.
 * Purely presentational: all handlers are passed via props.
 *
 * After refactor: only save checkmark, pin and close remain in header.
 * All action tools (color, image, tags, collaborate, archive, trash,
 * download, edit/view) have moved to ModalFooter (Google Keep style).
 *
 * Mobile: sticky bar is slim (icons only), title scrolls with content.
 */
export default function ModalHeader({
  dark,
  mColor,
  mTitle,
  setMTitle,
  mType,
  viewMode,
  windowWidth,
  // formatting (mobile popover)
  modalFmtBtnRef,
  showModalFmt,
  setShowModalFmt,
  onFormatModal,
  // pin
  onTogglePin,
  activeId,
  notes,
  tagFilter,
  // close
  onClose,
  // save
  modalHasChanges,
  savingModal,
  onSave,
}) {
  const mobileTitleRef = useRef(null);
  const isDesktop = windowWidth >= 768;
  const isPinned = !!notes.find((n) => String(n.id) === String(activeId))?.pinned;
  const showPinBtn = tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED";

  /* ── auto-resize mobile title textarea on mount & content change ── */
  const autoResizeTitle = useCallback((el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  useEffect(() => {
    if (!isDesktop && mobileTitleRef.current) {
      autoResizeTitle(mobileTitleRef.current);
    }
  }, [mTitle, isDesktop, autoResizeTitle]);

  return (
    <>
      {/* ── Sticky toolbar ── */}
      <div
        className="sticky top-0 z-20 rounded-t-none sm:rounded-t-xl"
        style={{ backgroundColor: modalBgFor(mColor, dark) }}
      >
        <div className={`flex items-center ${isDesktop ? "flex-wrap gap-2 px-4 sm:px-6 pt-4 pb-3" : "justify-end px-3 py-1.5"}`}>

          {/* Desktop: title inline */}
          {isDesktop && (
            <input
              className="flex-[1_0_50%] min-w-0 sm:min-w-[240px] shrink-0 pr-2 order-first bg-transparent font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none"
              value={mTitle}
              onChange={(e) => setMTitle(e.target.value)}
              placeholder={t("noteTitle")}
            />
          )}

          <div className={`flex items-center flex-none ${isDesktop ? "ml-auto" : ""}`}>
            <div className={isDesktop ? "modal-icon-group" : "flex items-center gap-0.5"}>
              {/* Save check */}
              <button
                onClick={modalHasChanges ? onSave : undefined}
                disabled={savingModal || !modalHasChanges}
                className={`modal-icon-btn flex-shrink-0 transition-all duration-200 ${modalHasChanges ? "modal-icon-btn--save-active" : "modal-icon-btn--save-idle"}`}
                data-tooltip={modalHasChanges ? (savingModal ? t("saving") : t("save")) : t("saved")}
                style={{ cursor: modalHasChanges ? "pointer" : "default" }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Pin */}
              {showPinBtn && (
                <button
                  className={`modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)] ${isPinned ? "modal-icon-btn--active" : ""}`}
                  data-tooltip={t("pinUnpin")}
                  onClick={() => activeId != null && onTogglePin(activeId, !isPinned)}
                >
                  {isPinned ? <PinFilled /> : <PinOutline />}
                </button>
              )}

              {/* Close */}
              <button
                className="modal-icon-btn modal-icon-btn--close focus:outline-none"
                data-tooltip={t("close")}
                onClick={onClose}
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        </div>

        {/* Formatting popover for mobile (anchored to format icon button in footer) */}
        {!isDesktop && mType === "text" && !viewMode && (
          <Popover
            anchorRef={modalFmtBtnRef}
            open={showModalFmt}
            onClose={() => setShowModalFmt(false)}
          >
            <FormatToolbar
              dark={dark}
              onAction={(type) => {
                setShowModalFmt(false);
                onFormatModal(type);
              }}
            />
          </Popover>
        )}

        {/* Desktop inline formatting toolbar (always visible in edit mode) */}
        {mType === "text" && !viewMode && isDesktop && (
          <div
            className={`px-4 sm:px-6 pt-2 pb-3 border-t flex flex-wrap items-center gap-1 ${
              dark ? "border-white/10" : "border-black/8"
            }`}
          >
            {(() => {
              const base = `fmt-btn ${dark ? "hover:bg-white/10" : "hover:bg-black/5"}`;
              return (
                <>
                  <button className={base} onClick={() => onFormatModal("h1")}>H1</button>
                  <button className={base} onClick={() => onFormatModal("h2")}>H2</button>
                  <button className={base} onClick={() => onFormatModal("h3")}>H3</button>
                  <span className="mx-1 opacity-40">|</span>
                  <button className={base} onClick={() => onFormatModal("bold")}><strong>B</strong></button>
                  <button className={base} onClick={() => onFormatModal("italic")}><em>I</em></button>
                  <button className={base} onClick={() => onFormatModal("strike")}><span className="line-through">S</span></button>
                  <button className={base} onClick={() => onFormatModal("code")}>`code`</button>
                  <button className={base} onClick={() => onFormatModal("codeblock")}>&lt;/&gt;</button>
                  <span className="mx-1 opacity-40">|</span>
                  <button className={base} onClick={() => onFormatModal("quote")}>&gt;</button>
                  <button className={base} onClick={() => onFormatModal("ul")}>{t("bulletListLabel")}</button>
                  <button className={base} onClick={() => onFormatModal("ol")}>{t("orderedListLabel")}</button>
                  <button className={base} onClick={() => onFormatModal("link")}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Mobile title — outside sticky, scrolls with content ── */}
      {!isDesktop && (
        <div className="px-5 pt-2 pb-1">
          <textarea
            ref={mobileTitleRef}
            className="w-full bg-transparent font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden"
            style={{ fontSize: "1.15rem", lineHeight: 1.3 }}
            rows={1}
            value={mTitle}
            onChange={(e) => setMTitle(e.target.value)}
            placeholder={t("noteTitle")}
          />
        </div>
      )}
    </>
  );
}
