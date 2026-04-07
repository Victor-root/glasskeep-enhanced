import { useRef, useCallback, useEffect, useState } from "react";

/**
 * Undo / Redo history for the note modal — aligned with autosave.
 *
 * Instead of its own debounce timer, the hook exposes `captureSnapshot()`
 * which must be called by the autosave logic each time a save succeeds.
 * This guarantees 1 undo step = 1 persisted save, so undo/redo never
 * drifts out of sync with what's actually stored.
 *
 * Tracked state: mTitle, mBody, mItems, mColor, mTagList.
 * Drawing data is NOT tracked (DrawingCanvas has its own undo).
 *
 * Usage in NoteModal:
 *   const { undo, redo, canUndo, canRedo, captureSnapshot } = useModalHistory({ ... });
 *   // pass captureSnapshot up via ref so App.jsx can call it after autosave
 */

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
  mTitle,
  mBody,
  mItems,
  mColor,
  mTagList,
  setMTitle,
  setMBody,
  setMItems,
  setMColor,
  setMTagList,
  open,
  activeId,
}) {
  const historyRef = useRef([]);
  const indexRef = useRef(-1);
  const restoringRef = useRef(false);
  const lastSnapRef = useRef(null);

  // Always-fresh state ref for captureSnapshot (avoids stale closures)
  const stateRef = useRef({ mTitle, mBody, mItems, mColor, mTagList });
  useEffect(() => {
    stateRef.current = { mTitle, mBody, mItems, mColor, mTagList };
  });

  const [, bump] = useState(0);

  /* ── helpers ────────────────────────────────────────────────────── */
  const makeSnap = (src) => ({
    mTitle: src.mTitle ?? "",
    mBody: src.mBody ?? "",
    mItems: deepCloneItems(src.mItems),
    mColor: src.mColor ?? "default",
    mTagList: [...(src.mTagList ?? [])],
  });

  const pushSnapshot = useCallback((s) => {
    const h = historyRef.current;
    const idx = indexRef.current;
    const next = h.slice(0, idx + 1);
    next.push(s);
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
    if (open && activeId != null) {
      const initial = makeSnap(stateRef.current);
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

  /* ── captureSnapshot: called by autosave on success ─────────────── */
  const captureSnapshot = useCallback(() => {
    // Skip if this render was caused by undo/redo restoring state
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    const current = makeSnap(stateRef.current);
    if (!snapshotsEqual(current, lastSnapRef.current)) {
      pushSnapshot(current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushSnapshot]);

  /* ── undo / redo ────────────────────────────────────────────────── */
  const undo = useCallback(() => {
    const idx = indexRef.current;
    if (idx <= 0) return;

    // If there are unsaved changes since last snapshot, save them as a new
    // entry so redo can get back to them.
    const current = makeSnap(stateRef.current);
    if (!snapshotsEqual(current, lastSnapRef.current)) {
      pushSnapshot(current);
      // Index was bumped by pushSnapshot, go back two steps
      indexRef.current = indexRef.current - 1;
      applySnapshot(historyRef.current[indexRef.current]);
    } else {
      indexRef.current = idx - 1;
      applySnapshot(historyRef.current[idx - 1]);
    }
    bump((n) => n + 1);
  }, [applySnapshot, pushSnapshot]);

  const redo = useCallback(() => {
    const idx = indexRef.current;
    const h = historyRef.current;
    if (idx >= h.length - 1) return;
    indexRef.current = idx + 1;
    applySnapshot(h[idx + 1]);
    bump((n) => n + 1);
  }, [applySnapshot]);

  return {
    undo,
    redo,
    canUndo: indexRef.current > 0,
    canRedo: indexRef.current < historyRef.current.length - 1,
    captureSnapshot,
  };
}
