import React from "react";
import { Popover } from "./Popover.jsx";
import Swatches from "./Swatches.jsx";
import { PRESET_TEXT_COLORS } from "./toolbarPresets.js";

// Text colour picker.
export default function ColorPopover({ editor, anchorRef, open, onClose }) {
  const current = editor.getAttributes("textStyle")?.color || null;
  const apply = (c) => {
    editor.chain().focus().setColor(c).run();
    onClose?.();
  };
  const clear = () => {
    editor.chain().focus().unsetColor().run();
    onClose?.();
  };
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--color">
      <Swatches colors={PRESET_TEXT_COLORS} onPick={apply} current={current} onClear={clear} />
    </Popover>
  );
}
