import React from "react";
import Popover from "../common/Popover.jsx";
import BottomSheet, { SheetRow } from "../common/BottomSheet.jsx";
import { t } from "../../i18n";

/**
 * Sub-menu opened when the user clicks the "Image" action in the modal
 * footer. Offers two clearly separated choices:
 *   1. Add an image  → regular content image flow
 *   2. Add a logo    → note icon flow (compact visual identifier)
 *
 * A popover styled like the kebab menu in ModalFooter, or a bottom sheet
 * (`asSheet`, mobile layout) on `sheetBackground`.
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
  asSheet = false,
  sheetBackground,
}) {
  const items = [
    {
      key: "image",
      color: dark ? "#7dd3fc" : "#0284c7",
      icon: (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 11.5L11 14.51 14.5 10l4.5 6H5l3.5-4.5z" />
        </svg>
      ),
      label: t("addAnImage"),
      run: onAddImage,
    },
    {
      key: "logo",
      color: dark ? "#c4b5fd" : "#7c3aed",
      // Tabler · photo-circle-plus (circular outline)
      icon: (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 8h.01" />
          <path d="M20.964 12.806a9 9 0 0 0 -8.964 -9.806a9 9 0 0 0 -9 9a9 9 0 0 0 9.397 8.991" />
          <path d="M4 15l4 -4c.928 -.893 2.072 -.893 3 0l4 4" />
          <path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0" />
          <path d="M16 19.33h6" />
          <path d="M19 16.33v6" />
        </svg>
      ),
      label: hasIcon ? t("replaceLogo") : t("addLogo"),
      run: onAddIcon,
    },
    hasIcon && {
      key: "removeLogo",
      color: dark ? "#f87171" : "#dc2626",
      icon: (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
      ),
      label: t("removeLogo"),
      run: onRemoveIcon,
    },
  ].filter(Boolean);
  const runItem = (item) => { item.run(); onClose?.(); };

  if (asSheet) {
    return (
      <BottomSheet open={open} onClose={onClose} title={t("image")} background={sheetBackground}>
        {items.map((item) => (
          <SheetRow key={item.key} icon={item.icon} color={item.color} label={item.label} onClick={() => runItem(item)} />
        ))}
      </BottomSheet>
    );
  }

  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose} showArrow>
      <div
        className={`min-w-[220px] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
        style={{ backgroundColor: dark ? "#222222" : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <button
            key={item.key}
            className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${item.key === "removeLogo" ? "border-t border-[var(--border-light)] " : ""}${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
            style={{ color: item.color }}
            onClick={() => runItem(item)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}
