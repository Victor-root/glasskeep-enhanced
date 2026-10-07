import React, { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import PaletteColorIcon from "../common/PaletteColorIcon.jsx";
import ColorPickerPanel, { ColorSwatchGrid } from "../common/ColorPickerPanel.jsx";
import Popover from "../common/Popover.jsx";
import BottomSheet, { SheetRow } from "../common/BottomSheet.jsx";
import UserAvatar from "../common/UserAvatar.jsx";
import AddImageMenu from "./AddImageMenu.jsx";
import LogoPickerPopover from "./LogoPickerPopover.jsx";
import NoteTagPicker from "./NoteTagPicker.jsx";
import ReminderPicker from "../notes/ReminderPicker.jsx";
import { Popover as RichTextPopover } from "../richtext/Popover.jsx";
import { DownloadIcon, ArchiveIcon, Trash, AddImageIcon, Kebab, TextNoteIcon, ChecklistIcon, LogoIcon } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import { COLOR_ORDER, LIGHT_COLORS, modalBgFor } from "../../utils/colors.js";
import { t } from "../../i18n";

const NOTE_COLORS = COLOR_ORDER.filter((name) => LIGHT_COLORS[name]);

/**
 * Google Keep-style footer toolbar for the note modal.
 * Desktop: icon + text label for each action.
 * Mobile:  icon-only (compact).
 */
export default function ModalFooter({
  dark,
  windowWidth,
  isLandscapeMobile,
  isWebView,
  // tags
  mTagList,
  setMTagList,
  tagInput,
  setTagInput,
  modalTagFocused,
  setModalTagFocused,
  modalTagInputRef,
  modalTagBtnRef,
  suppressTagBlurRef,
  tagsWithCounts,
  addTags,
  handleTagKeyDown,
  handleTagBlur,
  handleTagPaste,
  // color
  mColor,
  setMColor,
  modalColorBtnRef,
  showModalColorPop,
  setShowModalColorPop,
  // images
  modalFileRef,
  addImagesToState,
  setMImages,
  mImages,
  // note icon (logo badge) — flows through addImagesToState too, then
  // gets stamped with role:"icon" via setNoteIconFromFile (handled in App).
  modalIconFileRef,
  setNoteIconFromFile,
  removeNoteIcon,
  // Per-user note icon: the current icon object (or null) + a setter that
  // persists it through the dedicated per-user endpoint. The icon is NOT in
  // mImages anymore (it's personal, never synced with the note body).
  noteIcon = null,
  onPickIcon,
  // logo library (persistent, per-user)
  logoLibrary = [],
  addLogoToLibrary,
  deleteLogoFromLibrary,
  // collaboration
  onOpenCollaboration,
  // formatting (mobile)
  modalFmtBtnRef,
  showModalFmt,
  setShowModalFmt,
  // view/edit toggle
  mType,
  viewMode,
  readModeEnabled = true,
  readOnlyBadge = false,
  onToggleViewMode,
  // drawing mode toggle
  drawMode,
  onToggleDrawMode,
  onExitDrawToView,
  modalScrollRef,
  savedModalScrollRatioRef,
  // actions
  activeId,
  notes,
  tagFilter,
  activeNoteObj,
  addModalCollaborators,
  currentUser,
  onDownloadNote,
  onRestoreFromTrash,
  onArchiveNote,
  onOpenConfirmDelete,
  // reminders — onSetReminder(noteId, isoStringOrNull)
  onSetReminder,
  // reminder picker open state (lifted to App so the Android back button
  // and the mobile full-screen panel hook into the central overlay stack)
  reminderPopOpen,
  setReminderPopOpen,
  reminderTimeChips,
  onReminderTimeChipsChange,
  // kebab menu (state lifted to App)
  modalKebabOpen,
  setModalKebabOpen,
  // image menu and the logo picker it leads to (lifted to App with the
  // other footer menus, so the Android back button closes them)
  imageMenuOpen,
  setImageMenuOpen,
  logoPickerOpen,
  setLogoPickerOpen,
  // undo / redo
  undo,
  redo,
  canUndo,
  canRedo,
  // note type conversion (text <-> checklist)
  onConvertNoteType,
  // Duplicate the active note (kebab → "Dupliquer la note").
  onDuplicateNote,
  // Per-note AI chat panel — kebab entry
  noteAiAvailable,
  onOpenNoteAi,
}) {
  const isDesktop = windowWidth >= 768 && !isLandscapeMobile && !isWebView;
  const isTrashed = tagFilter === "TRASHED";

  const handleDownload = () => {
    const n = notes.find((nn) => String(nn.id) === String(activeId));
    if (n) onDownloadNote(n);
  };

  const handleArchiveToggle = () => {
    const note = notes.find((nn) => String(nn.id) === String(activeId));
    if (note) onArchiveNote(activeId, !note.archived);
  };

  const handleToggleViewMode = () => {
    const el = modalScrollRef?.current;
    const maxScroll = el ? el.scrollHeight - el.clientHeight : 0;
    if (savedModalScrollRatioRef) {
      savedModalScrollRatioRef.current = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
    }
    onToggleViewMode();
  };

  const btnClass = isDesktop ? "modal-footer-labeled-btn" : "modal-footer-btn";
  // Mobile sheets take the open note's own background colour.
  const sheetBg = modalBgFor(mColor, dark);

  /* Image sub-menu (regular image vs logo / note icon) */
  const imageBtnRef = useRef(null);
  const currentNoteIcon = noteIcon;

  const handlePickExistingLogo = (logo) => {
    if (!logo?.src) return;
    onPickIcon?.(logo);
  };

  /* Reminder picker popover — the bell lives in the kebab menu; the picker
     anchors to the kebab trigger. */
  const reminderAt = activeNoteObj?.reminderAt || null;
  const hasReminder = !!reminderAt;
  const canRemind = !isTrashed && typeof onSetReminder === "function";

  /* Kebab menu (download + collaborate) */
  const kebabRef = useRef(null);

  /* Kebab menu entries, shared by the desktop popover and the mobile sheet.
     Each keeps its own colour so it reads the same in both. */
  const kebabItems = [
    // Reminder: opens the picker anchored to the kebab trigger, in a
    // dedicated orange so it reads distinctly from the other entries.
    canRemind && {
      key: "reminder",
      color: dark ? "#fb923c" : "#ea580c",
      icon: hasReminder
        ? <TI.BellRingingFilled className="tabler-icon tabler-icon--filled" style={{ width: 18, height: 18 }} />
        : <TI.Bell className="tabler-icon" style={{ width: 18, height: 18 }} />,
      label: t("reminder"),
      run: () => setReminderPopOpen(true),
    },
    isTrashed
      ? {
        key: "restore",
        color: dark ? "#fbbf24" : "#a16207",
        icon: <ArchiveIcon />,
        label: t("restoreFromTrash"),
        run: () => onRestoreFromTrash(activeId),
      }
      : {
        key: "archive",
        color: dark ? "#fbbf24" : "#a16207",
        icon: <ArchiveIcon />,
        label: activeNoteObj?.archived ? t("unarchive") : t("archive"),
        run: handleArchiveToggle,
      },
    // Text <-> checklist conversion; not for draw notes or in the trash.
    !isTrashed && onConvertNoteType && (mType === "text" || mType === "checklist") && {
      key: "convert",
      color: dark ? "#c4b5fd" : "#7c3aed",
      icon: mType === "text" ? <ChecklistIcon /> : <TextNoteIcon />,
      label: mType === "text" ? t("convertToChecklist") : t("convertToText"),
      run: onConvertNoteType,
    },
    // Duplicate (two-overlapping-squares glyph kept inline, one-shot icon).
    !isTrashed && onDuplicateNote && {
      key: "duplicate",
      color: dark ? "#67e8f9" : "#0891b2",
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      ),
      label: t("duplicateNote"),
      run: onDuplicateNote,
    },
    // Download; audio notes have their own download menu on the player.
    mType !== "audio" && {
      key: "download",
      color: dark ? "#4ade80" : "#16a34a",
      icon: <DownloadIcon />,
      label: t("downloadMd"),
      run: handleDownload,
    },
    // Per-note AI chat; hidden when the user has no AI configured.
    !isTrashed && noteAiAvailable && onOpenNoteAi && {
      key: "ai",
      color: dark ? "#a5b4fc" : "#4f46e5",
      icon: <TI.MessageSearch />,
      label: t("noteAiChatMenuItem"),
      run: onOpenNoteAi,
    },
    // Collaborate folds in here on mobile text edit mode and draw edit mode,
    // keeping the footer button's purple.
    ((!isDesktop && mType === "text" && !viewMode) || (mType === "draw" && drawMode !== "draw" && !viewMode)) && {
      key: "collaborate",
      color: dark ? "#c4b5fd" : "#7c3aed",
      icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" /></svg>,
      label: t("collaborate"),
      run: onOpenCollaboration,
    },
    // Trash folds in here on mobile edit mode.
    !isDesktop && mType === "text" && !viewMode && {
      key: "trash",
      color: dark ? "#f87171" : "#dc2626",
      icon: <Trash />,
      label: isTrashed ? t("permanentlyDelete") : t("trash"),
      run: onOpenConfirmDelete,
    },
  ].filter(Boolean);
  const runKebabItem = (item) => {
    setModalKebabOpen(false);
    item.run();
  };

  const closeTagPicker = () => setModalTagFocused(false);
  const tagPickerProps = {
    tagInput,
    setTagInput,
    tagsWithCounts,
    mTagList,
    setMTagList,
    addTags,
    inputRef: modalTagInputRef,
    suppressTagBlurRef,
    handleTagKeyDown,
    handleTagBlur,
    handleTagPaste,
    onClose: closeTagPicker,
  };

  /* Close the desktop tag dropdown on outside click (the mobile sheet has
     its own backdrop). */
  const tagDropdownRef = useRef(null);
  useEffect(() => {
    if (!modalTagFocused || !isDesktop) return;
    const onDown = (e) => {
      const drop = tagDropdownRef.current;
      const btn = modalTagBtnRef?.current;
      if (drop && drop.contains(e.target)) return;
      if (btn && btn.contains(e.target)) return;
      setModalTagFocused(false);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [modalTagFocused, setModalTagFocused, modalTagBtnRef, isDesktop]);

  return (
    <div className="modal-footer-toolbar border-t border-[var(--border-light)]">
      <div className={`modal-footer-inner flex items-center px-2 sm:px-3 py-1.5 ${isDesktop ? "gap-1" : "gap-0.5"}`}>

        {/* ── Color picker ── */}
        <button
          ref={modalColorBtnRef}
          className={`${btnClass} focus:outline-none`}
          onClick={() => setShowModalColorPop((v) => !v)}
          data-tooltip={!isDesktop ? t("color") : undefined}
        >
          <PaletteColorIcon size={isDesktop ? 16 : 18} />
          {isDesktop && <span>{t("color")}</span>}
        </button>
        {isDesktop ? (
          <ColorPickerPanel
            anchorRef={modalColorBtnRef}
            open={showModalColorPop}
            onClose={() => setShowModalColorPop(false)}
            colors={NOTE_COLORS}
            selectedColor={mColor}
            darkMode={dark}
            onSelect={(name) => setMColor(name)}
          />
        ) : (
          <BottomSheet open={showModalColorPop} onClose={() => setShowModalColorPop(false)} title={t("color")} background={sheetBg}>
            <div className="px-1 pt-1 pb-3">
              <ColorSwatchGrid
                labeled
                colors={NOTE_COLORS}
                selectedColor={mColor}
                darkMode={dark}
                onSelect={(name) => { setMColor(name); setShowModalColorPop(false); }}
              />
            </div>
          </BottomSheet>
        )}

        {/* ── Reminder ── The bell lives in the kebab menu (see below); the
            picker popover is rendered once, anchored to the kebab trigger. */}

        {/* ── Add image / logo (hidden in view mode for draw notes, hidden in draw canvas) ──
              Clicking the button opens a small sub-menu offering either
              a regular image upload (existing flow) or a note-icon
              upload ("logo badge", new flow). Two separate hidden file
              inputs keep the two flows from interfering with each other
              and let the OS picker remember the right MIME hint per
              flow. */}
        {(mType === "checklist" || mType === "text" || (mType === "draw" && drawMode !== "draw" && !viewMode)) && (
          <>
            <input
              ref={modalFileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files;
                if (f && f.length) await addImagesToState(f, setMImages);
                e.target.value = "";
              }}
            />
            <input
              ref={modalIconFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files && e.target.files[0];
                if (f && setNoteIconFromFile) await setNoteIconFromFile(f);
                e.target.value = "";
              }}
            />
            <button
              ref={imageBtnRef}
              className={`${btnClass} modal-footer-btn--image focus:outline-none`}
              onClick={() => setImageMenuOpen((v) => !v)}
              data-tooltip={!isDesktop ? t("addImages") : undefined}
              aria-haspopup="menu"
              aria-expanded={imageMenuOpen ? "true" : "false"}
            >
              <AddImageIcon />
              {isDesktop && <span>{t("image")}</span>}
              {currentNoteIcon && (
                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full overflow-hidden">
                  <img
                    src={currentNoteIcon.src}
                    alt=""
                    className="w-full h-full"
                    style={{ objectFit: "contain" }}
                    draggable={false}
                  />
                </span>
              )}
            </button>
            <AddImageMenu
              anchorRef={imageBtnRef}
              open={imageMenuOpen}
              onClose={() => setImageMenuOpen(false)}
              dark={dark}
              hasIcon={!!currentNoteIcon}
              onAddImage={() => modalFileRef.current?.click()}
              onAddIcon={() => {
                setImageMenuOpen(false);
                setLogoPickerOpen(true);
              }}
              onRemoveIcon={() => removeNoteIcon && removeNoteIcon()}
              asSheet={!isDesktop}
              sheetBackground={sheetBg}
            />
            <LogoPickerPopover
              anchorRef={imageBtnRef}
              open={logoPickerOpen}
              onClose={() => setLogoPickerOpen(false)}
              dark={dark}
              logos={logoLibrary}
              selectedSrc={currentNoteIcon?.src}
              onPickExisting={handlePickExistingLogo}
              onUploadNew={() => modalIconFileRef?.current?.click()}
              onDeleteLogo={deleteLogoFromLibrary}
            />
          </>
        )}

        {/* ── Add logo (audio notes only) ──
              Audio notes don't have a content-image flow, so the regular
              "Image" affordance is hidden. They still benefit from a logo
              badge though — the same icon shown on every other note card.
              We reuse the LogoPickerPopover and the icon-only file input
              so the rest of the icon flow (library, upload, delete)
              works identically. */}
        {mType === "audio" && (
          <>
            <input
              ref={modalIconFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files && e.target.files[0];
                if (f && setNoteIconFromFile) await setNoteIconFromFile(f);
                e.target.value = "";
              }}
            />
            <button
              ref={imageBtnRef}
              className={`${btnClass} modal-footer-btn--image focus:outline-none`}
              onClick={() => setLogoPickerOpen((v) => !v)}
              data-tooltip={!isDesktop ? (currentNoteIcon ? t("replaceLogo") : t("addLogo")) : undefined}
            >
              <LogoIcon />
              {isDesktop && <span>{currentNoteIcon ? t("replaceLogo") : t("addLogo")}</span>}
              {currentNoteIcon && (
                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full overflow-hidden">
                  <img
                    src={currentNoteIcon.src}
                    alt=""
                    className="w-full h-full"
                    style={{ objectFit: "contain" }}
                    draggable={false}
                  />
                </span>
              )}
            </button>
            <LogoPickerPopover
              anchorRef={imageBtnRef}
              open={logoPickerOpen}
              onClose={() => setLogoPickerOpen(false)}
              dark={dark}
              logos={logoLibrary}
              selectedSrc={currentNoteIcon?.src}
              onPickExisting={handlePickExistingLogo}
              onUploadNew={() => modalIconFileRef?.current?.click()}
              onDeleteLogo={deleteLogoFromLibrary}
            />
          </>
        )}

        {/* ── Tag icon + checkbox dropdown ── */}
        <div className="relative">
          <button
            ref={modalTagBtnRef}
            className={`${btnClass} focus:outline-none`}
            onClick={() => {
              setModalTagFocused((v) => {
                if (!v) setTimeout(() => { if (isDesktop) modalTagInputRef.current?.focus(); }, 0);
                return !v;
              });
              setTagInput("");
            }}
            data-tooltip={!isDesktop ? t("addTag") : undefined}
          >
            <svg className={isDesktop ? "w-4 h-4" : "w-[18px] h-[18px]"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="2.5" />
            </svg>
            {isDesktop && <span>{t("tags")}</span>}
            {/* Badge — tag count */}
            {mTagList.length > 0 && (
              <span className="gk-tag-count-badge absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[10px] font-bold leading-none px-1">
                {mTagList.length}
              </span>
            )}
          </button>

          {/* Tag picker: dropdown on desktop, bottom sheet on mobile */}
          {isDesktop ? modalTagFocused && (() => {
            const rect = modalTagBtnRef.current?.getBoundingClientRect();
            if (!rect) return null;
            const spaceBelow = window.innerHeight - rect.bottom;
            const dropUp = spaceBelow < 320;
            const dropWidth = 260;
            const dropLeft = Math.min(rect.left, window.innerWidth - dropWidth - 8);

            const arrowLeft = rect.left + rect.width / 2 - dropLeft - 6;
            const arrowDir = dropUp ? "down" : "up";
            const nearLeft = arrowLeft < 20;
            const nearRight = arrowLeft > dropWidth - 32;

            return createPortal(
              <div
                ref={tagDropdownRef}
                data-arrow={arrowDir}
                style={{
                  position: "fixed",
                  ...(dropUp
                    ? { bottom: window.innerHeight - rect.top + 6, left: dropLeft }
                    : { top: rect.bottom + 6, left: dropLeft }),
                  width: dropWidth,
                  zIndex: 99999,
                  '--arrow-left': `${arrowLeft}px`,
                  ...(nearLeft && arrowDir === "up" && { borderTopLeftRadius: '4px' }),
                  ...(nearLeft && arrowDir === "down" && { borderBottomLeftRadius: '4px' }),
                  ...(nearRight && arrowDir === "up" && { borderTopRightRadius: '4px' }),
                  ...(nearRight && arrowDir === "down" && { borderBottomRightRadius: '4px' }),
                }}
                className="gk-tag-popover rounded-2xl shadow-2xl bg-white dark:bg-gray-900 border border-indigo-100/80 dark:border-indigo-800/50 ring-1 ring-black/5 dark:ring-white/5"
              >
                <NoteTagPicker variant="popover" {...tagPickerProps} />
              </div>,
              document.body
            );
          })() : (
            <BottomSheet open={modalTagFocused} onClose={closeTagPicker} title={t("tags")} background={sheetBg}>
              <NoteTagPicker variant="sheet" {...tagPickerProps} />
            </BottomSheet>
          )}
        </div>

        {/* ── Undo (hidden in draw canvas mode & in text view mode, also
              hidden for audio notes — undo/redo doesn't apply to audio
              clips, the playlist has per-row delete instead).
              Checklist notes are always editable, so the buttons stay
              visible regardless of the viewMode flag. ── */}
        {!(mType === 'draw' && drawMode === 'draw') && mType !== "audio" && (mType === "checklist" || !viewMode) && (
        <button
          className={`${btnClass} focus:outline-none ${!canUndo ? "opacity-50 cursor-default" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { if (canUndo) { if (!isDesktop) document.activeElement?.blur(); undo(); } }}
          data-tooltip={!isDesktop ? t("undo") : undefined}
        >
          <svg className={isDesktop ? "w-4 h-4" : "w-[18px] h-[18px]"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10h13a4 4 0 0 1 0 8H7" />
            <path d="M3 10l4-4" />
            <path d="M3 10l4 4" />
          </svg>
          {isDesktop && <span>{t("undoShortcut")}</span>}
        </button>
        )}

        {/* ── Redo (same visibility rule as Undo above) ── */}
        {!(mType === 'draw' && drawMode === 'draw') && mType !== "audio" && (mType === "checklist" || !viewMode) && (
        <button
          className={`${btnClass} focus:outline-none ${!canRedo ? "opacity-50 cursor-default" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { if (canRedo) { if (!isDesktop) document.activeElement?.blur(); redo(); } }}
          data-tooltip={!isDesktop ? t("redo") : undefined}
        >
          <svg className={isDesktop ? "w-4 h-4" : "w-[18px] h-[18px]"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10H8a4 4 0 0 0 0 8h10" />
            <path d="M21 10l-4-4" />
            <path d="M21 10l-4 4" />
          </svg>
          {isDesktop && <span>{t("redoShortcut")}</span>}
        </button>
        )}

        {/* Mobile-only formatting button — opens the rich-text toolbar
            in a bottom sheet. The desktop ribbon stays in the sticky
            header (handled by NoteModal), so this button is hidden
            there. Available for text notes (always) and draw notes
            when not in canvas mode (their inline text body still uses
            the same rich editor). View mode hides it. */}
        {!isDesktop && !viewMode && (mType === "text" || (mType === "draw" && drawMode !== "draw")) && (
          <button
            ref={modalFmtBtnRef}
            className={`modal-footer-btn modal-footer-btn--fmt focus:outline-none${showModalFmt ? " is-active" : ""}`}
            onClick={() => setShowModalFmt((v) => !v)}
            data-tooltip={t("formatting")}
            aria-pressed={showModalFmt ? "true" : "false"}
          >
            <TI.TextColor />
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1 modal-footer-spacer" />

        {/* ── Collaborate (hidden on mobile text edit mode & draw edit mode — moved to kebab) ── */}
        {(isDesktop || viewMode || mType !== "text") && !(mType === "draw" && drawMode !== "draw" && !viewMode) && (() => {
          const collabs = (addModalCollaborators || []).filter(c => c.id !== currentUser?.id);
          const hasCollabs = collabs.length > 0;
          return (
            <button
              className={`${hasCollabs && isDesktop ? "modal-footer-labeled-btn" : btnClass} modal-footer-btn--collab focus:outline-none relative`}
              onClick={onOpenCollaboration}
              data-tooltip={hasCollabs || !isDesktop ? t("collaborate") : undefined}
            >
              {/* 20px, not the 18px every other mobile footer icon here uses:
                  this glyph's own ink only fills about 60% of its 20-unit
                  viewBox (the two head circles and the body sit well
                  inside the edges, unlike e.g. the tag icon's outline,
                  which runs almost edge to edge), so at the same box size
                  it reads visibly smaller than its neighbours. Sized up to
                  match the footer's own bigger tier (trash/kebab/image are
                  already 20px) instead of redrawing the glyph. */}
              <svg className={isDesktop ? "w-4 h-4" : "w-[20px] h-[20px]"} fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
              </svg>
              {hasCollabs && isDesktop && (
                <span className="modal-footer-avatars flex items-center -space-x-1">
                  {collabs.slice(0, 3).map((c) => (
                    <span key={c.id} data-tooltip={c.name || c.email}>
                      <UserAvatar
                        name={c.name}
                        email={c.email}
                        avatarUrl={c.avatar_url}
                        size="w-5 h-5"
                        textSize="text-[9px]"
                        dark={dark}
                        className="ring-1 ring-white dark:ring-gray-800"
                        // Solid backing so transparent-PNG avatars stay
                        // legible in this dense stack (collaboration footer only).
                        imgClassName="bg-white"
                      />
                    </span>
                  ))}
                  {collabs.length > 3 && (
                    <span
                      className="text-[13px] font-bold opacity-90 pl-1.5"
                      data-tooltip={collabs.slice(3).map((c) => c.name || c.email).join(", ")}
                    >+{collabs.length - 3}</span>
                  )}
                </span>
              )}
              {!hasCollabs && isDesktop && <span>{t("collaborate")}</span>}
              {hasCollabs && !isDesktop && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-[9px] font-bold leading-none shadow-md ring-[1.5px] ring-white dark:ring-gray-800 px-0.5">
                  {collabs.length}
                </span>
              )}
            </button>
          );
        })()}

        {/* ── Delete / Trash (hidden on mobile edit mode — moved to kebab) ── */}
        {(isDesktop || viewMode || mType !== "text") && (
        <button
          className={`${btnClass} modal-footer-btn--trash focus:outline-none`}
          onClick={onOpenConfirmDelete}
          data-tooltip={!isDesktop ? (isTrashed ? t("permanentlyDelete") : t("moveToTrash")) : undefined}
        >
          <Trash />
          {isDesktop && <span>{isTrashed ? t("permanentlyDelete") : t("trash")}</span>}
        </button>
        )}

        {/* ── Kebab menu (Download + Collaborate) ── */}
        <button
          ref={kebabRef}
          className="modal-footer-btn modal-footer-btn--kebab focus:outline-none"
          onClick={(e) => { e.stopPropagation(); setModalKebabOpen((v) => !v); }}
          data-tooltip={t("moreOptions")}
        >
          <Kebab />
        </button>
        {isDesktop ? (
          <Popover
            anchorRef={kebabRef}
            open={modalKebabOpen}
            onClose={() => setModalKebabOpen(false)}
            showArrow
          >
            <div
              className={`min-w-[180px] border border-[var(--border-light)] rounded-lg shadow-lg ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
              style={{ backgroundColor: dark ? "#222222" : undefined }}
              onClick={(e) => e.stopPropagation()}
            >
              {kebabItems.map((item) => (
                <button
                  key={item.key}
                  className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                  style={{ color: item.color }}
                  onClick={() => runKebabItem(item)}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </Popover>
        ) : (
          <BottomSheet open={modalKebabOpen} onClose={() => setModalKebabOpen(false)} title={t("moreOptions")} background={sheetBg}>
            {kebabItems.map((item) => (
              <SheetRow key={item.key} icon={item.icon} color={item.color} label={item.label} onClick={() => runKebabItem(item)} />
            ))}
          </BottomSheet>
        )}

        {/* Reminder picker — rendered once, anchored to whichever trigger is
            active (footer bell in read mode, kebab in edit mode). Uses the
            rich-text menu shell so it matches the editor's font/block-type
            dropdowns. */}
        {canRemind && (
          <RichTextPopover
            open={reminderPopOpen}
            onClose={() => setReminderPopOpen(false)}
            anchorRef={kebabRef}
            className="rt-pop--reminder"
            preferredWidth={286}
            fullscreenOnMobile
            title={t("reminder")}
          >
            <ReminderPicker
              value={reminderAt}
              onSave={(iso) => onSetReminder(activeId, iso)}
              onClear={() => onSetReminder(activeId, null)}
              onClose={() => setReminderPopOpen(false)}
              timeChips={reminderTimeChips}
              onTimeChipsChange={onReminderTimeChipsChange}
            />
          </RichTextPopover>
        )}

        {/* ── Read-only access badge — shown (instead of the view/edit
            toggle) when the owner limited this collaborator to read-only.
            Independent of the read-mode preference so the status is always
            visible; the offline-peer read-only case keeps its own banner. ── */}
        {readOnlyBadge && (() => {
          // The owner is who limited this collaborator to read-only — name
          // them in the (app-wide custom) tooltip so it's clear who to ask.
          const roOwner = (addModalCollaborators || []).find((c) => c && c.isOwner);
          const roOwnerName = roOwner?.name || roOwner?.email || "";
          const roTooltip = roOwnerName
            ? t("readOnlySetBy").replace("{owner}", roOwnerName)
            : t("accessReadOnly");
          return (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--gk-chrome-accent)] bg-[var(--gk-accent-soft-bg)] border border-[var(--gk-accent-soft-border)] cursor-default select-none"
              data-tooltip={roTooltip}
              aria-label={roTooltip}
            >
              <TI.Eye className="tabler-icon w-4 h-4" />
              {isDesktop && <span>{t("accessReadOnly")}</span>}
            </div>
          );
        })()}

        {/* ── Edit/View toggle — text notes ── */}
        {mType === "text" && !readOnlyBadge && readModeEnabled && (
          <button
            className={`${isDesktop ? "modal-footer-labeled-btn" : "modal-footer-btn"} modal-footer-btn--mode btn-gradient hover:scale-[1.03] active:scale-[0.98]`}
            onClick={handleToggleViewMode}
            data-tooltip={!isDesktop ? (viewMode ? t("switchToEditMode") : t("switchToViewMode")) : undefined}
            aria-label={viewMode ? t("editMode") : t("viewMode")}
          >
            {viewMode ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Z" fill="currentColor" />
                <path d="m14.06 4.94 3.75 3.75 1.41-1.41a1.5 1.5 0 0 0 0-2.12l-1.63-1.63a1.5 1.5 0 0 0-2.12 0l-1.41 1.41Z" fill="currentColor" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Z" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="3.2" fill="currentColor" />
              </svg>
            )}
            {isDesktop && <span>{viewMode ? t("editMode") : t("viewMode")}</span>}
          </button>
        )}

        {/* ── Mode buttons for drawing notes (grouped) ── */}
        {mType === "draw" && !readOnlyBadge && (
          <div className={`flex items-center ${isDesktop ? "gap-1" : "gap-2"}`}>
            {/* Edit/View toggle (hidden in draw canvas mode, or when the
                user disabled the read-mode preference globally) */}
            {drawMode !== "draw" && readModeEnabled && (
              <button
                className={`${isDesktop ? "modal-footer-labeled-btn" : "modal-footer-btn"} modal-footer-btn--mode btn-gradient hover:scale-[1.03] active:scale-[0.98]`}
                onClick={handleToggleViewMode}
                data-tooltip={!isDesktop ? (viewMode ? t("switchToEditMode") : t("switchToViewMode")) : undefined}
                aria-label={viewMode ? t("editMode") : t("viewMode")}
              >
                {viewMode ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Z" fill="currentColor" />
                    <path d="m14.06 4.94 3.75 3.75 1.41-1.41a1.5 1.5 0 0 0 0-2.12l-1.63-1.63a1.5 1.5 0 0 0-2.12 0l-1.41 1.41Z" fill="currentColor" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Z" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="12" cy="12" r="3.2" fill="currentColor" />
                  </svg>
                )}
                {isDesktop && <span>{viewMode ? t("editMode") : t("viewMode")}</span>}
              </button>
            )}
            {/* Draw mode toggle / reading mode */}
            {drawMode === "draw" ? (
              <button
                className={`${isDesktop ? "modal-footer-labeled-btn" : "modal-footer-btn"} modal-footer-btn--mode btn-gradient hover:scale-[1.03] active:scale-[0.98]`}
                onClick={onExitDrawToView}
                data-tooltip={!isDesktop ? t(readModeEnabled ? "readingMode" : "exitDrawMode") : undefined}
                aria-label={t(readModeEnabled ? "readingMode" : "exitDrawMode")}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Z" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="12" cy="12" r="3.2" fill="currentColor" />
                </svg>
                {isDesktop && <span>{t(readModeEnabled ? "readingMode" : "exitDrawMode")}</span>}
              </button>
            ) : (
              <button
                className={`${isDesktop ? "modal-footer-labeled-btn" : "modal-footer-btn"} modal-footer-btn--mode btn-gradient hover:scale-[1.03] active:scale-[0.98]`}
                onClick={onToggleDrawMode}
                data-tooltip={!isDesktop ? t("switchToDrawMode") : undefined}
                aria-label={t("drawMode")}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 17c2-3 4-6 6-3s4 3 6 0 4-3 6 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 10c2-3 4-6 6-3s4 3 6 0 4-3 6 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {isDesktop && <span>{t("drawMode")}</span>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
