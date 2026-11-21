// The list buttons and shortcuts take in the blocks of the selection as
// Word does: a selection ending at the very start of a block leaves that
// block out. Ctrl+A ends in the empty line the editor keeps after the last
// block, and taking a whole list's numbers off numbered that line instead.

import { AllSelection, TextSelection } from "@tiptap/pm/state";

function leaveOutBlockAtEnd(tr) {
  // Ctrl+A selects the whole document, from outside its first and last
  // blocks: take it from the first textblock to the last one.
  const selection = tr.selection instanceof AllSelection
    ? TextSelection.between(tr.selection.$from, tr.selection.$to)
    : tr.selection;
  const { $from, $to, empty } = selection;
  if (empty || $to.parentOffset !== 0 || $from.sameParent($to)) return;
  const end = TextSelection.near(tr.doc.resolve($to.before()), -1);
  if (end.from > $from.pos) tr.setSelection(TextSelection.create(tr.doc, $from.pos, end.from));
}

// The list's toggle command, taking the selection in as above. `before`
// runs on the transaction first (the ordered list marks it there).
export function wordSelectionToggle(extension, before = () => {}) {
  return ({ chain }) =>
    chain()
      .command(({ tr }) => {
        leaveOutBlockAtEnd(tr);
        before(tr);
        return true;
      })
      .toggleList(extension.name, extension.options.itemTypeName, extension.options.keepMarks)
      .run();
}

export function withWordSelection(extension, command) {
  return extension.extend({
    addCommands() {
      return { ...this.parent?.(), [command]: () => wordSelectionToggle(this) };
    },
  });
}
