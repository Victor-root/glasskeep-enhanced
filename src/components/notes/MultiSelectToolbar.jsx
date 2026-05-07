import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { t } from "../../i18n";
import {
  CloseIcon,
  PinIcon,
  ArchiveIcon,
  DownloadIcon,
  Trash,
  Kebab,
} from "../../icons/index.jsx";
import ColorPickerPanel from "../common/ColorPickerPanel.jsx";
import LogoPickerPopover from "../modal/LogoPickerPopover.jsx";
import { COLOR_ORDER, LIGHT_COLORS } from "../../utils/colors.js";

const EXIT_MS = 200;

// Hex color pairs for kebab-menu items. Mirrors the modal's kebab menu
// (ModalFooter) so the in-overflow style is consistent across the app:
// colored TEXT on a neutral white / #222 background, not a tinted block.
const MENU_COLOR = {
  red:     { light: "#dc2626", dark: "#f87171" },
  green:   { light: "#16a34a", dark: "#4ade80" },
  emerald: { light: "#059669", dark: "#34d399" },
  amber:   { light: "#d97706", dark: "#fbbf24" },
  violet:  { light: "#7c3aed", dark: "#c4b5fd" },
  blue:    { light: "#0284c7", dark: "#7dd3fc" },
  cyan:    { light: "#0891b2", dark: "#67e8f9" },
  slate:   { light: "#475569", dark: "#cbd5e1" },
  indigo:  { light: "#4f46e5", dark: "#a5b4fc" },
};

// Tone classes per action. Each kind is recognisable at a glance while
// staying within the violet/blue family of the dock so the palette feels
// cohesive (not "rainbow toy"). Backgrounds are opaque so contrast is
// preserved against the dock's already-coloured surface.
const TONE = {
  slate:
    "border-slate-300/70 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-500/40 dark:bg-slate-700/80 dark:text-slate-100 dark:hover:bg-slate-600/90",
  violet:
    "border-violet-300/80 bg-violet-100 text-violet-800 hover:bg-violet-200 dark:border-violet-400/40 dark:bg-violet-800/65 dark:text-violet-100 dark:hover:bg-violet-700/80",
  amber:
    "border-amber-300/80 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:border-amber-400/40 dark:bg-amber-800/55 dark:text-amber-100 dark:hover:bg-amber-700/70",
  blue:
    "border-sky-300/80 bg-sky-100 text-sky-800 hover:bg-sky-200 dark:border-sky-400/40 dark:bg-sky-800/60 dark:text-sky-100 dark:hover:bg-sky-700/75",
  red:
    "border-rose-300/80 bg-rose-100 text-rose-700 hover:bg-rose-200 dark:border-rose-400/45 dark:bg-rose-900/55 dark:text-rose-100 dark:hover:bg-rose-800/70",
  green:
    "border-emerald-300/80 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:border-emerald-400/40 dark:bg-emerald-800/55 dark:text-emerald-100 dark:hover:bg-emerald-700/75",
  cyan:
    "border-cyan-300/80 bg-cyan-100 text-cyan-800 hover:bg-cyan-200 dark:border-cyan-400/40 dark:bg-cyan-800/55 dark:text-cyan-100 dark:hover:bg-cyan-700/75",
};

const BTN_BASE =
  "h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap shrink-0";
// Compact mode (mobile / very narrow dock): square icon buttons. Tooltip
// (data-tooltip) carries the label so the action stays discoverable.
const BTN_COMPACT =
  "h-9 w-9 inline-flex items-center justify-center rounded-lg text-sm font-medium border transition-colors shrink-0";

// Inline icons not available in /icons.
const ColorEmoji = () => (
  <span aria-hidden="true" className="text-base leading-none">🎨</span>
);
const RestoreIconSvg = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="3 8 3 14 9 14" />
    <path d="M3 14a9 9 0 1 0 3-7" />
  </svg>
);
const SelectAllIconSvg = ({ allSelected }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    {allSelected && <path d="M9 12l2 2 4-4" />}
  </svg>
);
const LogoIconSvg = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="8.5" cy="8.5" r="1.7" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);
const SbsIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="7" height="14" rx="1.5" />
    <rect x="14" y="5" width="7" height="14" rx="1.5" />
  </svg>
);

export default function MultiSelectToolbar({
  multiMode,
  dark,
  activeTagFilter,
  selectedIds,
  filteredNotes,
  onBulkDownloadZip,
  onBulkRestore,
  onBulkDelete,
  onBulkColor,
  onBulkSetIcon,
  onBulkAddLogoFromFile,
  logoLibrary = [],
  deleteLogoFromLibrary,
  onBulkPin,
  onBulkArchive,
  onSelectAll,
  onExitMulti,
  onOpenSideBySide,
  // Sidebar geometry — when the sidebar is rendered as a permanent
  // column (desktop), the dock must NOT extend under it. We slide its
  // left edge over by sidebarWidth so the wrapper spans only the
  // content area, and the ResizeObserver picks up the real budget.
  sidebarPermanent = false,
  sidebarWidth = 0,
}) {
  // ── Refs ────────────────────────────────────────────────────────
  const containerRef = useRef(null); // outer wrapper — drives the budget
  const measureRef = useRef(null);   // hidden ghost row — measures each btn
  const fixedRef = useRef(null);     // counter cluster — measure
  const closeRef = useRef(null);     // close button — measure
  const multiColorBtnRef = useRef(null); // anchor for the color popover
  const multiLogoBtnRef = useRef(null);  // anchor for the logo popover
  const bulkLogoFileRef = useRef(null);  // hidden file input for upload-new
  const moreMenuBtnRef = useRef(null);
  const moreMenuRef = useRef(null);

  // ── State ───────────────────────────────────────────────────────
  const [showMultiColorPop, setShowMultiColorPop] = useState(false);
  const [showLogoPicker, setShowLogoPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [shouldRender, setShouldRender] = useState(multiMode);
  const [exiting, setExiting] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [actionWidths, setActionWidths] = useState({});
  const [counterWidth, setCounterWidth] = useState(110);
  const [closeWidth, setCloseWidth] = useState(36);

  // Stable ref callbacks so React doesn't re-fire them on every render.
  const colorBtnAttachRef = useCallback((el) => {
    multiColorBtnRef.current = el;
  }, []);
  const colorMenuItemAttachRef = useCallback((el) => {
    // When the menu item unmounts (kebab closes), fall back to the kebab
    // button so the color popover still has a valid anchor.
    multiColorBtnRef.current = el || moreMenuBtnRef.current;
  }, []);
  const logoBtnAttachRef = useCallback((el) => {
    multiLogoBtnRef.current = el;
  }, []);
  const logoMenuItemAttachRef = useCallback((el) => {
    multiLogoBtnRef.current = el || moreMenuBtnRef.current;
  }, []);

  // Mount/exit animation lifecycle
  useEffect(() => {
    if (multiMode) {
      setShouldRender(true);
      setExiting(false);
      return;
    }
    if (shouldRender) {
      setExiting(true);
      const id = setTimeout(() => {
        setShouldRender(false);
        setExiting(false);
        setShowMoreMenu(false);
        setShowMultiColorPop(false);
      }, EXIT_MS);
      return () => clearTimeout(id);
    }
  }, [multiMode]); // eslint-disable-line

  // Click outside the kebab menu
  useEffect(() => {
    if (!showMoreMenu) return;
    const onDocClick = (e) => {
      if (moreMenuRef.current?.contains(e.target)) return;
      if (moreMenuBtnRef.current?.contains(e.target)) return;
      setShowMoreMenu(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showMoreMenu]);

  // ResizeObserver — track the wrapper's available width as a real budget,
  // not a window.innerWidth shortcut. The wrapper has a max-width and
  // viewport-relative side insets, so its clientWidth IS the room we have.
  useEffect(() => {
    if (!shouldRender) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setAvailableWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setAvailableWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [shouldRender]);

  // Derived flags
  const isTrash = activeTagFilter === "TRASHED";
  const isArchive = activeTagFilter === "ARCHIVED";
  const allSelected =
    filteredNotes?.length > 0 &&
    filteredNotes.every((n) => selectedIds.includes(String(n.id)));
  const canSideBySide =
    selectedIds.length === 2 &&
    !isTrash &&
    typeof onOpenSideBySide === "function";

  // Build the action list in priority order. Order matters: items earlier
  // in the array win the limited width budget; the rest go into the kebab.
  // The SBS CTA is ALWAYS in the list — when it can't be triggered (less
  // or more than 2 notes selected, trash) it renders disabled instead of
  // disappearing, so the user always sees it as an available outcome.
  const actions = useMemo(() => {
    const list = [];
    list.push({
      id: "sbs",
      label: t("openSideBySide"),
      icon: <SbsIcon />,
      onClick: canSideBySide ? () => onOpenSideBySide(selectedIds) : undefined,
      disabled: !canSideBySide,
      kind: "cta",
      menuTone: "indigo",
    });
    list.push({
      id: "destructive",
      label: isTrash ? t("permanentlyDelete") : t("moveToTrash"),
      icon: <Trash />,
      onClick: onBulkDelete,
      tone: "red",
      menuTone: "red",
    });
    if (isTrash) {
      list.push({
        id: "restore",
        label: t("restoreFromTrash"),
        icon: <RestoreIconSvg />,
        onClick: onBulkRestore,
        tone: "green",
        menuTone: "emerald",
      });
    } else {
      list.push({
        id: "color",
        label: t("color"),
        icon: <ColorEmoji />,
        onClick: () => setShowMultiColorPop((v) => !v),
        tone: "violet",
        menuTone: "violet",
        attachRef: colorBtnAttachRef,
      });
      list.push({
        id: "logo",
        label: t("addLogo"),
        icon: <LogoIconSvg />,
        onClick: () => setShowLogoPicker((v) => !v),
        tone: "cyan",
        menuTone: "cyan",
        attachRef: logoBtnAttachRef,
      });
      if (!isArchive) {
        list.push({
          id: "pin",
          label: t("pin"),
          icon: <PinIcon />,
          onClick: () => onBulkPin(true),
          tone: "amber",
          menuTone: "amber",
        });
      }
      list.push({
        id: "archive",
        label: isArchive ? t("unarchive") : t("archive"),
        icon: <ArchiveIcon />,
        onClick: onBulkArchive,
        tone: "blue",
        menuTone: "blue",
      });
    }
    list.push({
      id: "download",
      label: t("downloadZip"),
      icon: <DownloadIcon />,
      onClick: onBulkDownloadZip,
      tone: "green",
      menuTone: "green",
    });
    if (filteredNotes?.length > 0) {
      list.push({
        id: "selectAll",
        label: allSelected ? t("deselectAll") : t("selectAll"),
        icon: <SelectAllIconSvg allSelected={allSelected} />,
        onClick: () => onSelectAll?.(filteredNotes),
        tone: "slate",
        menuTone: "slate",
      });
    }
    return list;
  }, [
    canSideBySide,
    isTrash,
    isArchive,
    allSelected,
    selectedIds,
    filteredNotes,
    onOpenSideBySide,
    onBulkDelete,
    onBulkRestore,
    onBulkColor,
    onBulkPin,
    onBulkArchive,
    onBulkDownloadZip,
    onSelectAll,
    colorBtnAttachRef,
    logoBtnAttachRef,
  ]);

  // Compact (icon-only) mode kicks in on narrow docks — typically mobile.
  // Drops every button's text label and turns each into a 36x36 square,
  // with tooltips (data-tooltip) preserving discoverability. Multiplies
  // the number of actions that can stay in the dock before overflowing
  // into the kebab.
  const compact = availableWidth > 0 && availableWidth < 700;

  // Measure each button via the hidden ghost. Re-runs whenever the action
  // list shape or labels change (language switch, filter switch, count
  // hitting/leaving the SBS threshold) OR when compact toggles — the
  // ghost renders with the same compact flag so widths stay accurate.
  const actionsKey = actions.map((a) => `${a.id}:${a.label}`).join("|");
  useLayoutEffect(() => {
    if (!shouldRender) return;
    if (!measureRef.current) return;
    const widths = {};
    measureRef.current.querySelectorAll("[data-action-id]").forEach((b) => {
      widths[b.dataset.actionId] = b.offsetWidth;
    });
    setActionWidths(widths);
    if (fixedRef.current) setCounterWidth(fixedRef.current.offsetWidth);
    if (closeRef.current) setCloseWidth(closeRef.current.offsetWidth);
  }, [shouldRender, actionsKey, compact]);

  // Compute the visible / overflow split based on real measurements.
  // Two passes: first without reserving kebab space; if that overflows,
  // reserve kebab and re-fit so reserving the kebab itself doesn't push
  // another button out unexpectedly.
  const PAD = 20; // dock inner padding (10px each side)
  const GAP = 8; // dock flex gap
  const DIVIDER = 1 + GAP * 2; // counter|actions and actions|close dividers
  const KEBAB = 36;

  const { visibleActions, overflowActions } = useMemo(() => {
    if (
      availableWidth === 0 ||
      Object.keys(actionWidths).length === 0
    ) {
      // Pre-measurement: render everything; the ghost will measure on this same paint.
      return { visibleActions: actions, overflowActions: [] };
    }
    const tryFit = (reserveKebab) => {
      let budget =
        availableWidth -
        PAD -
        counterWidth -
        closeWidth -
        DIVIDER * 2 -
        (reserveKebab ? KEBAB + GAP : 0);
      const visible = [];
      const overflow = [];
      for (const action of actions) {
        const w = actionWidths[action.id] ?? 100;
        const cost = w + (visible.length > 0 ? GAP : 0);
        if (cost <= budget) {
          budget -= cost;
          visible.push(action);
        } else {
          overflow.push(action);
        }
      }
      return { visible, overflow };
    };
    let result = tryFit(false);
    if (result.overflow.length > 0) result = tryFit(true);
    return { visibleActions: result.visible, overflowActions: result.overflow };
  }, [
    availableWidth,
    actionWidths,
    actions,
    counterWidth,
    closeWidth,
  ]);

  if (!shouldRender) return null;

  // Resolve the colored-text style for a kebab menu item — mirrors the
  // exact hex pairs the modal kebab uses so visual continuity is kept.
  const menuItemStyle = (action) => {
    const tone = action.menuTone || action.tone || "slate";
    const palette = MENU_COLOR[tone] || MENU_COLOR.slate;
    return { color: dark ? palette.dark : palette.light };
  };

  // Renders one action button (visible row OR ghost row OR menu item).
  const renderActionButton = (action, opts = {}) => {
    const { ghost = false, menuItem = false, attachRef } = opts;
    const isDisabled = !!action.disabled;
    // In-dock buttons (visible row + ghost) honour compact mode and drop
    // their label, becoming square icon-only buttons. Kebab menu items
    // ALWAYS keep their label — the menu has plenty of room.
    const dockShowLabel = !compact || menuItem;

    if (action.kind === "cta") {
      // CTA (side-by-side): always rendered. When it can't fire (selection
      // count != 2 or trash) it stays in place but greys out via opacity
      // — the user keeps it on screen as an available outcome.
      const ctaFull =
        "h-9 px-3.5 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-bold whitespace-nowrap shrink-0 text-white bg-gradient-to-r from-indigo-600 to-violet-700 ring-1 ring-violet-500/30 shadow-md shadow-violet-500/40 transition-all duration-200";
      const ctaCompact =
        "h-9 w-9 inline-flex items-center justify-center rounded-lg text-sm font-bold shrink-0 text-white bg-gradient-to-r from-indigo-600 to-violet-700 ring-1 ring-violet-500/30 shadow-md shadow-violet-500/40 transition-all duration-200";
      const ctaActive =
        " hover:from-indigo-700 hover:to-violet-800 hover:shadow-lg hover:shadow-violet-500/50 hover:scale-[1.02] active:scale-[0.98]";
      const ctaDisabled = " opacity-40 cursor-not-allowed grayscale-[0.2]";
      const ctaBase = compact ? ctaCompact : ctaFull;
      return (
        <button
          key={action.id}
          ref={attachRef}
          data-action-id={ghost ? action.id : undefined}
          type="button"
          disabled={isDisabled}
          onClick={
            isDisabled
              ? undefined
              : menuItem
                ? () => {
                    action.onClick?.();
                    setShowMoreMenu(false);
                  }
                : action.onClick
          }
          tabIndex={ghost ? -1 : 0}
          aria-disabled={isDisabled || undefined}
          aria-label={action.label}
          data-tooltip={!menuItem && compact ? action.label : undefined}
          className={
            menuItem
              ? "flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-semibold transition-colors hover:bg-gray-100 dark:hover:bg-white/10" +
                (isDisabled ? " opacity-50 cursor-not-allowed" : "")
              : ctaBase + (isDisabled ? ctaDisabled : ctaActive)
          }
          style={
            menuItem
              ? menuItemStyle({ ...action, menuTone: action.menuTone || "indigo" })
              : undefined
          }
        >
          {action.icon}
          {dockShowLabel && <span>{action.label}</span>}
        </button>
      );
    }
    const toneCls = TONE[action.tone] || TONE.slate;
    if (menuItem) {
      // Kebab menu items mirror the modal's kebab style: colored text on
      // a neutral white / #222 background, hover greys.
      return (
        <button
          key={action.id}
          role="menuitem"
          ref={attachRef}
          type="button"
          onClick={() => {
            action.onClick?.();
            setShowMoreMenu(false);
          }}
          className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
          style={menuItemStyle(action)}
        >
          {action.icon && (
            <span className="inline-flex w-5 justify-center">{action.icon}</span>
          )}
          <span>{action.label}</span>
        </button>
      );
    }
    return (
      <button
        key={action.id}
        ref={attachRef}
        data-action-id={ghost ? action.id : undefined}
        type="button"
        onClick={action.onClick}
        tabIndex={ghost ? -1 : 0}
        aria-label={action.label}
        data-tooltip={action.label}
        className={compact ? `${BTN_COMPACT} ${toneCls}` : `${BTN_BASE} ${toneCls}`}
      >
        {action.icon}
        {dockShowLabel && <span>{action.label}</span>}
      </button>
    );
  };

  // The color popover is anchored to wherever the color action is
  // currently rendered: the visible button if it fits, the kebab menu
  // item otherwise (we re-point multiColorBtnRef when the menu item
  // mounts via callback ref).
  const colorInOverflow = overflowActions.some((a) => a.id === "color");

  // When the sidebar is permanent, push the dock's left edge past it so
  // the wrapper spans only the content area. CSS handles the default
  // (left:12px desktop / 8px mobile) when the sidebar isn't permanent.
  const dockStyle = sidebarPermanent
    ? { left: `${(sidebarWidth || 0) + 12}px`, right: "12px" }
    : undefined;

  return (
    <div
      ref={containerRef}
      className={`multi-select-dock${exiting ? " multi-select-dock--exiting" : ""}`}
      style={dockStyle}
      role="toolbar"
      aria-label={t("multiSelect")}
    >
      {/* Hidden ghost — renders ALL possible actions to measure their
          intrinsic widths. Lives off-screen so it doesn't affect layout. */}
      <div ref={measureRef} className="multi-select-dock__measure" aria-hidden="true">
        {actions.map((a) => renderActionButton(a, { ghost: true }))}
      </div>

      <div className="multi-select-dock__inner">
        {/* LEFT — counter (always visible) */}
        <div ref={fixedRef} className="flex items-center shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-200/70 dark:bg-violet-800/60 text-violet-900 dark:text-violet-50 text-sm font-semibold whitespace-nowrap select-none">
            <span className="opacity-70 font-normal hidden sm:inline">
              {t("selectedPrefix")}
            </span>
            <span className="tabular-nums">{selectedIds.length}</span>
          </span>
        </div>

        <div className="multi-select-dock__divider" aria-hidden="true" />

        {/* CENTER — visible actions */}
        <div className="flex items-center gap-2 min-w-0">
          {visibleActions.map((action) =>
            renderActionButton(action, { attachRef: action.attachRef })
          )}
        </div>

        {/* Kebab — only if at least one action overflowed */}
        {overflowActions.length > 0 && (
          <div className="relative shrink-0">
            <button
              ref={moreMenuBtnRef}
              type="button"
              onClick={() => setShowMoreMenu((v) => !v)}
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-violet-700 dark:text-violet-200 hover:bg-violet-200/60 dark:hover:bg-violet-700/40 transition-colors"
              data-tooltip={t("moreOptions")}
              aria-label={t("moreOptions")}
              aria-expanded={showMoreMenu}
            >
              <Kebab />
            </button>
            {showMoreMenu && (
              <div ref={moreMenuRef} className="multi-select-dock__menu" role="menu">
                {overflowActions.map((action) =>
                  renderActionButton(action, {
                    menuItem: true,
                    attachRef:
                      action.id === "color"
                        ? colorMenuItemAttachRef
                        : action.id === "logo"
                          ? logoMenuItemAttachRef
                          : undefined,
                  })
                )}
              </div>
            )}
          </div>
        )}

        <div className="multi-select-dock__divider" aria-hidden="true" />

        {/* RIGHT — close button (always visible) */}
        <button
          ref={closeRef}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-violet-700 dark:text-violet-100 hover:bg-violet-200/60 dark:hover:bg-violet-700/40 transition-colors shrink-0"
          data-tooltip={t("exitMultiSelect")}
          onClick={onExitMulti}
          aria-label={t("exitMultiSelect")}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Color picker popover — anchored to the color button or to the
          kebab menu item (whichever is currently rendered). */}
      {!isTrash && (
        <ColorPickerPanel
          anchorRef={multiColorBtnRef}
          open={showMultiColorPop}
          onClose={() => setShowMultiColorPop(false)}
          colors={COLOR_ORDER.filter((name) => LIGHT_COLORS[name])}
          selectedColor={null}
          darkMode={dark}
          onSelect={(name) => {
            onBulkColor(name);
          }}
        />
      )}

      {/* Logo picker popover — same component the modal uses, so the
          UX is identical: grid of saved logos + dashed "+" upload tile.
          Hidden file input handles the OS picker for new uploads. */}
      {!isTrash && (
        <>
          <LogoPickerPopover
            anchorRef={multiLogoBtnRef}
            open={showLogoPicker}
            onClose={() => setShowLogoPicker(false)}
            dark={dark}
            logos={logoLibrary || []}
            selectedSrc={undefined}
            onPickExisting={(logo) => {
              onBulkSetIcon?.(logo);
            }}
            onUploadNew={() => bulkLogoFileRef.current?.click()}
            onDeleteLogo={deleteLogoFromLibrary}
          />
          <input
            ref={bulkLogoFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f && onBulkAddLogoFromFile) await onBulkAddLogoFromFile(f);
            }}
          />
        </>
      )}
    </div>
  );
}
