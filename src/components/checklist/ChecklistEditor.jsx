import React from "react";
import { t } from "../../i18n";
import ChecklistRow from "../common/ChecklistRow.jsx";
import SectionHeader, { SECTION_COLORS, DEFAULT_SECTION_COLOR, hexAlpha, useDark } from "./SectionHeader.jsx";
import useChecklistDrag from "../../hooks/useChecklistDrag.js";
import {
  DEFAULT_SECTION_ID,
  INDENT_STEP_PX,
  canIndentItem,
  findPrevItemId,
  getIndentedChildren,
  getSections,
  hasSections,
  insertAfter,
  insertAtBottom,
  insertAtSectionEnd,
  insertAtSectionStart,
  insertAtTop,
  insertBefore,
  isItem,
  makeItem,
  makeSection,
  normalizeItems,
  orderCheckedForDisplay,
  removeEntry,
  removeSectionKeepItems,
  removeSectionWithItems,
  updateEntry,
} from "../../utils/checklist.js";

/**
 * Full checklist editor. Source of truth is the flat `entries` array
 * (passed in as `mItems`). Contains both regular items and section
 * headers; ordering in the array is the logical ordering.
 *
 * Keyboard:
 *   - Enter (caret at 0) → insert a new empty item ABOVE the current one
 *   - Enter (elsewhere) → insert respecting global insert position (top/bottom)
 *   - Shift+Enter      → native newline (handled by textarea)
 *   - Backspace (empty, caret at 0) → delete and focus previous item
 *
 * Toggling done does NOT mutate order. Checked items are just rendered
 * in the "Done" area, so unchecking them restores them to their exact
 * original slot.
 */
export default function ChecklistEditor({
  entries,
  setEntries,
  syncEntries,
  insertPosition = "bottom",
  removeSectionBehavior = "cascade",
  noteId,
}) {
  const items = React.useMemo(() => normalizeItems(entries), [entries]);
  const sections = React.useMemo(() => getSections(items), [items]);

  // Focus request: incremented every time we want to move focus.
  const [focusToken, setFocusToken] = React.useState(0);
  const dark = useDark();
  const [focusItemId, setFocusItemId] = React.useState(null);
  const [focusCaret, setFocusCaret] = React.useState("end");

  const [doneCollapsed, setDoneCollapsed] = React.useState(() => {
    if (!noteId) return false;
    try { return localStorage.getItem(`ck-done-${noteId}`) === "1"; } catch { return false; }
  });
  React.useEffect(() => {
    if (!noteId) return;
    try { localStorage.setItem(`ck-done-${noteId}`, doneCollapsed ? "1" : "0"); } catch {}
  }, [doneCollapsed, noteId]);

  // Section collapsed/expanded state is persisted ON the section entry
  // (`collapsed: true`) so it syncs across devices via the note's items
  // array — toggling it saves the note like any other checklist edit.
  const toggleSectionCollapse = (id) => {
    const current = items.find((e) => e.id === id);
    commit(updateEntry(items, id, { collapsed: !current?.collapsed }));
  };
  const requestFocus = React.useCallback((id, caret = "end") => {
    setFocusItemId(id);
    setFocusCaret(caret);
    setFocusToken((n) => n + 1);
  }, []);

  // Drag & drop within the unchecked list + section drag.
  const {
    handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel,
    handleSectionPointerDown, handleSectionPointerMove, handleSectionPointerUp, handleSectionPointerCancel,
  } = useChecklistDrag(items, setEntries, syncEntries);

  const commit = (next) => {
    setEntries(next);
    syncEntries(next);
  };

  // ---------- Item-level edits ----------
  const toggleItem = (id, checked) => {
    // Preserve order. Checked items stay in place in the array; render
    // code groups them visually at the bottom.
    //
    // Checking/unchecking a parent cascades to its indented children
    // (Google Keep style) -- getIndentedChildren derives that run fresh
    // from the array each time, so this is still a flat, one-shot commit,
    // not a stored parent/child relationship. A no-op for items with no
    // children (the common case): same single-item update as before.
    const children = getIndentedChildren(items, id);
    if (children.length === 0) {
      commit(updateEntry(items, id, { done: !!checked }));
      return;
    }
    const idsToUpdate = new Set([id, ...children.map((c) => c.id)]);
    commit(items.map((e) => (idsToUpdate.has(e.id) ? { ...e, done: !!checked } : e)));
  };

  const changeText = (id, text) => {
    commit(updateEntry(items, id, { text }));
  };

  const removeItem = (id) => {
    commit(removeEntry(items, id));
  };

  // Indent/outdent, Google-Keep style (Ctrl+]/Ctrl+[ or the drag handle).
  // Indenting the first item of a list/section is a no-op: canIndentItem
  // already encodes that rule (also enforced defensively in
  // normalizeItems, so it can never actually persist either way).
  // Outdenting has no precondition beyond "is currently indented" — no-op
  // otherwise, so this never fires a needless save.
  const indentItem = (id) => {
    if (!canIndentItem(items, id)) return;
    commit(updateEntry(items, id, { indent: 1 }));
  };

  const outdentItem = (id) => {
    const item = items.find((e) => e.id === id);
    if (!item || !item.indent) return;
    commit(updateEntry(items, id, { indent: 0 }));
  };

  // Enter inside an item. Respects the global insert preference so
  // rapid-fire Enter presses keep accumulating items on the user's
  // preferred side (top/bottom) rather than always drifting downward.
  // Exception: if the caret was at the very start of the text when
  // Enter was pressed, always insert ABOVE the current item — that
  // matches the natural editor reflex of "push this line down".
  const addItemAdjacent = (anchorId, opts = {}) => {
    const newItem = makeItem("", false);
    const insertAbove = opts.atStart || insertPosition === "top";
    const next = insertAbove
      ? insertBefore(items, anchorId, newItem)
      : insertAfter(items, anchorId, newItem);
    setEntries(next);
    syncEntries(next);
    requestFocus(newItem.id, "end");
  };

  const addItemToSection = (sectionId) => {
    const newItem = makeItem("", false);
    const next =
      insertPosition === "top"
        ? insertAtSectionStart(items, sectionId, newItem)
        : insertAtSectionEnd(items, sectionId, newItem);
    setEntries(next);
    syncEntries(next);
    requestFocus(newItem.id, "end");
  };

  const addItemTopOrBottom = () => {
    const newItem = makeItem("", false);
    const next =
      insertPosition === "top"
        ? insertAtTop(items, newItem)
        : insertAtBottom(items, newItem);
    setEntries(next);
    syncEntries(next);
    requestFocus(newItem.id, "end");
  };

  const removeAndFocusPrev = (id) => {
    const prevId = findPrevItemId(items, id);
    const next = removeEntry(items, id);
    setEntries(next);
    syncEntries(next);
    if (prevId) requestFocus(prevId, "end");
  };

  // ---------- Section-level edits ----------
  const addSection = () => {
    const newSection = makeSection("");
    // Append a new section at the very end and seed one empty item
    // inside. Focus will land on the title input automatically because
    // SectionHeader opens in edit mode when its title is empty.
    const newItem = makeItem("", false);
    const next = [...items, newSection, newItem];
    setEntries(next);
    syncEntries(next);
  };

  const renameSection = (id, title) => {
    commit(updateEntry(items, id, { title }));
  };

  const changeColor = (id, colorKey) => {
    commit(updateEntry(items, id, { color: colorKey }));
  };

  const removeSection = (id) => {
    // Two behaviours, controlled by the user setting:
    //   "cascade" → drop the section marker AND every item it owns.
    //   "keep"    → drop the marker but relocate its items back to the
    //                default (unsectioned) zone.
    const next = removeSectionBehavior === "keep"
      ? removeSectionKeepItems(items, id)
      : removeSectionWithItems(items, id);
    commit(next);
  };

  // ---------- Rendering helpers ----------
  const checkedItems = items.filter((e) => isItem(e) && e.done);
  // Map each section to its checked items, ordered so an indented item
  // always renders right after its own parent -- orderCheckedForDisplay
  // handles the case where an unrelated already-checked item happens to
  // sit between them in the raw array (see its own doc comment).
  const checkedBySection = React.useMemo(() => {
    const map = new Map();
    for (const section of sections) {
      const ordered = orderCheckedForDisplay(section.items);
      if (ordered.length > 0) map.set(section.id, ordered);
    }
    return map;
  }, [sections]);

  const showSectionBreaks = hasSections(items);

  const renderItemRow = (it) => (
    <div
      key={it.id}
      data-checklist-item={it.id}
      data-checklist-row
      className="group flex items-center gap-2"
      style={it.indent ? { marginLeft: INDENT_STEP_PX } : undefined}
    >
      <div
        onPointerDown={(e) => handlePointerDown(it.id, e)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="flex items-center justify-center px-1 checklist-grab-handle opacity-40 group-hover:opacity-70 transition-opacity"
        style={{ touchAction: "none" }}
      >
        <div className="grid grid-cols-2 gap-0.5">
          <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
          <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
          <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
          <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
          <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
          <div className="w-1 h-1 bg-gray-400 dark:bg-gray-300 rounded-full"></div>
        </div>
      </div>

      <div className="flex-1">
        <ChecklistRow
          item={it}
          readOnly={false}
          disableToggle={false}
          showRemove={true}
          size="lg"
          indentGutter={false}
          focusItemId={focusItemId}
          focusToken={focusToken}
          focusCaret={focusCaret}
          onToggle={(checked, e) => {
            e?.stopPropagation();
            toggleItem(it.id, checked);
          }}
          onChange={(txt) => changeText(it.id, txt)}
          onRemove={() => removeItem(it.id)}
          onEnter={(opts) => addItemAdjacent(it.id, opts)}
          onBackspaceEmpty={() => removeAndFocusPrev(it.id)}
          onIndent={() => indentItem(it.id)}
          onOutdent={() => outdentItem(it.id)}
        />
      </div>
    </div>
  );

  // ---------- Layout ----------
  const topAddRow = (
    <div
      data-checklist-row
      className="flex items-center gap-2 cursor-pointer p-2 border-b border-[var(--border-light)] text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-100 transition-colors"
      onClick={addItemTopOrBottom}
    >
      <span className="text-lg leading-none">+</span>
      <span className="text-sm">{t("listItemEllipsis")}</span>
    </div>
  );

  return (
    // overflow-x-clip: the horizontal drag translates a row past its own
    // box, and browsers count a transformed element's painted bounds
    // toward its ancestor's *scrollable* overflow -- without this, that
    // reads as real overflow on the modal's own overflow-x-auto scroll
    // container and pops a horizontal scrollbar for the whole modal.
    // Clipping it here contains that to the checklist itself. Paired
    // with overflow-y-visible because clipping only one axis makes the
    // other compute to auto per the CSS overflow spec -- without it this
    // div would silently gain its own (unwanted) vertical scrollbar.
    <div className="space-y-4 md:space-y-3 max-sm:-mx-4 overflow-x-clip overflow-y-visible">
      {items.length > 0 ? (
        <div className="space-y-6 md:space-y-4">
          {sections.map((section) => {
            const uncheckedInSection = section.items.filter((it) => !it.done);
            const isDefault = section.id === DEFAULT_SECTION_ID;
            const isCollapsed = !isDefault && !!section.collapsed;

            const colorKey = !isDefault ? (section.color ?? "none") : null;
            const colorHex = colorKey
              ? (SECTION_COLORS.find((c) => c.key === colorKey)?.hex ?? null)
              : null;
            const accentBorder = colorHex
              ? { borderLeft: `3px solid ${hexAlpha(colorHex, dark ? 0.80 : 0.6)}` }
              : undefined;
            const itemsAreaStyle = colorHex
              ? { background: hexAlpha(colorHex, dark ? 0.09 : 0.04) }
              : undefined;

            if (isDefault) {
              return (
                <div key={section.id} data-section-block={section.id} className="space-y-3 md:space-y-1">
                  {insertPosition === "top" && topAddRow}
                  <div className="space-y-3">{uncheckedInSection.map(renderItemRow)}</div>
                  {insertPosition === "bottom" && topAddRow}
                </div>
              );
            }

            return (
              <div key={section.id} data-section-block={section.id} className="space-y-1 max-sm:-ml-2 max-sm:-mr-2">
                <div style={accentBorder}>
                  <div data-checklist-row data-section-header={section.id}>
                    <SectionHeader
                      section={section}
                      onRename={(title) => renameSection(section.id, title)}
                      onRemove={() => removeSection(section.id)}
                      onEnter={(pendingTitle) => {
                        // Atomically apply a pending title rename (from Enter key) + add item
                        // so both changes share one setEntries call and neither overwrites the other.
                        const base = pendingTitle !== undefined
                          ? updateEntry(items, section.id, { title: pendingTitle })
                          : items;
                        const newItem = makeItem("", false);
                        const next = insertPosition === "top"
                          ? insertAtSectionStart(base, section.id, newItem)
                          : insertAtSectionEnd(base, section.id, newItem);
                        setEntries(next);
                        syncEntries(next);
                        requestFocus(newItem.id, "end");
                      }}
                      onColorChange={(colorKey) => changeColor(section.id, colorKey)}
                      onHandlePointerDown={handleSectionPointerDown}
                      onHandlePointerMove={handleSectionPointerMove}
                      onHandlePointerUp={handleSectionPointerUp}
                      onHandlePointerCancel={handleSectionPointerCancel}
                      collapsed={isCollapsed}
                      onToggleCollapse={() => toggleSectionCollapse(section.id)}
                      count={uncheckedInSection.length}
                    />
                  </div>
                  {!isCollapsed && (
                    <div style={itemsAreaStyle}>
                      {uncheckedInSection.length > 0 && (
                        <div className="pl-3 space-y-3 pt-1 pb-1">
                          {uncheckedInSection.map(renderItemRow)}
                        </div>
                      )}
                      <button
                        type="button"
                        data-checklist-row
                        className="flex items-center gap-2 pl-4 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        onClick={() => addItemToSection(section.id)}
                      >
                        <span className="leading-none">+</span>
                        <span>{t("addToSectionEllipsis")}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="pt-1">
            <button
              type="button"
              onClick={addSection}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors border border-dashed border-[var(--border-light)] rounded px-2 py-1"
            >
              + {t("addSection")}
            </button>
          </div>

          {checkedItems.length > 0 && (
            <div className="border-t border-[var(--border-light)] pt-4 mt-4">
              <button
                type="button"
                onClick={() => setDoneCollapsed((c) => !c)}
                className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 -mx-2 rounded-sm mb-3 transition-colors"
              >
                <svg
                  className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 text-gray-400 dark:text-gray-500${doneCollapsed ? " -rotate-90" : ""}`}
                  fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  {t("done")}
                </span>
                <span
                  className="text-xs font-medium tabular-nums px-1.5 py-0.5 rounded-full ml-0.5"
                  style={{ background: hexAlpha("#64748b", 0.14), color: "#64748b" }}
                >
                  {checkedItems.length}
                </span>
              </button>
              {!doneCollapsed && (
                showSectionBreaks ? (
                  Array.from(checkedBySection.entries()).map(([sid, arr]) => {
                    const section = sections.find((s) => s.id === sid);
                    const label = section && section.title ? section.title : null;
                    return (
                      <div key={sid} className="mb-3">
                        {label && (
                          <div className="text-xs font-semibold tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                            {label}
                          </div>
                        )}
                        {arr.map((it) => (
                          <ChecklistRow
                            key={it.id}
                            item={it}
                            readOnly={false}
                            disableToggle={false}
                            showRemove={true}
                            size="lg"
                            onToggle={(checked, e) => {
                              e?.stopPropagation();
                              toggleItem(it.id, checked);
                            }}
                            onChange={(txt) => changeText(it.id, txt)}
                            onRemove={() => removeItem(it.id)}
                          />
                        ))}
                      </div>
                    );
                  })
                ) : (
                  (checkedBySection.get(DEFAULT_SECTION_ID) || []).map((it) => (
                    <ChecklistRow
                      key={it.id}
                      item={it}
                      readOnly={false}
                      disableToggle={false}
                      showRemove={true}
                      size="lg"
                      onToggle={(checked, e) => {
                        e?.stopPropagation();
                        toggleItem(it.id, checked);
                      }}
                      onChange={(txt) => changeText(it.id, txt)}
                      onRemove={() => removeItem(it.id)}
                    />
                  ))
                )
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {insertPosition === "top" && topAddRow}
          <p className="text-sm text-gray-500">{t("noItemsYet")}</p>
          {insertPosition === "bottom" && topAddRow}
          <div className="pt-2">
            <button
              type="button"
              onClick={addSection}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors border border-dashed border-[var(--border-light)] rounded px-2 py-1"
            >
              + {t("addSection")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

