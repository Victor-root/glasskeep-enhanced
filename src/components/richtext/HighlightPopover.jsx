import React from "react";
import { Popover } from "./Popover.jsx";
import Swatches from "./Swatches.jsx";
import { PRESET_HIGHLIGHTS } from "./toolbarPresets.js";

// Highlight colour picker.
export default function HighlightPopover({ editor, anchorRef, open, onClose }) {
  const current = editor.getAttributes("highlight")?.color || null;
  const apply = (c) => {
    editor.chain().focus().setHighlight({ color: c }).run();
    onClose?.();
  };
  const clear = () => {
    editor.chain().focus().unsetHighlight().run();
    onClose?.();
  };
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--highlight">
      <Swatches colors={PRESET_HIGHLIGHTS} onPick={apply} current={current} onClear={clear} />
    </Popover>
  );
}
