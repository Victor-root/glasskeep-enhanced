import React, { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { t } from "../../i18n";
import { requestTvFocus } from "./useSpatialFocus.js";

// Clickable header chip + popover. Tapping it opens a small menu
// (currently just "Sign out"); the menu closes on outside click, Back
// key, or after the user picks an item.
export default function TvHeaderUserChip({ currentUser, onSignOut }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const initial = (currentUser?.name?.[0] || currentUser?.email?.[0] || "?").toUpperCase();
  const label = currentUser?.name || currentUser?.email || "";

  // Close on click outside.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
    };
  }, [open]);

  // Close on native Back. The Android wrapper turns KEYCODE_BACK into
  // window.history.back() — a popstate event, NOT a keydown. We push a
  // history marker on open and react to popstate to close. The cleanup
  // branch rewinds the entry if the popover closes by any other means
  // so we don't leak history entries.
  useEffect(() => {
    if (!open) return undefined;
    const marker = { tvUserMenu: true, ts: Date.now() };
    window.history.pushState(marker, "");
    const onPop = () => {
      setOpen(false);
      const btn = wrapRef.current?.querySelector(".tv-header__user");
      requestTvFocus(btn);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.tvUserMenu) window.history.back();
    };
  }, [open]);

  // Once open, drop focus onto the first menu item so D-pad works.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const first = wrapRef.current?.querySelector(".tv-header__user-menu-item");
      requestTvFocus(first);
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  // While the popover is open we run a focus trap in capture phase so
  // useSpatialFocus never sees the D-pad keys:
  //   - Up / Down cycle between the chip and the menu item(s) only
  //   - Left / Right are swallowed (no escape sideways)
  //   - Back / Esc / GoBack close the popover and return focus to chip
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      // Back / Esc / GoBack: close + restore focus on chip.
      if (e.key === "Escape" || e.key === "Backspace" || e.key === "GoBack") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
        const btn = wrapRef.current?.querySelector(".tv-header__user");
        requestTvFocus(btn);
        return;
      }
      // Lateral nav: just absorb so focus can't leave the popover.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // Vertical nav: walk the focusables inside the wrap.
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const list = Array.from(wrap.querySelectorAll(".tv-focusable"))
          .filter((el) => el.offsetParent !== null);
        if (!list.length) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const idx = list.indexOf(document.activeElement);
        const nextIdx = e.key === "ArrowDown"
          ? Math.min(list.length - 1, (idx < 0 ? -1 : idx) + 1)
          : Math.max(0, (idx < 0 ? list.length : idx) - 1);
        const target = list[nextIdx];
        requestTvFocus(target);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <div className="tv-header__user-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="tv-header__user tv-focusable tv-focusable--flat"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tv-header__avatar">
          {currentUser?.avatar_url
            ? <img src={currentUser.avatar_url} alt="" />
            : <span>{initial}</span>}
        </span>
        <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
      </button>
      {open && (
        <div className="tv-header__user-menu" role="menu">
          {typeof onSignOut === "function" && (
            <button
              type="button"
              className="tv-header__user-menu-item tv-focusable tv-focusable--flat"
              role="menuitem"
              onClick={() => { setOpen(false); onSignOut(); }}
            >
              <span className="tv-header__user-menu-item-icon"><LogOut size={14} /></span>
              <span>{t("logout") || "Sign out"}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
