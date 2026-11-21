// Ordered list numbering as in Word or LibreOffice.
//
// Each ordered list carries a `listId`. Lists sharing one continue each
// other's numbering across whatever stands between them: removing the
// number of a middle item, or Enter on an empty middle item, splits the
// list in two halves that keep the id, so the second half goes on from
// where the first stopped. A list started by typing "1. " or "5. " gets
// an id of its own and starts at the typed number; the toolbar button and
// Ctrl+Shift+7 continue the closest list above, as Word does.
//
// Lists saved before this have no id: they keep their former numbering,
// restarting after anything but a code block, and get their ids when an
// editor opens them.
//
// The editor shows the numbers through a `start` attribute decoration;
// read mode writes the same numbers into the rendered HTML
// (withListStarts, used by utils/richText.js).

import { OrderedList } from "@tiptap/extension-list";
import { wrappingInputRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { wordSelectionToggle } from "./ListToggles.js";

const CONTINUE_META = "gkContinueList";
const numberingKey = new PluginKey("listNumbering");

const newListId = () => Math.random().toString(36).slice(2, 10);

// Visits every ordered list with what came before it in the same
// container (the document, a quote, a list item): `previous`, the closest
// list above; `legacyPrevious`, the list it continued before ids existed
// (only code blocks in between); `byId`, the last list of each id. Lists
// continue only within their container. `visit` returns the list's entry.
function eachOrderedList(doc, visit) {
  const scan = (node, contentStart) => {
    const seen = { previous: null, legacyPrevious: null, byId: new Map() };
    node.forEach((child, offset) => {
      const pos = contentStart + offset;
      if (child.type.name === "orderedList") {
        const entry = visit(child, pos, seen);
        seen.previous = entry;
        seen.legacyPrevious = entry;
        if (entry.listId) seen.byId.set(entry.listId, entry);
      } else if (child.type.name !== "codeBlock") {
        seen.legacyPrevious = null;
      }
      if (!child.isTextblock && !child.isLeaf) scan(child, pos + 1);
    });
  };
  scan(doc, 0);
}

// First number shown by every ordered list of `doc`: Map(pos → number).
export function orderedListStarts(doc) {
  const starts = new Map();
  eachOrderedList(doc, (node, pos, seen) => {
    const { listId, start } = node.attrs;
    let first = Number.isFinite(start) ? start : 1;
    const continued = listId ? seen.byId.get(listId) : seen.legacyPrevious;
    if (continued) first = continued.next;
    starts.set(pos, first);
    return { listId, next: first + node.childCount };
  });
  return starts;
}

// Gives an id to every ordered list without one: the closest list above
// when `continuePrevious`, else the list it continued before ids existed,
// else a new one.
export function assignListIds(tr, { continuePrevious = false } = {}) {
  eachOrderedList(tr.doc, (node, pos, seen) => {
    let { listId } = node.attrs;
    if (!listId) {
      listId = (continuePrevious && seen.previous?.listId) || seen.legacyPrevious?.listId || newListId();
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, listId });
    }
    return { listId };
  });
  return tr;
}

// Writes each list's shown first number into its `start`, for a static
// render of the document.
export function withListStarts(tr) {
  for (const [pos, first] of orderedListStarts(tr.doc)) {
    const node = tr.doc.nodeAt(pos);
    if (node.attrs.start !== first) tr.setNodeMarkup(pos, undefined, { ...node.attrs, start: first });
  }
  return tr;
}

function numberDecorations(doc) {
  const decorations = [];
  for (const [pos, first] of orderedListStarts(doc)) {
    const node = doc.nodeAt(pos);
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { start: String(first) }));
  }
  return DecorationSet.create(doc, decorations);
}

export const NumberedOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-list-id"),
        renderHTML: (attrs) => (attrs.listId ? { "data-list-id": attrs.listId } : {}),
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      toggleOrderedList: () => wordSelectionToggle(this, (tr) => tr.setMeta(CONTINUE_META, true)),
    };
  },

  addInputRules() {
    return [
      wrappingInputRule({
        find: /^(\d+)\.\s$/,
        type: this.type,
        getAttributes: (match) => ({ start: +match[1], listId: newListId() }),
        joinPredicate: (match, node) =>
          (!node.attrs.type || node.attrs.type === "1") && node.childCount + node.attrs.start === +match[1],
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() || []),
      new Plugin({
        key: numberingKey,
        state: {
          init: (_, state) => numberDecorations(state.doc),
          apply: (tr, decorations, _old, state) => (tr.docChanged ? numberDecorations(state.doc) : decorations),
        },
        props: {
          decorations: (state) => numberingKey.getState(state),
        },
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          const continuePrevious = transactions.some((t) => t.getMeta(CONTINUE_META));
          const tr = assignListIds(newState.tr, { continuePrevious });
          return tr.docChanged ? tr : null;
        },
        // Lists saved before ids existed get theirs on opening, with no
        // save and no undo step.
        view(view) {
          queueMicrotask(() => {
            if (view.isDestroyed) return;
            const tr = assignListIds(view.state.tr);
            if (tr.docChanged) view.dispatch(tr.setMeta("addToHistory", false).setMeta("preventUpdate", true));
          });
          return {};
        },
      }),
    ];
  },
});

export default NumberedOrderedList;
