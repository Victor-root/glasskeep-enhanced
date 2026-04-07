import { useRef, useCallback, useEffect, useState } from "react";

/**
 * Undo / Redo history for the note modal.
 *
 * Tracks snapshots of: mTitle, mBody, mItems, mColor, mTagList.
 * Snapshots are created after 500 ms of inactivity (debounced) to group
 * rapid keystrokes into a single history entry — similar to Google Keep.
 *
 * Drawing data is NOT tracked here (DrawingCanvas has its own undo).
 *
 * Usage:
 *   const { undo, redo, canUndo, canRedo } = useModalHistory({ ...props });
 */

const DEBOUNCE_MS = 500;
const MAX_HISTORY = 100;

function deepCloneItems(items) {
  if (!items || items.length === 0) return [];
  return items.map((it) => ({ ...it }));
}

function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.mTitle === b.mTitle &&
    a.mBody === b.mBody &&
    a.mColor === b.mColor &&
    JSON.stringify(a.mItems) === JSON.stringify(b.mItems) &&
    JSON.stringify(a.mTagList) === JSON.stringify(b.mTagList)
  );
}

export default function useModalHistory({
  // current state values
  mTitle,
  mBody,
  mItems,
  mColor,
  mTagList,
  // setters to apply snapshots
  setMTitle,
  setMBody,
  setMItems,
  setMColor,
  setMTagList,
  // modal lifecycle
  open,
  activeId,
}) {
  /* ── internal refs ──────────────────────────────────────────────── */
  const historyRef = useRef([]);       // array of snapshots
  const indexRef = useRef(-1);         // current position in history
  const restoringRef = useRef(false);  // true while applying a snapshot
  const debounceRef = useRef(null);
  const lastSnapRef = useRef(null);    // last committed snapshot (for comparison)

  // Keep a ref to latest state so undo flush always reads current values
  const stateRef = useRef({ mTitle, mBody, mItems, mColor, mTagList });
  useEffect(() => {
    stateRef.current = { mTitle, mBody, mItems, mColor, mTagList };
  });

  // Force re-render to update canUndo / canRedo
  const [, bump] = useState(0);

  /* ── helpers ────────────────────────────────────────────────────── */
  const snap = useCallback(
    (src) => ({
      mTitle: src?.mTitle ?? mTitle,
      mBody: src?.mBody ?? mBody,
      mItems: deepCloneItems(src?.mItems ?? mItems),
      mColor: src?.mColor ?? mColor,
      mTagList: [...(src?.mTagList ?? mTagList ?? [])],
    }),
    [mTitle, mBody, mItems, mColor, mTagList],
  );

  const pushSnapshot = useCallback((s) => {
    const h = historyRef.current;
    const idx = indexRef.current;
    // truncate forward history if we're in the middle
    const next = h.slice(0, idx + 1);
    next.push(s);
    // cap size
    if (next.length > MAX_HISTORY) next.shift();
    historyRef.current = next;
    indexRef.current = next.length - 1;
    lastSnapRef.current = s;
    bump((n) => n + 1);
  }, []);

  const applySnapshot = useCallback(
    (s) => {
      restoringRef.current = true;
      setMTitle(s.mTitle);
      setMBody(s.mBody);
      setMItems(deepCloneItems(s.mItems));
      setMColor(s.mColor);
      setMTagList([...s.mTagList]);
    },
    [setMTitle, setMBody, setMItems, setMColor, setMTagList],
  );

  /* ── reset when a different note is opened ──────────────────────── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (open && activeId != null) {
      // Capture initial state after the render that set all values
      const initial = snap();
      historyRef.current = [initial];
      indexRef.current = 0;
      lastSnapRef.current = initial;
      restoringRef.current = false;
      bump((n) => n + 1);
    } else {
      historyRef.current = [];
      indexRef.current = -1;
      lastSnapRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeId]);

  /* ── watch for changes → debounced snapshot ─────────────────────── */
  const itemsKey = JSON.stringify(mItems);
  const tagsKey = JSON.stringify(mTagList);

  useEffect(() => {
    if (!open || activeId == null) return;

    // Skip if this render was caused by undo/redo applying a snapshot
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const current = snap();
      if (!snapshotsEqual(current, lastSnapRef.current)) {
        pushSnapshot(current);
      }
    }, DEBOUNCE_MS);

    return () => {
      // don't clear on unmount — only on next change
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mTitle, mBody, mColor, itemsKey, tagsKey, open, activeId]);

  /* ── flush any pending debounce, returns true if a new snap was pushed */
  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const current = snap(stateRef.current);
    if (!snapshotsEqual(current, lastSnapRef.current)) {
      pushSnapshot(current);
      return true;
    }
    return false;
  }, [snap, pushSnapshot]);

  /* ── public API ─────────────────────────────────────────────────── */
  const undo = useCallback(() => {
    flush(); // save current state before going back
    const idx = indexRef.current;
    if (idx > 0) {
      indexRef.current = idx - 1;
      applySnapshot(historyRef.current[idx - 1]);
      bump((n) => n + 1);
    }
  }, [flush, applySnapshot]);

  const redo = useCallback(() => {
    const idx = indexRef.current;
    const h = historyRef.current;
    if (idx < h.length - 1) {
      indexRef.current = idx + 1;
      applySnapshot(h[idx + 1]);
      bump((n) => n + 1);
    }
  }, [applySnapshot]);

  return {
    undo,
    redo,
    canUndo: indexRef.current > 0,
    canRedo: indexRef.current < historyRef.current.length - 1,
  };
}
