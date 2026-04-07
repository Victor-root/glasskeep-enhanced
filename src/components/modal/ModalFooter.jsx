import React from "react";
import { createPortal } from "react-dom";
import PaletteColorIcon from "../common/PaletteColorIcon.jsx";
import ColorPickerPanel from "../common/ColorPickerPanel.jsx";
import UserAvatar from "../common/UserAvatar.jsx";
import { COLOR_ORDER, LIGHT_COLORS } from "../../utils/colors.js";
import { AddImageIcon } from "../../icons/index.jsx";
import { t } from "../../i18n";

/**
 * Footer of the note modal — tag chips editor, color picker,
 * image upload button, save button.
 * Purely presentational with prop-driven callbacks.
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
  // save
  modalHasChanges,
  mType,
  isCollaborativeNote,
  activeId,
  savingModal,
  onSave,
  // collaborators
  collaborators,
}) {
  return (
    <div className="border-t border-[var(--border-light)] p-4 flex flex-wrap items-center gap-3">
      {/* Tags chips editor */}
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        {mTagList.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100/80 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-700/40 backdrop-blur-sm transition-all duration-150 hover:bg-indigo-200/90 dark:hover:bg-indigo-800/60 hover:scale-105 hover:shadow-sm"
          >
            <svg className="w-3 h-3 opacity-70 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M2 2.5A.5.5 0 012.5 2h5.086a.5.5 0 01.353.146l5.915 5.915a.5.5 0 010 .707l-4.586 4.586a.5.5 0 01-.707 0L3.146 7.939A.5.5 0 013 7.586V2.5zM5 5a1 1 0 100-2 1 1 0 000 2z"/>
            </svg>
            {tag}
            <button
              className="w-3.5 h-3.5 rounded-full text-indigo-400 dark:text-indigo-300 hover:bg-red-400 dark:hover:bg-red-500 hover:text-white flex items-center justify-center transition-all duration-150 cursor-pointer focus:outline-none leading-none"
              data-tooltip={t("removeTag")}
              onClick={() =>
                setMTagList((prev) => prev.filter((t) => t !== tag))
              }
            >
              ×
            </button>
          </span>
        ))}
        {/* Tag add button */}
        <div className="relative">
            <button
              ref={modalTagBtnRef}
              type="button"
              onClick={() => {
                setModalTagFocused((v) => {
                  if (!v) setTimeout(() => { if (windowWidth >= 640) modalTagInputRef.current?.focus(); }, 0);
                  return !v;
                });
                setTagInput("");
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-500 dark:text-indigo-400 hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-200 cursor-pointer"
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
              </svg>
              {t("addTag")}
            </button>
            {modalTagFocused && (() => {
              const rect = modalTagBtnRef.current?.getBoundingClientRect();
              if (!rect) return null;
              const spaceBelow = window.innerHeight - rect.bottom;
              const dropUp = spaceBelow < 280;
              const dropWidth = 240;
              const dropLeft = Math.min(rect.left, window.innerWidth - dropWidth - 8);
              const suggestions = tagsWithCounts
                .filter(
                  ({ tag: t }) =>
                    (!tagInput.trim() || t.toLowerCase().includes(tagInput.toLowerCase())) &&
                    !mTagList.map((x) => x.toLowerCase()).includes(t.toLowerCase())
                );
              const trimmed = tagInput.trim();
              const isNew = trimmed && !tagsWithCounts.some(({ tag: t }) => t.toLowerCase() === trimmed.toLowerCase()) && !mTagList.some((t) => t.toLowerCase() === trimmed.toLowerCase());
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
                  {/* Search input inside dropdown */}
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
                        placeholder={t("searchOrCreateTag") || "Rechercher ou créer…"}
                        className="flex-1 bg-transparent text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none min-w-0"
                      />
                    </div>
                  </div>
                  {/* Tag list */}
                  {suggestions.length > 0 && (
                    <>
                      <div className="px-3 pt-1 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t("existingTags") || "Tags"}</span>
                      </div>
                      <div className="px-1.5 pb-1.5 max-h-44 overflow-y-auto">
                        {suggestions.map(({ tag, count }) => (
                          <button
                            key={tag}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              suppressTagBlurRef.current = true;
                              addTags(tag);
                              setTagInput("");
                              setModalTagFocused(false);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30 text-sm text-gray-700 dark:text-gray-200 flex items-center justify-between gap-2 transition-all duration-150 group cursor-pointer"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-indigo-100/80 dark:bg-indigo-800/40 text-indigo-500 dark:text-indigo-400 shrink-0 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-700/50 transition-colors duration-150">
                                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                  <path d="M2 2.5A.5.5 0 012.5 2h5.086a.5.5 0 01.353.146l5.915 5.915a.5.5 0 010 .707l-4.586 4.586a.5.5 0 01-.707 0L3.146 7.939A.5.5 0 013 7.586V2.5zM5 5a1 1 0 100-2 1 1 0 000 2z"/>
                                </svg>
                              </span>
                              <span className="truncate font-medium">{tag}</span>
                            </span>
                            <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{count}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {suggestions.length === 0 && !isNew && (
                    <div className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">{t("noTagsFound") || "Aucun tag trouvé"}</div>
                  )}
                  {isNew && (
                    <>
                      {suggestions.length > 0 && <div className="mx-3 border-t border-gray-100 dark:border-gray-800"/>}
                      <div className="px-1.5 py-1.5">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            suppressTagBlurRef.current = true;
                            addTags(trimmed);
                            setTagInput("");
                            setModalTagFocused(false);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20 text-sm flex items-center gap-2 transition-all duration-150 group cursor-pointer"
                        >
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100/80 dark:bg-emerald-800/40 text-emerald-500 dark:text-emerald-400 shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-700/50 transition-colors duration-150">
                            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
                            </svg>
                          </span>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">{t("createTag") || "Créer"} "<span className="font-semibold">{trimmed}</span>"</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>,
                document.body
              );
            })()}
        </div>
      </div>

      {/* Right controls */}
      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
        {/* Collaborator avatars */}
        {collaborators && collaborators.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {collaborators.slice(0, 4).map((collab) => (
              <div key={collab.id} data-tooltip={collab.name || collab.email}>
                <UserAvatar
                  name={collab.name}
                  email={collab.email}
                  avatarUrl={collab.avatarUrl}
                  size="w-6 h-6"
                  textSize="text-[10px]"
                  dark={dark}
                  className="ring-2 ring-white dark:ring-[#1e1e1e]"
                />
              </div>
            ))}
            {collaborators.length > 4 && (
              <span
                data-tooltip={collaborators.slice(4).map((c) => c.name || c.email).join(", ")}
                className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold ring-2 ring-white dark:ring-[#1e1e1e] ${
                  dark ? "bg-gray-600 text-gray-200" : "bg-gray-200 text-gray-600"
                }`}
              >
                +{collaborators.length - 4}
              </span>
            )}
          </div>
        )}
        {/* Save check – always visible */}
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
    </div>
  );
}
