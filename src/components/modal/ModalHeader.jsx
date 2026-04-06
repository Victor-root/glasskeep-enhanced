import React from "react";
import { PinOutline, PinFilled, Kebab, CloseIcon, DownloadIcon, FormatIcon, ArchiveIcon, Trash } from "../../icons/index.jsx";
import FormatToolbar from "../common/FormatToolbar.jsx";
import Popover from "../common/Popover.jsx";
import { modalBgFor } from "../../utils/colors.js";
import { t } from "../../i18n";

/**
 * Sticky header of the note modal — title input, action buttons, kebab menu,
 * desktop formatting toolbar.
 * Purely presentational: all handlers are passed via props.
 *
 * Responsive behaviour:
 *   Desktop (≥ 768): all actions shown as inline icon buttons, no kebab menu.
 *   Mobile  (< 768): only Close + Kebab shown; all other actions live inside
 *                     the kebab popover as labelled menu items.
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
  // kebab menu
  modalMenuBtnRef,
  modalMenuOpen,
  setModalMenuOpen,
  // kebab menu actions
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
  const isDesktop = windowWidth >= 768;
  const isPinned = !!notes.find((n) => String(n.id) === String(activeId))?.pinned;
  const showPinBtn = tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED";
  const isTrashed = tagFilter === "TRASHED";

  const menuItemClass = `flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`;
  const menuItemDanger = `flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`;

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
        <div className={`flex items-center gap-2 flex-none ${!isDesktop ? "" : "ml-auto"}`}>
          {/* Icon buttons group – pill container */}
          <div className="modal-icon-group">

          {/* ══════════════════════════════════════════════════════════
              DESKTOP LAYOUT (≥ 768): all actions inline, no kebab
              ══════════════════════════════════════════════════════════ */}
          {isDesktop && (
            <>
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

              {/* Download */}
              <button
                className="modal-icon-btn modal-icon-btn--download focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
                data-tooltip={t("downloadMd")}
                onClick={handleDownload}
              >
                <DownloadIcon />
              </button>

              {/* Archive / Restore */}
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
            </>
          )}

          {/* ══════════════════════════════════════════════════════════
              MOBILE LAYOUT (< 768): View/Edit + Kebab + Close
              ══════════════════════════════════════════════════════════ */}
          {!isDesktop && (
            <>
              {/* View/Edit toggle — icon button, same gradient style as desktop */}
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
                  {/* Collaborate */}
                  <button
                    className={menuItemClass}
                    onClick={() => {
                      onOpenCollaboration();
                      setModalMenuOpen(false);
                    }}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                    </svg>
                    {t("collaborate")}
                  </button>

                  {/* Formatting — text notes in edit mode only */}
                  {mType === "text" && !viewMode && (
                    <button
                      ref={modalFmtBtnRef}
                      className={menuItemClass}
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalMenuOpen(false);
                        setTimeout(() => setShowModalFmt(true), 80);
                      }}
                    >
                      <FormatIcon />
                      {t("formatting")}
                    </button>
                  )}

                  {/* Pin / Unpin */}
                  {showPinBtn && (
                    <button
                      className={menuItemClass}
                      onClick={() => {
                        if (activeId != null) onTogglePin(activeId, !isPinned);
                        setModalMenuOpen(false);
                      }}
                    >
                      {isPinned ? <PinFilled /> : <PinOutline />}
                      {t("pinUnpin")}
                    </button>
                  )}

                  {/* Separator */}
                  <div className={`my-1 border-t ${dark ? "border-white/10" : "border-black/8"}`} />

                  {/* Download */}
                  <button
                    className={menuItemClass}
                    onClick={() => {
                      handleDownload();
                      setModalMenuOpen(false);
                    }}
                  >
                    <DownloadIcon />{t("downloadMd")}
                  </button>

                  {/* Archive / Restore / Delete */}
                  {isTrashed ? (
                    <>
                      <button
                        className={menuItemClass}
                        onClick={() => {
                          onRestoreFromTrash(activeId);
                          setModalMenuOpen(false);
                        }}
                      >
                        <ArchiveIcon />{t("restoreFromTrash")}
                      </button>
                      <button
                        className={menuItemDanger}
                        onClick={() => {
                          onOpenConfirmDelete();
                          setModalMenuOpen(false);
                        }}
                      >
                        <Trash />{t("permanentlyDelete")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={menuItemClass}
                        onClick={() => {
                          handleArchiveToggle();
                          setModalMenuOpen(false);
                        }}
                      >
                        <ArchiveIcon />
                        {activeNoteObj?.archived ? t("unarchive") : t("archive")}
                      </button>
                      <button
                        className={menuItemDanger}
                        onClick={() => {
                          onOpenConfirmDelete();
                          setModalMenuOpen(false);
                        }}
                      >
                        <Trash />{t("moveToTrash")}
                      </button>
                    </>
                  )}
                </div>
              </Popover>
            </>
          )}

          {/* Close button — always visible on all screen sizes */}
          <button
            className="modal-icon-btn modal-icon-btn--close focus:outline-none"
            data-tooltip={t("close")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
          </div>{/* end icon pill group */}
        </div>

        {/* Title input — on mobile it wraps below the buttons thanks to flex-row-reverse + wrap */}
        <input
          className={`min-w-0 bg-transparent font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none ${
            isDesktop ? "flex-[1_0_50%] sm:min-w-[240px] shrink-0 pr-2 order-first" : "w-full mt-1"
          }`}
          style={windowWidth < 700 ? {
            fontSize: mTitle.length > 40 ? "0.85rem"
              : mTitle.length > 28 ? "1rem"
              : mTitle.length > 18 ? "1.15rem"
              : "1.25rem"
          } : undefined}
          value={mTitle}
          onChange={(e) => setMTitle(e.target.value)}
          placeholder={t("noteTitle")}
        />
      </div>

      {/* Formatting popover anchor for mobile (triggered from kebab menu item) */}
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
