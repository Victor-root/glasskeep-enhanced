import React, { useRef } from "react";
import Popover from "../common/Popover.jsx";
import Sheet, { SheetRow } from "../common/Sheet.jsx";
import ReminderPicker from "../notes/ReminderPicker.jsx";
import { Popover as RichTextPopover } from "../richtext/Popover.jsx";
import CollaborateIcon from "./CollaborateIcon.jsx";
import { DownloadIcon, ArchiveIcon, Trash, Kebab, TextNoteIcon, ChecklistIcon, PinOutline, PinFilled } from "../../icons/index.jsx";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

/**
 * "More options" menu of the modal footer: a popover on desktop, a bottom
 * sheet on phones. Also hosts the reminder picker, which opens from the
 * menu's Reminder entry and anchors to the kebab trigger.
 */
export default function FooterKebabMenu({
  dark,
  isDesktop,
  isTrashed,
  sheetBg,
  mType,
  viewMode,
  drawMode,
  activeId,
  notes,
  tagFilter,
  activeNoteObj,
  onTogglePin,
  onDownloadNote,
  onRestoreFromTrash,
  onArchiveNote,
  onOpenConfirmDelete,
  onOpenCollaboration,
  onSetReminder,
  reminderPopOpen,
  setReminderPopOpen,
  reminderTimeChips,
  onReminderTimeChipsChange,
  modalKebabOpen,
  setModalKebabOpen,
  onConvertNoteType,
  onDuplicateNote,
  noteAiAvailable,
  onOpenNoteAi,
}) {
  const handleDownload = () => {
    const n = notes.find((nn) => String(nn.id) === String(activeId));
    if (n) onDownloadNote(n);
  };

  const handleArchiveToggle = () => {
    const note = notes.find((nn) => String(nn.id) === String(activeId));
    if (note) onArchiveNote(activeId, !note.archived);
  };

  /* Reminder picker popover: the bell lives in the kebab menu; the picker
     anchors to the kebab trigger. */
  const reminderAt = activeNoteObj?.reminderAt || null;
  const hasReminder = !!reminderAt;
  const canRemind = !isTrashed && typeof onSetReminder === "function";

  const kebabRef = useRef(null);

  /* Kebab menu entries, shared by the desktop popover and the mobile sheet.
     Each keeps its own colour so it reads the same in both. */
  const isPinned = !!activeNoteObj?.pinned;
  const kebabItems = [
    // Pin lives in the note header on desktop.
    !isDesktop && onTogglePin && tagFilter !== "ARCHIVED" && tagFilter !== "TRASHED" && {
      key: "pin",
      color: dark ? "#a5b4fc" : "#4f46e5",
      icon: isPinned ? <PinFilled /> : <PinOutline />,
      label: isPinned ? t("unpinNote") : t("pinNote"),
      run: () => activeId != null && onTogglePin(activeId, !isPinned),
    },
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
      icon: <CollaborateIcon className="w-4 h-4" />,
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

  const reminderPicker = canRemind && (
    <ReminderPicker
      value={reminderAt}
      onSave={(iso) => onSetReminder(activeId, iso)}
      onClear={() => onSetReminder(activeId, null)}
      onClose={() => setReminderPopOpen(false)}
      timeChips={reminderTimeChips}
      onTimeChipsChange={onReminderTimeChipsChange}
    />
  );

  return (
    <>
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
        <Sheet open={modalKebabOpen} onClose={() => setModalKebabOpen(false)} title={t("moreOptions")} background={sheetBg}>
          {kebabItems.map((item) => (
            <SheetRow key={item.key} icon={item.icon} color={item.color} label={item.label} onClick={() => runKebabItem(item)} />
          ))}
        </Sheet>
      )}

      {/* Reminder picker, opened from the kebab: on desktop a popover in
          the rich-text menu shell (matching the editor's font / block-type
          dropdowns), on phones a bottom sheet. */}
      {canRemind && (isDesktop ? (
        <RichTextPopover
          open={reminderPopOpen}
          onClose={() => setReminderPopOpen(false)}
          anchorRef={kebabRef}
          className="rt-pop--reminder"
          preferredWidth={286}
        >
          {reminderPicker}
        </RichTextPopover>
      ) : (
        <Sheet open={reminderPopOpen} onClose={() => setReminderPopOpen(false)} title={t("reminder")} background={sheetBg}>
          {reminderPicker}
        </Sheet>
      ))}
    </>
  );
}
