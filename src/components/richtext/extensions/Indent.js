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
      types: ["paragraph", "heading", "blockquote", "codeBlock"],
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
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (!this.options.types.includes(node.type.name)) return;
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
