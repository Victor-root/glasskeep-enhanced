import React, { useRef, useEffect, useCallback } from "react";
import { PinOutline, PinFilled, CloseIcon, DownloadIcon, FormatIcon, ArchiveIcon, Trash, AddImageIcon, Kebab } from "../../icons/index.jsx";
import PaletteColorIcon from "../common/PaletteColorIcon.jsx";
import ColorPickerPanel from "../common/ColorPickerPanel.jsx";
import FormatToolbar from "../common/FormatToolbar.jsx";
import Popover from "../common/Popover.jsx";
import { modalBgFor, COLOR_ORDER, LIGHT_COLORS } from "../../utils/colors.js";
import { t } from "../../i18n";

/**
 * Sticky header of the note modal — title input, action buttons,
 * desktop formatting toolbar.
 * Purely presentational: all handlers are passed via props.
 *
 * Responsive behaviour:
 *   Both desktop and mobile show all action buttons inline (colored icons).
 *   Desktop (≥ 768): title left, buttons right, inline formatting toolbar below.
 *   Mobile  (< 768): buttons top-row, title wraps below (textarea for multiline),
 *                     formatting via popover button.
 */
export default function ModalHeader({
  dark,
  mColor,
  mTitle,
  setMTitle,
  mType,
  viewMode,
  windowWidth,
  // view/edit toggle
  onToggleViewMode,
  // collaboration
  onOpenCollaboration,
  // formatting (mobile popover)
  modalFmtBtnRef,
  showModalFmt,
  setShowModalFmt,
  onFormatModal,
  // color picker
  setMColor,
  modalColorBtnRef,
  showModalColorPop,
  setShowModalColorPop,
  // kebab menu (desktop: download + archive)
  modalMenuBtnRef,
  modalMenuOpen,
  setModalMenuOpen,
  // image upload
  modalFileRef,
  addImagesToState,
  setMImages,
  // actions
  activeId,
  notes,
  tagFilter,
  activeNoteObj,
  onDownloadNote,
  onRestoreFromTrash,
  onArchiveNote,
  onOpenConfirmDelete,
  // pin
  onTogglePin,
  // close
  onClose,
  // scroll ref (for view/edit toggle scroll ratio save)
  modalScrollRef,
  savedModalScrollRatioRef,
}) {
  const mobileTitleRef = useRef(null);
  const isDesktop = windowWidth >= 768;
  const isPinned = !!notes.find((n) => String(n.id) === String(activeId))?.pinned;
  const showPinBtn = tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED";
  const isTrashed = tagFilter === "TRASHED";

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

  /* ── shared action handlers ────────────────────────────────── */
  const handleDownload = () => {
    const n = notes.find((nn) => String(nn.id) === String(activeId));
    if (n) onDownloadNote(n);
  };

  const handleArchiveToggle = () => {
    const note = notes.find((nn) => String(nn.id) === String(activeId));
    if (note) onArchiveNote(activeId, !note.archived);
  };

  const handleToggleViewMode = () => {
    const el = modalScrollRef.current;
    const maxScroll = el ? el.scrollHeight - el.clientHeight : 0;
    savedModalScrollRatioRef.current = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
    onToggleViewMode();
  };

  return (
    <div
      className="sticky top-0 z-20 pt-4 modal-header-blur rounded-t-none sm:rounded-t-xl"
      style={{ backgroundColor: modalBgFor(mColor, dark) }}
    >
      <div className={`flex flex-wrap items-center gap-2 px-4 sm:px-6 pb-3 ${!isDesktop ? "flex-row-reverse" : ""}`}>
        <div className={`flex items-center gap-2 flex-none ${isDesktop ? "ml-auto" : ""}`}>
          {/* Icon buttons group – pill container */}
          <div className="modal-icon-group">

          {/* View/Edit toggle — text notes only */}
          {mType === "text" && (
            <button
              className="modal-icon-btn modal-icon-btn--mode btn-gradient hover:scale-[1.03] active:scale-[0.98]"
              onClick={handleToggleViewMode}
              data-tooltip={viewMode ? t("switchToEditMode") : t("switchToViewMode")}
              aria-label={viewMode ? t("editMode") : t("viewMode")}
            >
              {viewMode ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Z" fill="currentColor" />
                  <path d="m14.06 4.94 3.75 3.75 1.41-1.41a1.5 1.5 0 0 0 0-2.12l-1.63-1.63a1.5 1.5 0 0 0-2.12 0l-1.41 1.41Z" fill="currentColor" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Z" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="12" cy="12" r="3.2" fill="currentColor" />
                </svg>
              )}
            </button>
          )}

          {/* Collaborate */}
          <button
            className="modal-icon-btn modal-icon-btn--collab focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
            data-tooltip={t("collaborate")}
            onClick={onOpenCollaboration}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
            </svg>
            <svg className="w-3 h-3 absolute -top-1 -right-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
            </svg>
          </button>

          {/* Formatting popover button — mobile only (desktop uses inline toolbar below) */}
          {!isDesktop && mType === "text" && !viewMode && (
            <button
              ref={modalFmtBtnRef}
              className="modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
              data-tooltip={t("formatting")}
              onClick={(e) => {
                e.stopPropagation();
                setShowModalFmt((v) => !v);
              }}
            >
              <FormatIcon />
            </button>
          )}

          {/* Add images — visible in edit mode for text, always for checklist */}
          {(mType === "checklist" || (mType === "text" && !viewMode)) && (
            <>
              <input
                ref={modalFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files;
                  if (f && f.length) await addImagesToState(f, setMImages);
                  e.target.value = "";
                }}
              />
              <button
                className="modal-icon-btn modal-icon-btn--image focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                data-tooltip={t("addImages")}
                onClick={() => modalFileRef.current?.click()}
              >
                <AddImageIcon />
              </button>
            </>
          )}

          {/* Color picker — visible in edit mode for text, always for checklist */}
          {(mType === "checklist" || (mType === "text" && !viewMode)) && (
            <>
              <button
                ref={modalColorBtnRef}
                className="modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                data-tooltip={t("color")}
                onClick={() => setShowModalColorPop((v) => !v)}
              >
                <PaletteColorIcon size={20} />
              </button>
              <ColorPickerPanel
                anchorRef={modalColorBtnRef}
                open={showModalColorPop}
                onClose={() => setShowModalColorPop(false)}
                colors={COLOR_ORDER.filter((name) => LIGHT_COLORS[name])}
                selectedColor={mColor}
                darkMode={dark}
                onSelect={(name) => setMColor(name)}
              />
            </>
          )}

          {/* Download & Archive — inline on mobile, kebab menu on desktop */}
          {!isDesktop ? (
            <>
              <button
                className="modal-icon-btn modal-icon-btn--download focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                data-tooltip={t("downloadMd")}
                onClick={handleDownload}
              >
                <DownloadIcon />
              </button>
              {isTrashed ? (
                <button
                  className="modal-icon-btn modal-icon-btn--archive focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                  data-tooltip={t("restoreFromTrash")}
                  onClick={() => { onRestoreFromTrash(activeId); }}
                >
                  <ArchiveIcon />
                </button>
              ) : (
                <button
                  className="modal-icon-btn modal-icon-btn--archive focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                  data-tooltip={activeNoteObj?.archived ? t("unarchive") : t("archive")}
                  onClick={handleArchiveToggle}
                >
                  <ArchiveIcon />
                </button>
              )}
            </>
          ) : (
            <>
              <button
                ref={modalMenuBtnRef}
                className="modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                data-tooltip={t("moreOptions")}
                onClick={(e) => {
                  e.stopPropagation();
                  setModalMenuOpen((v) => !v);
                }}
              >
                <Kebab />
              </button>
              <Popover
                anchorRef={modalMenuBtnRef}
                open={modalMenuOpen}
                onClose={() => setModalMenuOpen(false)}
              >
                <div
                  className={`min-w-[180px] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
                  style={{ backgroundColor: dark ? "#222222" : undefined }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      handleDownload();
                      setModalMenuOpen(false);
                    }}
                  >
                    <DownloadIcon />{t("downloadMd")}
                  </button>
                  {isTrashed ? (
                    <button
                      className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                      onClick={() => {
                        onRestoreFromTrash(activeId);
                        setModalMenuOpen(false);
                      }}
                    >
                      <ArchiveIcon />{t("restoreFromTrash")}
                    </button>
                  ) : (
                    <button
                      className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                      onClick={() => {
                        handleArchiveToggle();
                        setModalMenuOpen(false);
                      }}
                    >
                      <ArchiveIcon />
                      {activeNoteObj?.archived ? t("unarchive") : t("archive")}
                    </button>
                  )}
                </div>
              </Popover>
            </>
          )}

          {/* Delete */}
          <button
            className="modal-icon-btn modal-icon-btn--trash focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
            data-tooltip={isTrashed ? t("permanentlyDelete") : t("moveToTrash")}
            onClick={onOpenConfirmDelete}
          >
            <Trash />
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
          </div>{/* end icon pill group */}
        </div>

        {/* Title — input on desktop (single line), textarea on mobile (wraps long titles) */}
        {isDesktop ? (
          <input
            className="flex-[1_0_50%] min-w-0 sm:min-w-[240px] shrink-0 pr-2 order-first bg-transparent font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none"
            value={mTitle}
            onChange={(e) => setMTitle(e.target.value)}
            placeholder={t("noteTitle")}
          />
        ) : (
          <textarea
            ref={mobileTitleRef}
            className="w-full mt-1 bg-transparent font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden"
            style={{ fontSize: "1.25rem", lineHeight: 1.3 }}
            rows={1}
            value={mTitle}
            onChange={(e) => setMTitle(e.target.value)}
            placeholder={t("noteTitle")}
          />
        )}
      </div>

      {/* Formatting popover for mobile (anchored to format icon button) */}
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
  );
}
