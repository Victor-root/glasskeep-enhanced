import React from "react";
import Popover from "../common/Popover.jsx";
import { t } from "../../i18n";

/**
 * Sub-menu opened when the user clicks the "Image" action in the modal
 * footer. Offers two clearly separated choices:
 *   1. Add an image  → regular content image flow
 *   2. Add a logo    → note icon flow (compact visual identifier)
 *
 * Visual style mirrors the existing kebab menu in ModalFooter so the
 * UI feels consistent across the app.
 */
export default function AddImageMenu({
  anchorRef,
  open,
  onClose,
  dark,
  hasIcon,
  onAddImage,
  onAddIcon,
  onRemoveIcon,
}) {
  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose} showArrow>
      <div
        className={`min-w-[220px] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
        style={{ backgroundColor: dark ? "#222222" : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
          style={{ color: dark ? "#7dd3fc" : "#0284c7" }}
          onClick={() => { onAddImage(); onClose?.(); }}
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 11.5L11 14.51 14.5 10l4.5 6H5l3.5-4.5z" />
          </svg>
          <span>{t("addAnImage")}</span>
        </button>

        <button
          className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
          style={{ color: dark ? "#c4b5fd" : "#7c3aed" }}
          onClick={() => { onAddIcon(); onClose?.(); }}
        >
          {/* Tabler · photo-circle-plus */}
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12.5 21h-6.5a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v6.5" />
            <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l3.5 3.5" />
            <path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0" />
            <path d="M16 19h6" />
            <path d="M19 16v6" />
            <path d="M12.5 7.5l.01 0" />
          </svg>
          <span>{hasIcon ? t("replaceLogo") : t("addLogo")}</span>
        </button>

        {hasIcon && (
          <button
            className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm border-t border-[var(--border-light)] ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
            style={{ color: dark ? "#f87171" : "#dc2626" }}
            onClick={() => { onRemoveIcon(); onClose?.(); }}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            <span>{t("removeLogo")}</span>
          </button>
        )}
      </div>
    </Popover>
  );
}
