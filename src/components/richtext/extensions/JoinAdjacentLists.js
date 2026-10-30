// Two lists of the same kind that touch become one, as in Word or
// LibreOffice: deleting the empty line between "1. 2. 3." and "1. 2. 3."
// leaves a single list numbered 1 to 6. ProseMirror leaves them side by
// side, as two lists, whose numbering then restarts.
//
// The same join runs on every edit (one undo step with the edit itself),
// on the document an editor opens with (no save, no undo step), and on the
// read-mode render (utils/richText.js), so notes saved before this show
// right too. Lists of different kinds stay apart.

import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { canJoin } from "@tiptap/pm/transform";

const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

// Joins every pair of touching same-kind lists in `tr`'s document, at any
// depth. Returns `tr`.
export function joinAdjacentLists(tr) {
  const joins = [];
  const scan = (node, start) => {
    let previous = null;
    node.forEach((child, offset) => {
      const pos = start + offset;
      if (previous && previous.type === child.type && LIST_TYPES.has(child.type.name)) joins.push(pos);
      previous = child;
      if (!child.isTextblock && !child.isLeaf) scan(child, pos + 1);
    });
  };
  scan(tr.doc, 0);
  // From the end, so each join leaves the earlier positions where they were.
  for (const pos of joins.reverse()) {
    if (canJoin(tr.doc, pos)) tr.join(pos);
  }
  return tr;
}

export default Extension.create({
  name: "joinAdjacentLists",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const tr = joinAdjacentLists(newState.tr);
          return tr.docChanged ? tr : null;
        },
        // Once the editor is fully set up: plugin views are created inside
        // the view's constructor, before Tiptap can take a transaction.
        view(view) {
          queueMicrotask(() => {
            if (view.isDestroyed) return;
            const tr = joinAdjacentLists(view.state.tr);
            if (tr.docChanged) {
              view.dispatch(tr.setMeta("addToHistory", false).setMeta("preventUpdate", true));
            }
          });
          return {};
        },
      }),
    ];
  },
});
