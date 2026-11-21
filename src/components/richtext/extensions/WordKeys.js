// Keys that behave as in Word or LibreOffice while typing.
//
//   Backspace at the start of a list item (not the first one) takes its
//     number away: the text stays under the item above, indented, and the
//     list goes on numbering after it.
//   Tab nests a list item, or types a tab anywhere else; Shift+Tab takes a
//     nested item up a level. Neither moves the focus out of the note.
//   Delete at the end of a paragraph followed by a list brings the first
//     item's text up into the paragraph.
//   Enter starts a new undo step, so Ctrl+Z takes back the last line typed
//     instead of everything typed quickly before it.
//   Formatting chosen for an empty line (bold, colour...) survives that
//     line leaving a list or a quote.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { canJoin } from "@tiptap/pm/transform";
import { closeHistory } from "@tiptap/pm/history";

const ITEM_TYPES = new Set(["listItem", "taskItem"]);
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

// The list item holding the cursor's textblock, when that textblock is the
// item's first child: { depth, node }.
function itemOfFirstChild($from) {
  const depth = $from.depth - 1;
  if (depth < 1 || $from.index(depth) !== 0) return null;
  const node = $from.node(depth);
  return ITEM_TYPES.has(node.type.name) ? { depth, node } : null;
}

function innermostItem($from) {
  for (let d = $from.depth; d > 0; d--) {
    if (ITEM_TYPES.has($from.node(d).type.name)) return { depth: d, node: $from.node(d) };
  }
  return null;
}

export const isInListItem = ($pos) => innermostItem($pos) !== null;

export const WordKeys = Extension.create({
  name: "wordKeys",
  // Ahead of the list keymaps of the starter kit.
  priority: 200,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parentOffset !== 0) return false;
        const item = itemOfFirstChild($from);
        if (!item || item.node.type.name !== "listItem" || $from.index(item.depth - 1) === 0) return false;
        const between = $from.before(item.depth);
        if (!canJoin(state.doc, between)) return false;
        editor.view.dispatch(state.tr.join(between).scrollIntoView());
        return true;
      },

      Delete: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty || !$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size) return false;
        if (innermostItem($from)) return false;
        const after = $from.after();
        const list = state.doc.nodeAt(after);
        if (!list || !LIST_TYPES.has(list.type.name)) return false;
        // Into the first item's first textblock.
        let target = null;
        list.firstChild.descendants((node, pos) => {
          if (target !== null) return false;
          if (node.isTextblock) target = after + 2 + pos + 1;
          return !node.isTextblock;
        });
        if (target === null) return false;
        editor.view.dispatch(state.tr.delete($from.pos, target).scrollIntoView());
        return true;
      },

      Tab: ({ editor }) => {
        const item = innermostItem(editor.state.selection.$from);
        if (item) {
          editor.commands.sinkListItem(item.node.type.name);
          return true;
        }
        return editor.commands.insertContent("\t");
      },

      "Shift-Tab": ({ editor }) => {
        const { $from } = editor.state.selection;
        const item = innermostItem($from);
        if (!item) return false;
        // Only a nested item goes up; a top-level one stays in its list.
        if (innermostItem($from.doc.resolve($from.before(item.depth)))) {
          editor.commands.liftListItem(item.node.type.name);
        }
        return true;
      },

      Enter: ({ editor }) => {
        editor.view.dispatch(closeHistory(editor.state.tr));
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("wordKeysMarks"),
        appendTransaction(transactions, oldState, newState) {
          const marks = oldState.storedMarks;
          if (!marks?.length || newState.storedMarks || !transactions.some((t) => t.docChanged)) return null;
          if (transactions.some((t) => t.storedMarksSet)) return null;
          const wasEmptyLine = oldState.selection.empty && oldState.selection.$from.parent.content.size === 0;
          const isEmptyLine = newState.selection.empty && newState.selection.$from.parent.isTextblock && newState.selection.$from.parent.content.size === 0;
          return wasEmptyLine && isEmptyLine ? newState.tr.setStoredMarks(marks) : null;
        },
      }),
    ];
  },
});

export default WordKeys;
