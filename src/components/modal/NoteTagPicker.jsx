import React from "react";
import { t } from "../../i18n";

/**
 * The note's tag picker: search / create field, the existing tags as a
 * checklist, and the tags applied to the note as removable chips. Rendered
 * inside the desktop dropdown ("popover") or the mobile bottom sheet
 * ("sheet"). The dropdown is driven by the field's focus and closes when it
 * blurs; the sheet stays open until dismissed, only committing a typed tag.
 */
export default function NoteTagPicker({
  variant,
  tagInput,
  setTagInput,
  tagsWithCounts,
  mTagList,
  setMTagList,
  addTags,
  inputRef,
  suppressTagBlurRef,
  handleTagKeyDown,
  handleTagBlur,
  handleTagPaste,
  onClose,
}) {
  const sheet = variant === "sheet";

  const isTagApplied = (tag) => mTagList.some((x) => x.toLowerCase() === tag.toLowerCase());
  const toggleTag = (tag) => {
    if (isTagApplied(tag)) {
      setMTagList((prev) => prev.filter((x) => x.toLowerCase() !== tag.toLowerCase()));
    } else {
      addTags(tag);
    }
  };

  const filtered = tagsWithCounts.filter(
    ({ tag }) => !tagInput.trim() || tag.toLowerCase().includes(tagInput.toLowerCase())
  );
  const trimmed = tagInput.trim();
  const isNew = trimmed && !tagsWithCounts.some(({ tag }) => tag.toLowerCase() === trimmed.toLowerCase());

  // Keeps the field focused (and the dropdown open) through a tap on a row.
  const keepFocus = (e) => {
    e.preventDefault();
    suppressTagBlurRef.current = true;
  };

  const search = (
    <div className={sheet
      ? "gk-tag-search-wrap gk-sheet-card flex items-center gap-3 px-4 h-12"
      : "gk-tag-search-wrap flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/60 focus-within:border-indigo-300 dark:focus-within:border-indigo-600 transition-colors duration-150"}
    >
      <svg className={`${sheet ? "w-4 h-4" : "w-3 h-3"} text-gray-400 dark:text-gray-500 shrink-0`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/>
      </svg>
      <input
        ref={inputRef}
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setTagInput(""); onClose(); return; }
          handleTagKeyDown(e);
        }}
        onBlur={() => {
          setTimeout(() => {
            if (!suppressTagBlurRef.current) handleTagBlur();
            suppressTagBlurRef.current = false;
            if (!sheet) onClose();
          }, 200);
        }}
        onPaste={handleTagPaste}
        placeholder={t("searchOrCreateTag")}
        className={`flex-1 bg-transparent ${sheet ? "text-base" : "text-sm"} placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none min-w-0`}
      />
    </div>
  );

  const rowClass = sheet
    ? "gk-sheet-row"
    : "w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30 text-sm flex items-center gap-2.5 transition-all duration-150 group cursor-pointer";

  const list = filtered.length > 0 && (
    <>
      <div className={sheet ? "px-2 pt-5 pb-2" : "px-3 pt-1 pb-1"}>
        <span className={`${sheet ? "text-xs" : "text-[10px]"} font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500`}>{t("existingTags")}</span>
      </div>
      <div className={sheet ? "gk-sheet-card" : "px-1.5 pb-1.5 max-h-52 overflow-y-auto"}>
        {filtered.map(({ tag, count }) => {
          const checked = isTagApplied(tag);
          return (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => { keepFocus(e); toggleTag(tag); }}
              className={`${rowClass} ${sheet ? "" : "text-gray-700 dark:text-gray-200"}`}
            >
              <span className={`gk-tag-cb inline-flex items-center justify-center rounded-md border-2 transition-all duration-150 shrink-0 ${
                checked
                  ? "gk-tag-cb--on"
                  : "border-gray-300 dark:border-gray-600"
              }`} style={{ width: sheet ? 22 : 18, height: sheet ? 22 : 18 }}>
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
              <span className={`${sheet ? "text-xs" : "text-[10px]"} font-medium text-gray-400 dark:text-gray-500 tabular-nums shrink-0`}>{count}</span>
            </button>
          );
        })}
      </div>
    </>
  );

  const empty = filtered.length === 0 && !isNew && (
    <div className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">{t("noTagsFound")}</div>
  );

  const create = isNew && (
    <>
      {!sheet && filtered.length > 0 && <div className="mx-3 border-t border-gray-100 dark:border-gray-800"/>}
      <div className={sheet ? "gk-sheet-card mt-3" : "px-1.5 py-1.5"}>
        <button
          type="button"
          onMouseDown={(e) => { keepFocus(e); addTags(trimmed); setTagInput(""); }}
          className={sheet ? "gk-sheet-row" : "w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20 text-sm flex items-center gap-2 transition-all duration-150 group cursor-pointer"}
        >
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100/80 dark:bg-emerald-800/40 text-emerald-500 dark:text-emerald-400 shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-700/50 transition-colors duration-150">
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
            </svg>
          </span>
          <span className="font-medium text-emerald-600 dark:text-emerald-400 min-w-0 truncate">{t("createTag")} "<span className="font-semibold">{trimmed}</span>"</span>
        </button>
      </div>
    </>
  );

  const chips = mTagList.length > 0 && (
    <>
      {!sheet && <div className="mx-3 border-t border-gray-100 dark:border-gray-800"/>}
      <div className={sheet ? "pt-4 px-1" : "px-3 py-2"}>
        <div className={`flex flex-wrap ${sheet ? "gap-2" : "gap-1"}`}>
          {mTagList.map((tag) => (
            <span
              key={tag}
              className={`gk-tag-chip inline-flex items-center gap-1 rounded-full font-semibold bg-indigo-100/80 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-700/40 ${sheet ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]"}`}
            >
              {tag}
              <button
                className={`gk-tag-chip-remove rounded-full text-indigo-400 dark:text-indigo-300 hover:bg-red-400 dark:hover:bg-red-500 hover:text-white flex items-center justify-center transition-all duration-150 cursor-pointer focus:outline-none leading-none ${sheet ? "w-5 h-5" : "w-3 h-3"}`}
                onMouseDown={(e) => {
                  keepFocus(e);
                  e.stopPropagation();
                  setMTagList((prev) => prev.filter((x) => x !== tag));
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </>
  );

  if (sheet) {
    return (
      <>
        {search}
        {create}
        {chips}
        {list}
        {empty}
      </>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl">
      <div className="px-2 pt-2 pb-1.5">{search}</div>
      {list}
      {empty}
      {create}
      {chips}
    </div>
  );
}
