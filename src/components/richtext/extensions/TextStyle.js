// TextStyle mark whose removeEmptyTextStyle only looks at the selected text.
//
// unsetColor(), unsetFontSize() and unsetFontFamily() set the attribute to
// null and then call removeEmptyTextStyle(). Up to Tiptap 3.30.2 that
// command also treated the list or blockquote holding the selection as a
// node without any style, and removed every textStyle mark inside it: one
// colour taken off in a list item wiped the colours, sizes and fonts of the
// whole list. Tiptap 3.30.3 fixed it by skipping every non-inline node;
// this is that version of the command. Drop this file once the editor runs
// Tiptap 3.30.3 or later.

import { TextStyle as BaseTextStyle } from "@tiptap/extension-text-style";

export const TextStyle = BaseTextStyle.extend({
  addCommands() {
    return {
      ...this.parent?.(),
      removeEmptyTextStyle:
        () =>
        ({ tr }) => {
          const { selection } = tr;
          tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            // The text style only applies to inline nodes.
            if (!node.isInline) return true;
            const styled = node.marks
              .filter((mark) => mark.type === this.type)
              .some((mark) => Object.values(mark.attrs).some((value) => !!value));
            if (!styled) tr.removeMark(pos, pos + node.nodeSize, this.type);
          });
          return true;
        },
    };
  },
});

export default TextStyle;
