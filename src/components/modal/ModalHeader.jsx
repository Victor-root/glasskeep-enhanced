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
  return (
    <div
      className="sticky top-0 z-20 pt-4 modal-header-blur rounded-t-none sm:rounded-t-xl"
      style={{ backgroundColor: modalBgFor(mColor, dark) }}
    >
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 pb-3">
        <input
          className="flex-[1_0_50%] min-w-0 sm:min-w-[240px] shrink-0 bg-transparent font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none pr-2"
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
        <div className="flex items-center gap-2 flex-none ml-auto">
          {/* Icon buttons group – pill container */}
          <div className="modal-icon-group">
          {/* View/Edit toggle only for TEXT notes */}
          {mType === "text" && (
            <button
              className="modal-icon-btn modal-icon-btn--mode btn-gradient hover:scale-[1.03] active:scale-[0.98]"
              onClick={() => {
                const el = modalScrollRef.current;
                const maxScroll = el ? el.scrollHeight - el.clientHeight : 0;
                savedModalScrollRatioRef.current = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
                onToggleViewMode();
              }}
              data-tooltip={
                viewMode ? t("switchToEditMode") : t("switchToViewMode")
              }
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
          {/* Collaboration button - always visible */}
          <button
            className="modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)]"
            data-tooltip={t("collaborate")}
            onClick={onOpenCollaboration}
          >
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
            </svg>
            <svg
              className="w-3 h-3 absolute -top-1 -right-1"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
            </svg>
          </button>

          {/* Formatting button + popover: mobile only (desktop uses inline toolbar below) */}
          {mType === "text" && !viewMode && windowWidth < 768 && (
            <>
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
            </>
          )}

          {/* 3-dots menu */}
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
                  style={{
                    backgroundColor: dark ? "#222222" : undefined,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                    onClick={() => {
                      const n = notes.find(
                        (nn) => String(nn.id) === String(activeId),
                      );
                      if (n) onDownloadNote(n);
                      setModalMenuOpen(false);
                    }}
                  >
                    <DownloadIcon />{t("downloadMd")}</button>
                  {tagFilter === "TRASHED" ? (
                    <>
                      <button
                        className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                        onClick={() => {
                          onRestoreFromTrash(activeId);
                          setModalMenuOpen(false);
                        }}
                      >
                        <ArchiveIcon />{t("restoreFromTrash")}
                      </button>
                      <button
                        className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
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
                        className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                        onClick={() => {
                          const note = notes.find(
                            (nn) => String(nn.id) === String(activeId),
                          );
                          if (note) {
                            onArchiveNote(activeId, !note.archived);
                            setModalMenuOpen(false);
                          }
                        }}
                      >
                        <ArchiveIcon />
                        {activeNoteObj?.archived ? t("unarchive") : t("archive")}
                      </button>
                      <button
                        className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
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

          {/* Pin button - hidden in archived view */}
          {tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED" && (
            <button
              className={`modal-icon-btn focus:outline-none focus:ring-2 focus:ring-[var(--note-color,#6366f1)] ${
                notes.find((n) => String(n.id) === String(activeId))?.pinned
                  ? "modal-icon-btn--active"
                  : ""
              }`}
              data-tooltip={t("pinUnpin")}
              onClick={() =>
                activeId != null &&
                onTogglePin(
                  activeId,
                  !notes.find((n) => String(n.id) === String(activeId))
                    ?.pinned,
                )
              }
            >
              {notes.find((n) => String(n.id) === String(activeId))
                ?.pinned ? (
                <PinFilled />
              ) : (
                <PinOutline />
              )}
            </button>
          )}

          <button
            className="modal-icon-btn modal-icon-btn--close focus:outline-none"
            data-tooltip={t("close")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
          </div>{/* end icon pill group */}
        </div>

      </div>

      {/* Desktop inline formatting toolbar (always visible in edit mode) */}
      {mType === "text" && !viewMode && windowWidth >= 768 && (
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
