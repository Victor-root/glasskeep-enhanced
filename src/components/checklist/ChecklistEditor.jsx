import React from "react";
import { t } from "../../i18n";
import ChecklistRow from "../common/ChecklistRow.jsx";
import SectionHeader from "./SectionHeader.jsx";
import useChecklistDrag from "../../hooks/useChecklistDrag.js";
import {
  DEFAULT_SECTION_ID,
  findPrevItemId,
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
  removeEntry,
  removeSectionWithItems,
  sectionIdForItem,
  updateEntry,
} from "../../utils/checklist.js";

/**
 * Full checklist editor. Source of truth is the flat `entries` array
 * (passed in as `mItems`). Contains both regular items and section
 * headers; ordering in the array is the logical ordering.
 *
 * Keyboard:
 *   - Enter            → insert a new empty item right after the current one
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
}) {
  const items = React.useMemo(() => normalizeItems(entries), [entries]);
  const sections = React.useMemo(() => getSections(items), [items]);

  // Focus request: incremented every time we want to move focus.
  const [focusToken, setFocusToken] = React.useState(0);
  const [focusItemId, setFocusItemId] = React.useState(null);
  const [focusCaret, setFocusCaret] = React.useState("end");
  const requestFocus = React.useCallback((id, caret = "end") => {
    setFocusItemId(id);
    setFocusCaret(caret);
    setFocusToken((n) => n + 1);
  }, []);

  // Drag & drop within the unchecked list.
  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } =
    useChecklistDrag(items, setEntries, syncEntries);

  const commit = (next) => {
    setEntries(next);
    syncEntries(next);
  };

  // ---------- Item-level edits ----------
  const toggleItem = (id, checked) => {
    // Preserve order. Checked items stay in place in the array; render
    // code groups them visually at the bottom.
    commit(updateEntry(items, id, { done: !!checked }));
  };

  const changeText = (id, text) => {
    commit(updateEntry(items, id, { text }));
  };

  const removeItem = (id) => {
    commit(removeEntry(items, id));
  };

  // Enter inside an item. Respects the global insert preference so
  // rapid-fire Enter presses keep accumulating items on the user's
  // preferred side (top/bottom) rather than always drifting downward.
  const addItemAdjacent = (anchorId) => {
    const newItem = makeItem("", false);
    const next =
      insertPosition === "top"
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

  const removeSection = (id) => {
    // Cascade delete: drop the section marker AND every item it owns.
    commit(removeSectionWithItems(items, id));
  };

  // Called when the user presses Enter inside a section's title input.
  // Moves focus into the section so typing keeps flowing; creates an
  // empty item on demand if the section is empty.
  const focusFirstItemInSection = (sectionId) => {
    const sec = sections.find((s) => s.id === sectionId);
    const firstUnchecked = sec?.items.find((it) => !it.done);
    if (firstUnchecked) {
      requestFocus(firstUnchecked.id, "end");
    } else {
      addItemToSection(sectionId);
    }
  };

  // ---------- Rendering helpers ----------
  const checkedItems = items.filter((e) => isItem(e) && e.done);
  // Map each checked item to its original section (for the Done group).
  const checkedBySection = React.useMemo(() => {
    const map = new Map();
    for (const it of checkedItems) {
      const sid = sectionIdForItem(items, it.id) || DEFAULT_SECTION_ID;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid).push(it);
    }
    return map;
  }, [items, checkedItems]);

  const showSectionBreaks = hasSections(items);

  const renderItemRow = (it) => (
    <div
      key={it.id}
      data-checklist-item={it.id}
      data-checklist-row
      className="group flex items-center gap-2"
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
          focusItemId={focusItemId}
          focusToken={focusToken}
          focusCaret={focusCaret}
          onToggle={(checked, e) => {
            e?.stopPropagation();
            toggleItem(it.id, checked);
          }}
          onChange={(txt) => changeText(it.id, txt)}
          onRemove={() => removeItem(it.id)}
          onEnter={() => addItemAdjacent(it.id)}
          onBackspaceEmpty={() => removeAndFocusPrev(it.id)}
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
    <div className="space-y-4 md:space-y-2 max-sm:-mx-4">
      {insertPosition === "top" && topAddRow}

      {items.length > 0 ? (
        <div className="space-y-4 md:space-y-2">
          {sections.map((section) => {
            const uncheckedInSection = section.items.filter((it) => !it.done);
            const isDefault = section.id === DEFAULT_SECTION_ID;
            // Hide an empty, untitled default section if sections exist.
            if (isDefault && uncheckedInSection.length === 0 && showSectionBreaks) return null;
            const sectionAddBtn = !isDefault ? (
              <button
                type="button"
                data-checklist-row
                className="flex items-center gap-2 pl-8 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                onClick={() => addItemToSection(section.id)}
              >
                <span className="leading-none">+</span>
                <span>{t("listItemEllipsis")}</span>
              </button>
            ) : null;
            return (
              <div key={section.id} className="space-y-4 md:space-y-2">
                {!isDefault && (
                  <div data-checklist-row>
                    <SectionHeader
                      section={section}
                      onRename={(title) => renameSection(section.id, title)}
                      onRemove={() => removeSection(section.id)}
                      onEnter={() => focusFirstItemInSection(section.id)}
                    />
                  </div>
                )}
                {insertPosition === "top" && sectionAddBtn}
                {uncheckedInSection.map(renderItemRow)}
                {insertPosition === "bottom" && sectionAddBtn}
              </div>
            );
          })}

          {insertPosition === "bottom" && topAddRow}

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
              <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
                {t("done")}
              </h4>
              {showSectionBreaks ? (
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
                checkedItems.map((it) => (
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
              )}
            </div>
          )}
        </div>
      ) : (
        <>
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

