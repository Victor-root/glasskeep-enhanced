import React from "react";
import { t } from "../../i18n";
import ChecklistItemRow from "./ChecklistItemRow.jsx";
import ChecklistSection from "./ChecklistSection.jsx";
import ChecklistDoneArea from "./ChecklistDoneArea.jsx";
import { useDark } from "./useDark.js";
import useChecklistDrag from "../../hooks/useChecklistDrag.js";
import {
  DEFAULT_SECTION_ID,
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
  readOnly = false,
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
    try { localStorage.setItem(`ck-done-${noteId}`, doneCollapsed ? "1" : "0"); } catch { /* storage unavailable: state stays in memory */ }
  }, [doneCollapsed, noteId]);

  // Section collapsed/expanded state is persisted ON the section entry
  // (`collapsed: true`) so it syncs across devices via the note's items
  // array — toggling it saves the note like any other checklist edit.
  const toggleSectionCollapse = (id) => {
    if (readOnly) return;
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
    if (readOnly) return;
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
    if (readOnly) return;
    commit(updateEntry(items, id, { text }));
  };

  const removeItem = (id) => {
    if (readOnly) return;
    commit(removeEntry(items, id));
  };

  // Indent/outdent, Google-Keep style (Ctrl+]/Ctrl+[ or the drag handle).
  // Indenting the first item of a list/section is a no-op: canIndentItem
  // already encodes that rule (also enforced defensively in
  // normalizeItems, so it can never actually persist either way).
  // Outdenting has no precondition beyond "is currently indented" — no-op
  // otherwise, so this never fires a needless save.
  const indentItem = (id) => {
    if (readOnly || !canIndentItem(items, id)) return;
    commit(updateEntry(items, id, { indent: 1 }));
  };

  const outdentItem = (id) => {
    if (readOnly) return;
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
    if (readOnly) return;
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
    if (readOnly) return;
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
    if (readOnly) return;
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
    if (readOnly) return;
    const prevId = findPrevItemId(items, id);
    const next = removeEntry(items, id);
    setEntries(next);
    syncEntries(next);
    if (prevId) requestFocus(prevId, "end");
  };

  // ---------- Section-level edits ----------
  const addSection = () => {
    if (readOnly) return;
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
    if (readOnly) return;
    commit(updateEntry(items, id, { title }));
  };

  const changeColor = (id, colorKey) => {
    if (readOnly) return;
    commit(updateEntry(items, id, { color: colorKey }));
  };

  const removeSection = (id) => {
    if (readOnly) return;
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
    <ChecklistItemRow
      key={it.id}
      item={it}
      readOnly={readOnly}
      focusItemId={focusItemId}
      focusToken={focusToken}
      focusCaret={focusCaret}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onToggle={toggleItem}
      onChangeText={changeText}
      onEnter={addItemAdjacent}
      onBackspaceEmpty={removeAndFocusPrev}
      onIndent={indentItem}
      onOutdent={outdentItem}
      onRemove={removeItem}
    />
  );

  // ---------- Layout ----------
  const topAddRow = readOnly ? null : (
    <div
      data-checklist-row
      className="flex items-center gap-2 cursor-pointer p-2 border-b border-[var(--border-light)] text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-100 transition-colors"
      onClick={addItemTopOrBottom}
    >
      <span className="text-lg leading-none">+</span>
      <span className="text-sm">{t("listItemEllipsis")}</span>
    </div>
  );

  const addSectionButton = (
    <button
      type="button"
      onClick={addSection}
      className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors border border-dashed border-[var(--border-light)] rounded px-2 py-1"
    >
      + {t("addSection")}
    </button>
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

            if (section.id === DEFAULT_SECTION_ID) {
              return (
                <div key={section.id} data-section-block={section.id} className="space-y-3 md:space-y-1">
                  {insertPosition === "top" && topAddRow}
                  <div className="space-y-3">{uncheckedInSection.map(renderItemRow)}</div>
                  {insertPosition === "bottom" && topAddRow}
                </div>
              );
            }

            return (
              <ChecklistSection
                key={section.id}
                section={section}
                uncheckedItems={uncheckedInSection}
                collapsed={!!section.collapsed}
                dark={dark}
                readOnly={readOnly}
                renderItemRow={renderItemRow}
                onRename={(title) => renameSection(section.id, title)}
                onRemove={() => removeSection(section.id)}
                onEnter={readOnly ? undefined : (pendingTitle) => {
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
                onColorChange={readOnly ? undefined : (colorKey) => changeColor(section.id, colorKey)}
                onHandlePointerDown={readOnly ? undefined : handleSectionPointerDown}
                onHandlePointerMove={handleSectionPointerMove}
                onHandlePointerUp={handleSectionPointerUp}
                onHandlePointerCancel={handleSectionPointerCancel}
                onToggleCollapse={readOnly ? undefined : () => toggleSectionCollapse(section.id)}
                onAddItem={() => addItemToSection(section.id)}
              />
            );
          })}

          {!readOnly && (
            <div className="pt-1">
              {addSectionButton}
            </div>
          )}

          {checkedItems.length > 0 && (
            <ChecklistDoneArea
              checkedCount={checkedItems.length}
              collapsed={doneCollapsed}
              onToggleCollapsed={() => setDoneCollapsed((c) => !c)}
              showSectionBreaks={showSectionBreaks}
              checkedBySection={checkedBySection}
              sections={sections}
              readOnly={readOnly}
              onToggle={toggleItem}
              onChangeText={changeText}
              onRemove={removeItem}
            />
          )}
        </div>
      ) : (
        <>
          {insertPosition === "top" && topAddRow}
          <p className="text-sm text-gray-500">{t("noItemsYet")}</p>
          {insertPosition === "bottom" && topAddRow}
          {!readOnly && (
            <div className="pt-2">
              {addSectionButton}
            </div>
          )}
        </>
      )}
    </div>
  );
}

