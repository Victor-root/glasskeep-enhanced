import React from "react";

// Every plain control of the rich-text toolbar renders this `rt-btn`
// primitive so active / hover / focus / disabled states stay consistent.
// mousedown is cancelled so a click never takes the focus from the editor.
export default function ToolbarButton({ active, onClick, disabled, title, children, className = "" }) {
  return (
    <button
      type="button"
      className={`rt-btn${active ? " is-active" : ""} ${className}`}
      data-tooltip={title}
      aria-label={title}
      aria-pressed={active ? "true" : undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        onClick(e);
      }}
    >
      {children}
    </button>
  );
}
