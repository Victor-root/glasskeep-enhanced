// Paragraph / heading / blockquote / code-block indentation.
//
// The default Tiptap starter kit only offers indent-like behaviour through
// list items (sinkListItem / liftListItem). This extension adds a block
// attribute `indent` (0..MAX) on the supported node types and two commands
// that iterate over the current selection.
//
// We render the indent as `style="margin-inline-start: Nem"` so it works
// in LTR/RTL and mirrors the look of document editors without altering the
// underlying schema.

import { Extension } from "@tiptap/core";

export const INDENT_STEP_EM = 1.75;

export const Indent = Extension.create({
  name: "indent",

  addOptions() {
    return {
      types: ["paragraph", "heading", "blockquote", "codeBlock", "listItem"],
      min: 0,
      max: 8,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const raw = el.getAttribute("data-indent");
              const v = parseInt(raw || "0", 10);
              return Number.isFinite(v) && v > 0 ? v : 0;
            },
            renderHTML: (attrs) => {
              const n = Number(attrs.indent) || 0;
              if (!n) return {};
              return {
                "data-indent": String(n),
                style: `margin-inline-start: ${n * INDENT_STEP_EM}em`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const bump = (direction) => ({ tr, state, dispatch }) => {
      const { selection } = state;
      const from = Math.min(selection.from, selection.to);
      const to = Math.max(selection.from, selection.to);
      let changed = false;
      // We need to know each node's parent so we can collapse the indent
      // onto the OUTERMOST applicable node instead of stacking it on
      // every nested layer (e.g. a paragraph inside a listItem must not
      // get its own margin-inline-start, otherwise the text shifts by
      // 2× the configured step while the bullet only shifts by 1×).
      state.doc.nodesBetween(from, to, (node, pos, parent) => {
        if (!this.options.types.includes(node.type.name)) return;
        // Inside a listItem, only the <li> itself carries the indent —
        // its inner paragraph stays neutral so the bullet / number and
        // the text shift together.
        if (
          node.type.name === "paragraph" &&
          parent &&
          parent.type.name === "listItem"
        ) {
          return;
        }
        const current = Number(node.attrs.indent) || 0;
        const next = Math.max(
          this.options.min,
          Math.min(this.options.max, current + direction),
        );
        if (next !== current) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
          changed = true;
        }
      });
      if (!changed) return false;
      if (dispatch) dispatch(tr);
      return true;
    };

    return {
      indent: () => bump(1),
      outdent: () => bump(-1),
    };
  },
});

export default Indent;
