import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import PaletteColorIcon from "../common/PaletteColorIcon.jsx";
import ColorPickerPanel from "../common/ColorPickerPanel.jsx";
import Popover from "../common/Popover.jsx";
import { DownloadIcon, ArchiveIcon, Trash, AddImageIcon, FormatIcon, Kebab } from "../../icons/index.jsx";
import { COLOR_ORDER, LIGHT_COLORS } from "../../utils/colors.js";
import { t } from "../../i18n";

/**
 * Google Keep-style footer toolbar for the note modal.
 * Desktop: icon + text label for each action.
 * Mobile:  icon-only (compact).
 */
export default function ModalFooter({
  dark,
  windowWidth,
  // tags
  mTagList,
  setMTagList,
  tagInput,
  setTagInput,
  modalTagFocused,
  setModalTagFocused,
  modalTagInputRef,
  modalTagBtnRef,
  suppressTagBlurRef,
  tagsWithCounts,
  addTags,
  handleTagKeyDown,
  handleTagBlur,
  handleTagPaste,
  // color
  mColor,
  setMColor,
  modalColorBtnRef,
  showModalColorPop,
  setShowModalColorPop,
  // images
  modalFileRef,
  addImagesToState,
  setMImages,
  // collaboration
  onOpenCollaboration,
  // formatting (mobile)
  modalFmtBtnRef,
  showModalFmt,
  setShowModalFmt,
  // view/edit toggle
  mType,
  viewMode,
  onToggleViewMode,
  modalScrollRef,
  savedModalScrollRatioRef,
  // actions
  activeId,
  notes,
  tagFilter,
  activeNoteObj,
  onDownloadNote,
  onRestoreFromTrash,
  onArchiveNote,
  onOpenConfirmDelete,
  // undo / redo
  undo,
  redo,
  canUndo,
  canRedo,
}) {
  const isDesktop = windowWidth >= 768;
  const isTrashed = tagFilter === "TRASHED";

  const handleDownload = () => {
    const n = notes.find((nn) => String(nn.id) === String(activeId));
    if (n) onDownloadNote(n);
  };

  const handleArchiveToggle = () => {
    const note = notes.find((nn) => String(nn.id) === String(activeId));
    if (note) onArchiveNote(activeId, !note.archived);
  };

  const handleToggleViewMode = () => {
    const el = modalScrollRef?.current;
    const maxScroll = el ? el.scrollHeight - el.clientHeight : 0;
    if (savedModalScrollRatioRef) {
      savedModalScrollRatioRef.current = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
    }
    onToggleViewMode();
  };

  /* ── Tag checkbox logic ── */
  const isTagApplied = (tag) => mTagList.some((t) => t.toLowerCase() === tag.toLowerCase());

  const toggleTag = (tag) => {
    if (isTagApplied(tag)) {
      setMTagList((prev) => prev.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
    } else {
      addTags(tag);
    }
  };

  const btnClass = isDesktop ? "modal-footer-labeled-btn" : "modal-footer-btn";

  /* Kebab menu (download + collaborate) */
  const kebabRef = useRef(null);
  const [kebabOpen, setKebabOpen] = useState(false);

  return (
    <div className="modal-footer-toolbar border-t border-[var(--border-light)]">
      <div className={`modal-footer-inner flex items-center px-2 sm:px-3 py-1.5 ${isDesktop ? "gap-1" : "gap-0.5"}`}>

        {/* ── Color picker ── */}
        <button
          ref={modalColorBtnRef}
          className={`${btnClass} focus:outline-none`}
          onClick={() => setShowModalColorPop((v) => !v)}
          data-tooltip={!isDesktop ? t("color") : undefined}
        >
          <PaletteColorIcon size={isDesktop ? 16 : 18} />
          {isDesktop && <span>{t("color")}</span>}
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

        {/* ── Add image (always visible, including view mode) ── */}
        {(mType === "checklist" || mType === "text") && (
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
              className={`${btnClass} modal-footer-btn--image focus:outline-none`}
              onClick={() => modalFileRef.current?.click()}
              data-tooltip={!isDesktop ? t("addImages") : undefined}
            >
              <AddImageIcon />
              {isDesktop && <span>{t("image")}</span>}
            </button>
          </>
        )}

        {/* ── Tag icon + checkbox dropdown ── */}
        <div className="relative">
          <button
            ref={modalTagBtnRef}
            className={`${btnClass} focus:outline-none`}
            onClick={() => {
              setModalTagFocused((v) => {
                if (!v) setTimeout(() => { if (windowWidth >= 640) modalTagInputRef.current?.focus(); }, 0);
                return !v;
              });
              setTagInput("");
            }}
            data-tooltip={!isDesktop ? t("addTag") : undefined}
          >
            <svg className={isDesktop ? "w-4 h-4" : "w-[18px] h-[18px]"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="2.5" />
            </svg>
            {isDesktop && <span>{t("tags")}{mTagList.length > 0 ? ` (${mTagList.length})` : ""}</span>}
            {/* Badge — mobile only */}
            {!isDesktop && mTagList.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[10px] font-bold leading-none px-1">
                {mTagList.length}
              </span>
            )}
          </button>

          {/* Tag checkbox dropdown */}
          {modalTagFocused && (() => {
            const rect = modalTagBtnRef.current?.getBoundingClientRect();
            if (!rect) return null;
            const spaceBelow = window.innerHeight - rect.bottom;
            const dropUp = spaceBelow < 320;
            const dropWidth = 260;
            const dropLeft = Math.min(rect.left, window.innerWidth - dropWidth - 8);

            const allTags = tagsWithCounts;
            const filtered = allTags.filter(
              ({ tag: tg }) =>
                !tagInput.trim() || tg.toLowerCase().includes(tagInput.toLowerCase())
            );
            const trimmed = tagInput.trim();
            const isNew = trimmed && !allTags.some(({ tag: tg }) => tg.toLowerCase() === trimmed.toLowerCase());

            return createPortal(
              <div
                style={{
                  position: "fixed",
                  ...(dropUp
                    ? { bottom: window.innerHeight - rect.top + 6, left: dropLeft }
                    : { top: rect.bottom + 6, left: dropLeft }),
                  width: dropWidth,
                  zIndex: 99999,
                }}
                className="rounded-2xl shadow-2xl bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl border border-indigo-100/80 dark:border-indigo-800/50 overflow-hidden ring-1 ring-black/5 dark:ring-white/5"
              >
                {/* Search input */}
                <div className="px-2 pt-2 pb-1.5">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/60 focus-within:border-indigo-300 dark:focus-within:border-indigo-600 transition-colors duration-150">
                    <svg className="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/>
                    </svg>
                    <input
                      ref={modalTagInputRef}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setTagInput(""); setModalTagFocused(false); return; }
                        handleTagKeyDown(e);
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          if (!suppressTagBlurRef.current) handleTagBlur();
                          suppressTagBlurRef.current = false;
                          setModalTagFocused(false);
                        }, 200);
                      }}
                      onPaste={handleTagPaste}
                      placeholder={t("searchOrCreateTag") || "Rechercher ou cr\u00e9er\u2026"}
                      className="flex-1 bg-transparent text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none min-w-0"
                    />
                  </div>
                </div>

                {/* Tag list with checkboxes */}
                {filtered.length > 0 && (
                  <>
                    <div className="px-3 pt-1 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t("existingTags") || "Tags"}</span>
                    </div>
                    <div className="px-1.5 pb-1.5 max-h-52 overflow-y-auto">
                      {filtered.map(({ tag, count }) => {
                        const checked = isTagApplied(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              suppressTagBlurRef.current = true;
                              toggleTag(tag);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30 text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2.5 transition-all duration-150 group cursor-pointer"
                          >
                            <span className={`inline-flex items-center justify-center rounded-md border-2 transition-all duration-150 shrink-0 ${
                              checked
                                ? "bg-indigo-500 border-indigo-500 dark:bg-indigo-600 dark:border-indigo-600"
                                : "border-gray-300 dark:border-gray-600 group-hover:border-indigo-400 dark:group-hover:border-indigo-500"
                            }`} style={{ width: 18, height: 18 }}>
                              {checked && (
                                <svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3.5 8.5l3 3 6-6" />
                                </svg>
                              )}
                            </span>
                            <span className="flex items-center gap-2 min-w-0 flex-1">
                              <svg className="w-3 h-3 opacity-50 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                <path d="M2 2.5A.5.5 0 012.5 2h5.086a.5.5 0 01.353.146l5.915 5.915a.5.5 0 010 .707l-4.586 4.586a.5.5 0 01-.707 0L3.146 7.939A.5.5 0 013 7.586V2.5zM5 5a1 1 0 100-2 1 1 0 000 2z"/>
                              </svg>
                              <span className={`truncate ${checked ? "font-semibold" : "font-medium"}`}>{tag}</span>
                            </span>
                            <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {filtered.length === 0 && !isNew && (
                  <div className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">{t("noTagsFound") || "Aucun tag trouv\u00e9"}</div>
                )}

                {isNew && (
                  <>
                    {filtered.length > 0 && <div className="mx-3 border-t border-gray-100 dark:border-gray-800"/>}
                    <div className="px-1.5 py-1.5">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          suppressTagBlurRef.current = true;
                          addTags(trimmed);
                          setTagInput("");
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20 text-sm flex items-center gap-2 transition-all duration-150 group cursor-pointer"
                      >
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100/80 dark:bg-emerald-800/40 text-emerald-500 dark:text-emerald-400 shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-700/50 transition-colors duration-150">
                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
                          </svg>
                        </span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">{t("createTag") || "Cr\u00e9er"} "<span className="font-semibold">{trimmed}</span>"</span>
                      </button>
                    </div>
                  </>
                )}

                {mTagList.length > 0 && (
                  <>
                    <div className="mx-3 border-t border-gray-100 dark:border-gray-800"/>
                    <div className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {mTagList.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100/80 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-700/40"
                          >
                            {tag}
                            <button
                              className="w-3 h-3 rounded-full text-indigo-400 dark:text-indigo-300 hover:bg-red-400 dark:hover:bg-red-500 hover:text-white flex items-center justify-center transition-all duration-150 cursor-pointer focus:outline-none leading-none"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                suppressTagBlurRef.current = true;
                                setMTagList((prev) => prev.filter((t) => t !== tag));
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>,
              document.body
            );
          })()}
        </div>

        {/* ── Formatting (mobile only) ── */}
        {!isDesktop && mType === "text" && !viewMode && (
          <button
            ref={modalFmtBtnRef}
            className="modal-footer-btn focus:outline-none"
            data-tooltip={t("formatting")}
            onClick={(e) => {
              e.stopPropagation();
              setShowModalFmt((v) => !v);
            }}
          >
            <FormatIcon />
          </button>
        )}

        {/* ── Undo ── */}
        <button
          className={`${btnClass} focus:outline-none ${!canUndo ? "opacity-50" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { if (!isDesktop) document.activeElement?.blur(); undo(); }}
          disabled={!canUndo}
          data-tooltip={!isDesktop ? t("undo") : undefined}
        >
          <svg className={isDesktop ? "w-4 h-4" : "w-[18px] h-[18px]"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10h13a4 4 0 0 1 0 8H7" />
            <path d="M3 10l4-4" />
            <path d="M3 10l4 4" />
          </svg>
          {isDesktop && <span>{t("undo")}</span>}
        </button>

        {/* ── Redo ── */}
        <button
          className={`${btnClass} focus:outline-none ${!canRedo ? "opacity-50" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { if (!isDesktop) document.activeElement?.blur(); redo(); }}
          disabled={!canRedo}
          data-tooltip={!isDesktop ? t("redo") : undefined}
        >
          <svg className={isDesktop ? "w-4 h-4" : "w-[18px] h-[18px]"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10H8a4 4 0 0 0 0 8h10" />
            <path d="M21 10l-4-4" />
            <path d="M21 10l-4 4" />
          </svg>
          {isDesktop && <span>{t("redo")}</span>}
        </button>

        {/* Spacer */}
        <div className="flex-1 modal-footer-spacer" />

        {/* ── Collaborate ── */}
        <button
          className={`${btnClass} modal-footer-btn--collab focus:outline-none`}
          onClick={onOpenCollaboration}
          data-tooltip={!isDesktop ? t("collaborate") : undefined}
        >
          <svg className={isDesktop ? "w-4 h-4" : "w-[18px] h-[18px]"} fill="currentColor" viewBox="0 0 20 20">
            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
          </svg>
          {isDesktop && <span>{t("collaborate")}</span>}
        </button>

        {/* ── Delete / Trash ── */}
        <button
          className={`${btnClass} modal-footer-btn--trash focus:outline-none`}
          onClick={onOpenConfirmDelete}
          data-tooltip={!isDesktop ? (isTrashed ? t("permanentlyDelete") : t("moveToTrash")) : undefined}
        >
          <Trash />
          {isDesktop && <span>{isTrashed ? t("permanentlyDelete") : t("trash")}</span>}
        </button>

        {/* ── Kebab menu (Download + Collaborate) ── */}
        <button
          ref={kebabRef}
          className="modal-footer-btn focus:outline-none"
          onClick={(e) => { e.stopPropagation(); setKebabOpen((v) => !v); }}
          data-tooltip={t("moreOptions")}
        >
          <Kebab />
        </button>
        <Popover
          anchorRef={kebabRef}
          open={kebabOpen}
          onClose={() => setKebabOpen(false)}
        >
          <div
            className={`min-w-[180px] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
            style={{ backgroundColor: dark ? "#222222" : undefined }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Archive / Restore */}
            {isTrashed ? (
              <button
                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                style={{ color: dark ? "#fbbf24" : "#a16207" }}
                onClick={() => { onRestoreFromTrash(activeId); setKebabOpen(false); }}
              >
                <ArchiveIcon />{t("restoreFromTrash")}
              </button>
            ) : (
              <button
                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                style={{ color: dark ? "#fbbf24" : "#a16207" }}
                onClick={() => { handleArchiveToggle(); setKebabOpen(false); }}
              >
                <ArchiveIcon />{activeNoteObj?.archived ? t("unarchive") : t("archive")}
              </button>
            )}
            {/* Download */}
            <button
              className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
              style={{ color: dark ? "#4ade80" : "#16a34a" }}
              onClick={() => { handleDownload(); setKebabOpen(false); }}
            >
              <DownloadIcon />{t("downloadMd")}
            </button>
          </div>
        </Popover>

        {/* ── Edit/View toggle — text notes only, with label ── */}
        {mType === "text" && (
          <button
            className={`${isDesktop ? "modal-footer-labeled-btn" : "modal-footer-btn"} modal-footer-btn--mode btn-gradient hover:scale-[1.03] active:scale-[0.98]`}
            onClick={handleToggleViewMode}
            data-tooltip={!isDesktop ? (viewMode ? t("switchToEditMode") : t("switchToViewMode")) : undefined}
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
            {isDesktop && <span>{viewMode ? t("editMode") : t("viewMode")}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
