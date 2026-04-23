// In-app link editor — replaces window.prompt.
//
// Detects whether the current selection already carries a link (extends the
// caret to the full link range when inside one) and offers create / update /
// remove actions. Anchored via the shared fixed-position Popover so it
// never pushes the modal's scroll width (fixes the "horizontal scrollbar on
// open" regression).

import React, { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { Popover } from "./Popover.jsx";
import RichIcons from "./RichIcons.jsx";

function ensureSchemeURL(raw) {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/^(https?|mailto|tel):/i.test(v)) return v;
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(v)) return `mailto:${v}`;
  if (/^\+?\d[\d\s().-]+$/.test(v)) return `tel:${v.replace(/[^\d+]/g, "")}`;
  return `https://${v}`;
}

export default function LinkPopover({ editor, anchorRef, open, onClose }) {
  const inputRef = useRef(null);
  const [href, setHref] = useState("");
  const existingHref = editor?.getAttributes("link")?.href || "";
  const isLinkActive = !!existingHref;

  useEffect(() => {
    if (!open) return;
    setHref(existingHref || "");
    // Focus the URL field on open so the user can type immediately. Defer
    // to the next frame so the popover is already positioned.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, existingHref]);

  if (!editor) return null;

  const apply = () => {
    const url = ensureSchemeURL(href);
    if (!url) return;
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
    onClose?.();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose?.();
  };

  const visit = () => {
    const url = ensureSchemeURL(href || existingHref);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      className="rt-pop--link"
      preferredWidth={300}
    >
      <input
        ref={inputRef}
        type="url"
        className="rt-link-input"
        placeholder="https://…"
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <div className="rt-link-actions">
        <button
          type="button"
          className="rt-link-btn rt-link-btn--primary"
          onMouseDown={(e) => e.preventDefault()}
          onClick={apply}
          disabled={!href.trim()}
        >
          {isLinkActive ? t("linkUpdate") : t("linkApply")}
        </button>
        {isLinkActive && (
          <>
            <button
              type="button"
              className="rt-link-btn rt-link-btn--icon"
              onMouseDown={(e) => e.preventDefault()}
              onClick={visit}
              title={t("linkOpen")}
              aria-label={t("linkOpen")}
            >
              <RichIcons.LinkOpen />
            </button>
            <button
              type="button"
              className="rt-link-btn rt-link-btn--danger"
              onMouseDown={(e) => e.preventDefault()}
              onClick={remove}
            >
              {t("linkRemove")}
            </button>
          </>
        )}
      </div>
    </Popover>
  );
}
