// Commands to make code-block conversion behave like every editor users
// actually expect: a multi-block selection turns into ONE code block whose
// lines are separated by newlines, not a stack of separate single-line
// code blocks.
//
// Tiptap's default `toggleCodeBlock()` delegates to `toggleNode`, which is
// "one node per block" — fine for headings, wrong for code blocks since
// humans read a code block as a contiguous piece of code.

import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

export const SmartCodeBlock = Extension.create({
  name: "smartCodeBlock",

  addCommands() {
    return {
      smartToggleCodeBlock: () => ({ state, tr, dispatch, editor }) => {
        const { schema, selection } = state;
        const codeBlockType = schema.nodes.codeBlock;
        const paragraphType = schema.nodes.paragraph;
        if (!codeBlockType || !paragraphType) return false;

        // Already inside a code block: unwrap to a paragraph, preserving text
        // (newlines become hard breaks so the user's layout survives).
        if (editor.isActive("codeBlock")) {
          const $from = state.doc.resolve(selection.from);
          const depth = $from.depth;
          for (let d = depth; d >= 0; d--) {
            const node = $from.node(d);
            if (node.type === codeBlockType) {
              const start = $from.start(d) - 1;
              const end = start + node.nodeSize;
              const text = node.textContent;
              const lines = text.split("\n");
              const hardBreak = schema.nodes.hardBreak;
              const content = [];
              lines.forEach((line, i) => {
                if (i > 0 && hardBreak) content.push(hardBreak.create());
                if (line.length) content.push(schema.text(line));
              });
              const replacement = paragraphType.create(null, content);
              tr.replaceRangeWith(start, end, replacement);
              if (dispatch) dispatch(tr);
              return true;
            }
          }
          return false;
        }

        // Selection (or caret) → collect the textContent of every block the
        // selection touches, join them with \n, replace the whole range with
        // a single code block.
        const from = Math.min(selection.from, selection.to);
        const to = Math.max(selection.from, selection.to);
        const $from = state.doc.resolve(from);
        const $to = state.doc.resolve(to);
        const blockFrom = $from.before(1);
        const blockTo = $to.after(1);

        const lines = [];
        state.doc.nodesBetween(blockFrom, blockTo, (node) => {
          if (!node.isTextblock) return true;
          // `inlineContent` nodes contribute one "line" per block. We already
          // preserve inner hard-breaks as \n by reading textContent (PM turns
          // hardBreak into "\n" when we iterate with textBetween(..., "\n")).
          lines.push(node.textBetween(0, node.content.size, "\n", "\n"));
          return false; // don't descend into inlineContent
        });
        const joined = lines.join("\n");
        const content = joined.length ? [schema.text(joined)] : [];
        const codeBlock = codeBlockType.create(null, content);
        tr.replaceRangeWith(blockFrom, blockTo, codeBlock);
        // Place the caret at the end of the new code block.
        const caret = blockFrom + codeBlock.nodeSize - 1;
        tr.setSelection(TextSelection.create(tr.doc, caret));
        if (dispatch) dispatch(tr);
        return true;
      },
    };
  },
});

export default SmartCodeBlock;
