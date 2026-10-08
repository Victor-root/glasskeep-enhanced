import { useEffect, useState } from "react";

// How long "saved" stays up once the server has everything.
const SAVED_FLASH_MS = 1400;
// An edit saved on the device enters the sync queue a moment later; past
// this without the server confirming anything, the edit led to no change.
const AWAIT_CONFIRM_MS = 1500;

/**
 * Where the open note's edits stand, for the footer's save line:
 *   "saving"  not confirmed by the server yet (awaiting the autosave, queued,
 *             or between the two),
 *   "offline" kept on the device until the server is reachable again,
 *   "error"   refused by the server for good,
 *   "saved"   for a moment once the server has confirmed a sync since the
 *             edits began, then "idle".
 * Phases are derived during render (not in an effect), so the line never
 * shows a frame of "idle" between two of them.
 */
export default function useNoteSaveState(noteId, hasLocalChanges, syncStatus) {
  const id = noteId == null ? null : String(noteId);
  const queued = id ? (syncStatus?.items || []).filter((item) => String(item.noteId) === id) : [];
  const offline = syncStatus?.syncState === "offline";
  let busy = null;
  if (queued.some((item) => item.status === "failed")) busy = "error";
  else if (hasLocalChanges || queued.length > 0) busy = offline ? "offline" : "saving";
  const lastSyncAt = syncStatus?.lastSyncAt || 0;

  // phase: "busy" | "awaiting" (no longer busy, server not heard from yet) |
  // "saved" | "idle"; start: when the current run of edits began.
  const [track, setTrack] = useState(() => ({ id, phase: busy ? "busy" : "idle", start: Date.now() }));
  let next = track;
  if (track.id !== id) {
    // eslint-disable-next-line react-hooks/purity -- stamps when this run of edits began; the value is kept in state, not recomputed
    next = { id, phase: busy ? "busy" : "idle", start: Date.now() };
  } else if (busy) {
    if (track.phase !== "busy") {
      // eslint-disable-next-line react-hooks/purity -- same as above
      next = { id, phase: "busy", start: track.phase === "awaiting" ? track.start : Date.now() };
    }
  } else if (track.phase === "busy" || track.phase === "awaiting") {
    const phase = lastSyncAt >= track.start ? "saved" : "awaiting";
    if (phase !== track.phase) next = { ...track, phase };
  }
  if (next !== track) setTrack(next);

  useEffect(() => {
    const delay = track.phase === "saved" ? SAVED_FLASH_MS : track.phase === "awaiting" ? AWAIT_CONFIRM_MS : 0;
    if (!delay) return undefined;
    const timer = setTimeout(() => setTrack((t) => (t === track ? { ...t, phase: "idle" } : t)), delay);
    return () => clearTimeout(timer);
  }, [track]);

  if (busy) return busy;
  if (next.phase === "saved") return "saved";
  if (next.phase === "awaiting") return offline ? "offline" : "saving";
  return "idle";
}
