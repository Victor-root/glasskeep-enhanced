import React from "react";
import { t } from "../../i18n";

function HistoryButton({ isDesktop, btnClass, enabled, onRun, tooltipKey, labelKey, children }) {
  return (
    <button
      className={`${btnClass} focus:outline-none ${!enabled ? "opacity-50 cursor-default" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => { if (enabled) { if (!isDesktop) document.activeElement?.blur(); onRun(); } }}
      data-tooltip={!isDesktop ? t(tooltipKey) : undefined}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      {isDesktop && <span>{t(labelKey)}</span>}
    </button>
  );
}

// Undo and redo buttons of the modal footer.
export default function FooterUndoRedoButtons({ isDesktop, btnClass, undo, redo, canUndo, canRedo }) {
  return (
    <>
      <HistoryButton isDesktop={isDesktop} btnClass={btnClass} enabled={canUndo} onRun={undo} tooltipKey="undo" labelKey="undoShortcut">
        <path d="M3 10h13a4 4 0 0 1 0 8H7" />
        <path d="M3 10l4-4" />
        <path d="M3 10l4 4" />
      </HistoryButton>
      <HistoryButton isDesktop={isDesktop} btnClass={btnClass} enabled={canRedo} onRun={redo} tooltipKey="redo" labelKey="redoShortcut">
        <path d="M21 10H8a4 4 0 0 0 0 8h10" />
        <path d="M21 10l-4-4" />
        <path d="M21 10l-4 4" />
      </HistoryButton>
    </>
  );
}
