import React, { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { Trash, PencilIcon, PlayFilledIcon, PauseFilledIcon } from "../../icons/index.jsx";
import { formatDuration } from "../../utils/audioNote.js";

// Playlist-style list of clips in an audio note. Each row shows:
//  - A row index, that becomes a play indicator when this clip is current.
//  - The clip name (display only — clicking the row plays it; renaming is
//    triggered by the pencil button on the right so a single tap on the
//    row never gets in the way of starting playback).
//  - The clip duration on the right.
//  - A pencil button to rename + a trash button to delete.
//
// Clicking the row calls onPlayClip(i): the parent decides whether to make
// it the current clip and start playback. Clicking pencil/trash stops
// propagation so they don't double-trigger the row's play action.

export default function ClipList({
  clips,
  currentIndex,
  isPlaying = false,
  onPlayClip,
  onRenameClip,
  onDeleteClip,
}) {
  if (!Array.isArray(clips) || clips.length === 0) {
    return (
      <div className="text-xs text-center italic text-gray-500 dark:text-gray-400 py-3">
        {t("audioPlaylistEmpty")}
      </div>
    );
  }
  return (
    <ul className="rounded-xl border border-black/15 dark:border-white/15 bg-white/55 dark:bg-black/20 divide-y divide-black/10 dark:divide-white/10 overflow-hidden">
      {clips.map((clip, i) => (
        <ClipRow
          key={clip.id || i}
          clip={clip}
          index={i}
          isCurrent={i === currentIndex}
          isPlaying={isPlaying && i === currentIndex}
          onPlay={() => onPlayClip(i)}
          onRename={(name) => onRenameClip(i, name)}
          onDelete={() => onDeleteClip(i)}
        />
      ))}
    </ul>
  );
}

function ClipRow({ clip, index, isCurrent, isPlaying, onPlay, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(clip.name || "");
  const inputRef = useRef(null);

  // Sync local draft when the parent changes the clip name from elsewhere
  // (e.g. another device synced an updated name). Avoid clobbering the
  // user's in-progress edit.
  useEffect(() => {
    if (!editing) setDraft(clip.name || "");
  }, [clip.name, editing]);

  const startEdit = (e) => {
    e?.stopPropagation();
    setDraft(clip.name || "");
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const commit = () => {
    setEditing(false);
    const next = (draft || "").trim();
    if (next !== (clip.name || "")) onRename(next);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(clip.name || "");
  };

  const fallbackName = t("audioClipDefaultName").replace("{n}", String(index + 1));
  const displayName = (clip.name && clip.name.trim()) || fallbackName;

  return (
    <li
      className={`group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
        isCurrent
          ? "bg-black/[0.06] dark:bg-white/10"
          : "hover:bg-black/[0.04] dark:hover:bg-white/5"
      }`}
      onClick={() => {
        // Renaming an in-progress edit shouldn't trigger play if the user
        // happens to click outside the input but still inside the row.
        if (editing) return;
        onPlay();
      }}
    >
      <span
        className={`shrink-0 w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center ${
          isCurrent ? "text-white shadow" : "bg-black/10 dark:bg-white/15 text-gray-700 dark:text-gray-200"
        }`}
        style={isCurrent ? { backgroundColor: "var(--audio-accent, #7c3aed)" } : undefined}
        aria-hidden="true"
      >
        {isCurrent && isPlaying ? (
          <PauseFilledIcon className="w-3.5 h-3.5" />
        ) : isCurrent ? (
          <PlayFilledIcon className="w-3.5 h-3.5 ml-0.5" />
        ) : (
          index + 1
        )}
      </span>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              else if (e.key === "Escape") { e.preventDefault(); cancel(); }
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder={t("audioClipNamePlaceholder")}
            className="w-full bg-transparent border-b border-black/30 dark:border-white/30 text-sm font-medium focus:outline-none focus:border-current"
            style={{ caretColor: "var(--audio-accent, #7c3aed)" }}
          />
        ) : (
          <span className="block text-sm font-medium truncate select-none">
            {displayName}
          </span>
        )}
      </div>

      <span className="shrink-0 tabular-nums text-xs font-medium opacity-80">
        {formatDuration(Number.isFinite(clip.duration) ? clip.duration : 0)}
      </span>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); editing ? commit() : startEdit(e); }}
        aria-label={t("audioRowRename")}
        data-tooltip={t("audioRowRename")}
        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-700 dark:text-gray-200 opacity-60 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/15 active:scale-95 transition focus:outline-none focus:ring-2 focus:opacity-100"
      >
        <PencilIcon />
      </button>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label={t("audioRowDelete")}
        data-tooltip={t("audioRowDelete")}
        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-red-600 dark:text-red-300 opacity-60 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/40 active:scale-95 transition focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:opacity-100"
      >
        <Trash />
      </button>
    </li>
  );
}
