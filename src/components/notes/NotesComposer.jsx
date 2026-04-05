import React from "react";
import { createPortal } from "react-dom";
import { t } from "../../i18n";
import { Sparkles, CloseIcon, FormatIcon, TextNoteIcon, ChecklistIcon, BrushIcon, AddImageIcon } from "../../icons/index.jsx";
import DrawingCanvas from "../../DrawingCanvas";
import ChecklistRow from "../common/ChecklistRow.jsx";
import FormatToolbar from "../common/FormatToolbar.jsx";
import Popover from "../common/Popover.jsx";
import PaletteColorIcon from "../common/PaletteColorIcon.jsx";
import ColorPickerPanel from "../common/ColorPickerPanel.jsx";
import { bgFor, COLOR_ORDER, LIGHT_COLORS } from "../../utils/colors.js";
import { renderSafeMarkdown } from "../../utils/markdown.jsx";
import { uid, fileToCompressedDataURL } from "../../utils/helpers.js";

export default function NotesComposer({
  dark,
  activeTagFilter,
  composerType,
  setComposerType,
  title,
  setTitle,
  content,
  setContent,
  contentRef,
  clInput,
  setClInput,
  addComposerItem,
  clItems,
  composerDrawingData,
  setComposerDrawingData,
  composerImages,
  setComposerImages,
  composerFileRef,
  composerTagList,
  setComposerTagList,
  composerTagInput,
  setComposerTagInput,
  composerTagFocused,
  setComposerTagFocused,
  composerTagInputRef,
  tagsWithCounts,
  composerColor,
  setComposerColor,
  addNote,
  addImagesToState,
  formatComposer,
  showComposerFmt,
  setShowComposerFmt,
  composerFmtBtnRef,
  onComposerKeyDown,
  composerCollapsed,
  setComposerCollapsed,
  titleRef,
  composerRef,
  colorBtnRef,
  showColorPop,
  setShowColorPop,
  localAiEnabled,
  aiResponse,
  setAiResponse,
  isAiLoading,
  aiLoadingProgress,
  onAiSearch,
  search,
  setSearch,
  syncStatus,
}) {
  return (
    <>
      {/* AI Response Box */}
      {localAiEnabled && (aiResponse || isAiLoading) && (
        <div className="px-4 sm:px-6 md:px-8 lg:px-12 mb-6">
          <div className="max-w-2xl mx-auto glass-card rounded-xl shadow-lg p-5 border border-indigo-500/30 relative bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/30 z-[50]">
            {isAiLoading && (
              <div
                className="absolute top-0 left-0 h-1 bg-indigo-500 transition-all duration-300"
                style={{
                  width: aiLoadingProgress ? `${aiLoadingProgress}%` : "5%",
                }}
              />
            )}
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-semibold text-indigo-700 dark:text-indigo-300">{t("aiAssistant")}</h3>
              {aiResponse && !isAiLoading && (
                <button
                  onClick={() => {
                    setAiResponse(null);
                    setSearch("");
                  }}
                  className="ml-auto p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                  data-tooltip={t("clearResponse")}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
              {isAiLoading ? (
                <p className="animate-pulse text-gray-500 italic flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />{t("aiAssistantThinking")}</p>
              ) : (
                <div
                  className="text-gray-800 dark:text-gray-200 note-content"
                  dangerouslySetInnerHTML={{
                    __html: renderSafeMarkdown(aiResponse),
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Composer — hidden in trash and archive views */}
      {activeTagFilter !== "TRASHED" && activeTagFilter !== "ARCHIVED" && (
      <div className="px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="max-w-2xl mx-auto">
          {(
            <div
              ref={composerRef}
              className="glass-card rounded-xl shadow-lg p-4 mb-8 relative"
              style={{ backgroundColor: bgFor(composerColor, dark) }}
            >
              {/* Collapsed single input */}
              {composerCollapsed ? (
                <input
                  value={content}
                  onChange={(e) => {}}
                  onFocus={() => {
                    // expand and focus title
                    setComposerCollapsed(false);
                    setTimeout(() => titleRef.current?.focus(), 10);
                  }}
                  placeholder={t("writeNote")}
                  className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2"
                />
              ) : (
                <>
                  {/* Title */}
                  <input
                    ref={titleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("noteTitle")}
                    className="w-full bg-transparent text-lg font-semibold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none mb-2 p-2"
                  />

                  {/* Body, Checklist, or Drawing */}
                  {composerType === "text" ? (
                    <textarea
                      ref={contentRef}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      onKeyDown={onComposerKeyDown}
                      placeholder={t("writeNote")}
                      className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none p-2"
                      rows={1}
                    />
                  ) : composerType === "checklist" ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          value={clInput}
                          onChange={(e) => setClInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addComposerItem();
                            }
                          }}
                          placeholder={t("listItemEllipsis")}
                          className="flex-1 bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 border-b border-[var(--border-light)]"
                        />
                        <button
                          onClick={addComposerItem}
                          className="px-3 py-1.5 rounded-lg whitespace-nowrap font-semibold transition-all duration-200 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                        >{t("add")}</button>
                      </div>
                      {clItems.length > 0 && (
                        <div className="space-y-2">
                          {clItems.map((it) => (
                            <ChecklistRow
                              key={it.id}
                              item={it}
                              readOnly
                              disableToggle
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <DrawingCanvas
                      data={composerDrawingData}
                      onChange={setComposerDrawingData}
                      width={650}
                      height={450}
                      readOnly={false}
                      darkMode={dark}
                      hideModeToggle={true}
                    />
                  )}

                  {/* Composer image thumbnails */}
                  {composerImages.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto">
                      {composerImages.map((im) => (
                        <div key={im.id} className="relative">
                          <img
                            src={im.src}
                            alt={im.name}
                            className="h-16 w-24 object-cover rounded-md border border-[var(--border-light)]"
                          />
                          <button
                            data-tooltip={t("removeImage")}
                            className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-5 h-5 text-xs"
                            onClick={() =>
                              setComposerImages((prev) =>
                                prev.filter((x) => x.id !== im.id),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Responsive composer footer */}
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-3 relative" style={{ zIndex: 200, position: "relative" }}>
                    {/* Tag chips + suggestions (composer) */}
                    <div className="w-full sm:flex-1 flex flex-wrap items-center gap-1 p-2 min-h-[36px] relative z-[100]">
                      {composerTagList.map((ctag, i) => (
                        <span
                          key={ctag + i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                        >
                          {ctag}
                          <button
                            type="button"
                            onClick={() => setComposerTagList((prev) => prev.filter((_, idx) => idx !== i))}
                            className="hover:text-red-500 font-bold"
                          >×</button>
                        </span>
                      ))}
                      {(
                        <div className="relative flex-1 min-w-[8ch]">
                          <input
                            ref={composerTagInputRef}
                            value={composerTagInput}
                            onChange={(e) => setComposerTagInput(e.target.value)}
                            onFocus={() => setComposerTagFocused(true)}
                            onKeyDown={(e) => {
                              if ((e.key === "Enter" || e.key === ",") && composerTagInput.trim()) {
                                e.preventDefault();
                                const val = composerTagInput.trim().replace(/,+$/, "");
                                if (val && !composerTagList.map((x) => x.toLowerCase()).includes(val.toLowerCase())) {
                                  setComposerTagList((prev) => [...prev, val]);
                                }
                                setComposerTagInput("");
                              } else if (e.key === "Backspace" && !composerTagInput && composerTagList.length) {
                                setComposerTagList((prev) => prev.slice(0, -1));
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                const val = composerTagInput.trim().replace(/,+$/, "");
                                if (val && !composerTagList.map((x) => x.toLowerCase()).includes(val.toLowerCase())) {
                                  setComposerTagList((prev) => [...prev, val]);
                                }
                                setComposerTagInput("");
                                setComposerTagFocused(false);
                              }, 200);
                            }}
                            onPaste={(e) => {
                              e.preventDefault();
                              const pasted = e.clipboardData.getData("text");
                              const newTags = pasted.split(",").map((t) => t.trim()).filter(Boolean);
                              const unique = newTags.filter(
                                (t) => !composerTagList.map((x) => x.toLowerCase()).includes(t.toLowerCase())
                              );
                              if (unique.length) setComposerTagList((prev) => [...prev, ...unique]);
                            }}
                            type="text"
                            placeholder={composerTagList.length ? t("addTag") : t("addTagsCommaSeparated")}
                            className="bg-transparent text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none w-full"
                          />
                          {composerTagFocused && (() => {
                            const suggestions = tagsWithCounts
                              .filter(
                                ({ tag: t }) =>
                                  (!composerTagInput.trim() || t.toLowerCase().includes(composerTagInput.toLowerCase())) &&
                                  !composerTagList.map((x) => x.toLowerCase()).includes(t.toLowerCase())
                              );
                            const trimmed = composerTagInput.trim();
                            const isNew = trimmed && !tagsWithCounts.some(({ tag: t }) => t.toLowerCase() === trimmed.toLowerCase()) && !composerTagList.some((t) => t.toLowerCase() === trimmed.toLowerCase());
                            if (suggestions.length === 0 && !isNew) return null;
                            const rect = composerTagInputRef.current?.getBoundingClientRect();
                            if (!rect) return null;
                            const spaceBelow = window.innerHeight - rect.bottom;
                            const dropUp = spaceBelow < 220;
                            return createPortal(
                              <div
                                style={{
                                  position: "fixed",
                                  ...(dropUp
                                    ? { bottom: window.innerHeight - rect.top + 6, left: rect.left }
                                    : { top: rect.bottom + 6, left: rect.left }),
                                  width: Math.max(rect.width, 220),
                                  zIndex: 99999,
                                }}
                                className="rounded-2xl shadow-2xl bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl border border-indigo-100/80 dark:border-indigo-800/50 max-h-52 overflow-y-auto overflow-x-hidden ring-1 ring-black/5 dark:ring-white/5"
                              >
                                {suggestions.length > 0 && (
                                  <div className="px-3 pt-2.5 pb-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t("existingTags") || "Tags"}</span>
                                  </div>
                                )}
                                <div className="px-1.5 pb-1.5">
                                  {suggestions.map(({ tag: stag, count }) => (
                                    <button
                                      key={stag}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        if (!composerTagList.map((x) => x.toLowerCase()).includes(stag.toLowerCase())) {
                                          setComposerTagList((prev) => [...prev, stag]);
                                        }
                                        setComposerTagInput("");
                                        composerTagInputRef.current?.blur();
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30 text-sm text-gray-700 dark:text-gray-200 flex items-center justify-between gap-2 transition-all duration-150 group cursor-pointer"
                                    >
                                      <span className="flex items-center gap-2 min-w-0">
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-indigo-100/80 dark:bg-indigo-800/40 text-indigo-500 dark:text-indigo-400 shrink-0 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-700/50 transition-colors duration-150">
                                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                            <path d="M2 2.5A.5.5 0 012.5 2h5.086a.5.5 0 01.353.146l5.915 5.915a.5.5 0 010 .707l-4.586 4.586a.5.5 0 01-.707 0L3.146 7.939A.5.5 0 013 7.586V2.5zM5 5a1 1 0 100-2 1 1 0 000 2z"/>
                                          </svg>
                                        </span>
                                        <span className="truncate font-medium">{stag}</span>
                                      </span>
                                      <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{count}</span>
                                    </button>
                                  ))}
                                </div>
                                {isNew && (
                                  <>
                                    {suggestions.length > 0 && <div className="mx-3 border-t border-gray-100 dark:border-gray-800"/>}
                                    <div className="px-1.5 py-1.5">
                                      <button
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          if (!composerTagList.map((x) => x.toLowerCase()).includes(trimmed.toLowerCase())) {
                                            setComposerTagList((prev) => [...prev, trimmed]);
                                          }
                                          setComposerTagInput("");
                                          composerTagInputRef.current?.blur();
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
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-none relative">
                      {/* Formatting button (composer) - only for text mode */}
                      {composerType === "text" && (
                        <>
                          <button
                            ref={composerFmtBtnRef}
                            type="button"
                            onClick={() => setShowComposerFmt((v) => !v)}
                            className="px-2.5 py-1.5 rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 text-violet-600 hover:from-violet-100 hover:to-purple-100 hover:border-violet-300 hover:scale-105 hover:shadow-md hover:shadow-violet-200/60 dark:hover:shadow-none active:scale-95 dark:from-violet-900/30 dark:to-purple-900/20 dark:border-violet-700/60 dark:text-violet-400 dark:hover:from-violet-800/40 dark:hover:to-purple-800/30 flex items-center gap-1.5 text-sm font-medium transition-all duration-200 flex-shrink-0"
                            data-tooltip={t("formatting")}
                          >
                            <FormatIcon />{t("formatting")}</button>
                          <Popover
                            anchorRef={composerFmtBtnRef}
                            open={showComposerFmt}
                            onClose={() => setShowComposerFmt(false)}
                          >
                            <FormatToolbar
                              dark={dark}
                              onAction={(t) => {
                                setShowComposerFmt(false);
                                formatComposer(t);
                              }}
                            />
                          </Popover>
                        </>
                      )}

                      {/* Type selection buttons */}
                      <div className="flex gap-1 bg-black/5 dark:bg-white/5 rounded-2xl p-1">
                        <button
                          type="button"
                          onClick={() => setComposerType("text")}
                          className={`p-1.5 rounded-xl border-2 text-sm transition-all duration-200 ${
                            composerType === "text"
                              ? "bg-gradient-to-br from-rose-400 to-pink-500 text-white border-transparent shadow-md shadow-rose-300/50 dark:shadow-none scale-105"
                              : "border-rose-200/80 bg-gradient-to-br from-rose-50 to-pink-50/60 text-rose-400 hover:from-rose-100 hover:to-pink-100 hover:border-rose-300 hover:scale-105 hover:shadow-sm hover:shadow-rose-200/50 dark:hover:shadow-none dark:from-rose-900/20 dark:to-pink-900/10 dark:border-rose-700/50 dark:text-rose-400 dark:hover:from-rose-800/30 dark:hover:to-pink-800/20"
                          }`}
                          data-tooltip={t("textNote")}
                        >
                          <TextNoteIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => setComposerType("checklist")}
                          className={`p-1.5 rounded-xl border-2 text-sm transition-all duration-200 ${
                            composerType === "checklist"
                              ? "bg-gradient-to-br from-emerald-400 to-green-500 text-white border-transparent shadow-md shadow-emerald-300/50 dark:shadow-none scale-105"
                              : "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-green-50/60 text-emerald-500 hover:from-emerald-100 hover:to-green-100 hover:border-emerald-300 hover:scale-105 hover:shadow-sm hover:shadow-emerald-200/50 dark:hover:shadow-none dark:from-emerald-900/20 dark:to-green-900/10 dark:border-emerald-700/50 dark:text-emerald-400 dark:hover:from-emerald-800/30 dark:hover:to-green-800/20"
                          }`}
                          data-tooltip={t("checklist")}
                        >
                          <ChecklistIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => setComposerType("draw")}
                          className={`p-1.5 rounded-xl border-2 text-sm transition-all duration-200 ${
                            composerType === "draw"
                              ? "bg-gradient-to-br from-orange-400 to-amber-500 text-white border-transparent shadow-md shadow-orange-300/50 dark:shadow-none scale-105"
                              : "border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50/60 text-orange-400 hover:from-orange-100 hover:to-amber-100 hover:border-orange-300 hover:scale-105 hover:shadow-sm hover:shadow-orange-200/50 dark:hover:shadow-none dark:from-orange-900/20 dark:to-amber-900/10 dark:border-orange-700/50 dark:text-orange-400 dark:hover:from-orange-800/30 dark:hover:to-amber-800/20"
                          }`}
                          data-tooltip={t("drawing")}
                        >
                          <BrushIcon />
                        </button>
                      </div>

                      {/* Color dropdown (composer) */}
                      <button
                        ref={colorBtnRef}
                        type="button"
                        onClick={() => setShowColorPop((v) => !v)}
                        className="p-1.5 rounded-xl border-2 border-gray-200/80 bg-gradient-to-br from-white to-gray-50/60 hover:from-gray-50 hover:to-slate-100/60 hover:border-gray-300 hover:scale-105 hover:shadow-sm active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:from-gray-800/60 dark:to-gray-700/40 dark:border-gray-600/60 dark:hover:from-gray-700/70 dark:hover:to-gray-600/50 dark:hover:border-gray-500 transition-all duration-200 flex items-center justify-center"
                        data-tooltip={t("color")}
                      >
                        <PaletteColorIcon size={22} />
                      </button>
                      <ColorPickerPanel
                        anchorRef={colorBtnRef}
                        open={showColorPop}
                        onClose={() => setShowColorPop(false)}
                        colors={COLOR_ORDER.filter((name) => LIGHT_COLORS[name])}
                        selectedColor={composerColor}
                        darkMode={dark}
                        onSelect={(name) => setComposerColor(name)}
                      />

                      {/* Add Image (composer) */}
                      <input
                        ref={composerFileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          const results = [];
                          for (const f of files) {
                            try {
                              const src = await fileToCompressedDataURL(f);
                              results.push({ id: uid(), src, name: f.name });
                            } catch (e) {}
                          }
                          if (results.length)
                            setComposerImages((prev) => [...prev, ...results]);
                          e.target.value = "";
                        }}
                      />
                      <button
                        onClick={() => composerFileRef.current?.click()}
                        className="p-1.5 text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 flex-shrink-0 transition-colors duration-200"
                        data-tooltip={t("addImages")}
                      >
                        <AddImageIcon />
                      </button>

                      {/* Add Note */}
                      <button
                        onClick={addNote}
                        className="px-4 py-2 rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-all duration-200 whitespace-nowrap flex-shrink-0 bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient"
                      >{t("addNote")}</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      )}
    </>
  );
}
