import React, { useRef, useEffect, useCallback } from "react";
import { PinOutline, PinFilled, CloseIcon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
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
  isLandscapeMobile,
  isWebView,
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
  // drawing
  drawMode,
  drawToolbarMount,
  onToggleDrawMode,
  // keyboard: Tab from title → body (skip the toolbar buttons)
  onTitleTab,
  // External ref to the title <textarea> so the parent can focus it
  // from the body editor (e.g. Shift+Tab returns to the title).
  titleInputRef,
  // Rich-text editor toolbar is portaled into this slot (a ref to the
  // div we render below the header row, inside the sticky wrapper).
  toolbarSlotRef,
  // AI toggle — shown in header on mobile/non-sidebar layouts
  noteAiAvailable,
  noteAiSidebarLayout,
  noteAiOpen,
  noteAiHasBeenOpened,
  noteAiHasMessages,
  onOpenNoteAi,
  onHideNoteAi,
}) {
  const handleTitleKeyDown = (e) => {
    // Enter must never insert a newline in the title — titles render
    // single-line everywhere (note cards, view mode, etc.) and a
    // newline silently breaks layout. Pressing Enter instead hands
    // focus down to the body, mirroring how Google Keep treats it.
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (onTitleTab) onTitleTab();
      return;
    }
    if (e.key !== "Tab") return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!onTitleTab) return;
    e.preventDefault();
    onTitleTab();
  };
  // Defensive sanitiser: anything coming through the textarea (typing,
  // IME, paste, drag-and-drop) gets its newlines stripped before
  // landing in mTitle. Keeps the title strictly single-line even if a
  // user pastes a multi-line block from elsewhere.
  const handleTitleChange = (e) => {
    const v = e.target.value;
    if (v.includes("\n") || v.includes("\r")) {
      setMTitle(v.replace(/[\r\n]+/g, " "));
    } else {
      setMTitle(v);
    }
  };
  const mobileTitleRef = useRef(null);
  // Fan a single textarea ref out to BOTH the local mobileTitleRef
  // (used for auto-resize on content change) and the optional
  // titleInputRef the parent passes in (used for Shift+Tab focus
  // hand-back from the rich-text editor).
  const setTitleRef = useCallback((node) => {
    mobileTitleRef.current = node;
    if (titleInputRef) {
      if (typeof titleInputRef === "function") titleInputRef(node);
      else titleInputRef.current = node;
    }
  }, [titleInputRef]);
  const isDesktop = windowWidth >= 768 && !isLandscapeMobile && !isWebView;
  const isPinned = !!notes.find((n) => String(n.id) === String(activeId))?.pinned;
  const showPinBtn = tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED";
  const isDrawEdit = mType === 'draw' && drawMode === 'draw';

  /* ── auto-resize mobile title textarea on mount & content change ── */
  const autoResizeTitle = useCallback((el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  useEffect(() => {
    if (mobileTitleRef.current) {
      autoResizeTitle(mobileTitleRef.current);
    }
  }, [mTitle, autoResizeTitle]);

  return (
    <>
      {/* ── Sticky toolbar ── */}
      <div
        className={`sticky top-0 z-20 rounded-t-none ${isDrawEdit || isWebView ? '' : 'sm:rounded-t-xl'} ${isDrawEdit ? (dark ? 'border-b border-white/15' : 'border-b border-black/10') : ''}`}
        style={{ backgroundColor: modalBgFor(mColor, dark) }}
      >
        <div className={`flex items-center ${
          isDrawEdit
            ? (isDesktop ? "gap-1 px-2 py-1" : "px-1 py-1")
            : (isDesktop ? "flex-wrap gap-2 px-4 sm:px-6 pt-4 pb-3" : "px-2 py-1.5")
        }`}>

          {/* Mobile: back arrow on the left */}
          {!isDesktop && (
            <button
              className="modal-icon-btn focus:outline-none shrink-0"
              onClick={onClose}
              aria-label={t("close")}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Draw edit: note title on the left (desktop only) */}
          {isDrawEdit && isDesktop && mTitle && (
            <span className="text-sm font-semibold truncate max-w-[200px] shrink-0 pl-2">
              {mTitle}
            </span>
          )}

          {/* Draw edit: portal target for drawing toolbar (fills the space where title was) */}
          {isDrawEdit && (
            <div ref={drawToolbarMount} className="flex-1 min-w-0 overflow-visible py-1 flex justify-center" />
          )}

          {/* Desktop: title inline (hidden in draw edit mode).
              Checklist notes have no view/edit toggle — their items are
              always interactively editable — so the title must stay
              editable too, regardless of the viewMode flag. */}
          {isDesktop && !isDrawEdit && (
            (viewMode && mType !== "checklist") ? (
              <div
                className="flex-[1_0_50%] min-w-0 sm:min-w-[240px] shrink-0 pr-2 order-first font-bold whitespace-pre-wrap break-words select-text"
                aria-label={t("noteTitle")}
              >
                {mTitle}
              </div>
            ) : (
              <textarea
                ref={setTitleRef}
                className="flex-[1_0_50%] min-w-0 sm:min-w-[240px] shrink-0 pr-2 order-first bg-transparent font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden"
                rows={1}
                value={mTitle}
                onChange={handleTitleChange}
                onKeyDown={handleTitleKeyDown}
                placeholder={t("noteTitle")}
              />
            )
          )}

          {/* Spacer pushes right-side buttons on mobile (only when no toolbar filling the space) */}
          {!isDesktop && !isDrawEdit && <div className="flex-1" />}

          <div className={`flex items-center flex-none shrink-0 ${isDesktop && !isDrawEdit ? "ml-auto" : ""}`}>
            {/* Pin & Save grouped together */}
            <div className={isDesktop ? "modal-icon-group" : "flex items-center gap-0.5"}>
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
            </div>

            {/* AI toggle separated from pin/save — mobile/non-sidebar only.
                Shown whenever the panel has been opened (until closed with X).
                Lets user easily switch between note and panel views. */}
            {!isDesktop && !isDrawEdit && noteAiAvailable && !noteAiSidebarLayout && noteAiHasBeenOpened && (
              <>
                <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
                <button
                  className="modal-icon-btn modal-icon-btn--ai focus:outline-none relative"
                  style={{ width: "auto", paddingLeft: 4, paddingRight: 4 }}
                  onClick={() => noteAiOpen ? onHideNoteAi?.() : onOpenNoteAi?.()}
                  data-tooltip={t("noteAiChatMenuItem")}
                  aria-pressed={noteAiOpen ? "true" : "false"}
                >
                  <TI.MessageSearch className="tabler-icon" style={{ width: 26, height: 26 }} />
                  <TI.ChevronRight className="tabler-icon -ml-1" style={{ width: 22, height: 22 }} />
                  {noteAiHasMessages && !noteAiOpen && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500 ring-[1.5px] ring-white dark:ring-gray-800" />
                  )}
                </button>
              </>
            )}

            {/* Close (desktop only — mobile uses back arrow above) */}
            {isDesktop && (
              <button
                className="modal-icon-btn modal-icon-btn--close focus:outline-none"
                data-tooltip={t("close")}
                onClick={onClose}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>

        {/* Rich-text toolbar mount point. Lives inside the sticky header so
            it sits just below the title/save/close row and stays pinned
            while the note scrolls. The editor portals its toolbar here
            when showToolbar is true. */}
        <div ref={toolbarSlotRef || null} className="rt-toolbar-slot" />
      </div>

      {/* ── Mobile title — outside sticky, scrolls with content
            (hidden in draw edit mode). Same checklist exception as
            desktop: title stays editable since the body is. ── */}
      {!isDesktop && !(mType === 'draw' && drawMode === 'draw') && (
        <div className="px-5 pt-0 pb-1">
          {(viewMode && mType !== "checklist") ? (
            <div
              className="w-full font-bold whitespace-pre-wrap break-words select-text"
              style={{ fontSize: "1.15rem", lineHeight: 1.3, minHeight: "1.3em" }}
              aria-label={t("noteTitle")}
            >
              {mTitle}
            </div>
          ) : (
            <textarea
              ref={setTitleRef}
              className="w-full bg-transparent font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden"
              style={{ fontSize: "1.15rem", lineHeight: 1.3 }}
              rows={1}
              value={mTitle}
              onChange={handleTitleChange}
              onKeyDown={handleTitleKeyDown}
              placeholder={t("noteTitle")}
            />
          )}
        </div>
      )}
    </>
  );
}
