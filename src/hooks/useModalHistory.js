import { useRef, useCallback, useEffect, useState } from "react";

/**
 * Lightweight undo / redo for the note modal — text only.
 *
 * Groups rapid keystrokes into a single undo step via a 1-second
 * debounce (similar to Word / Google Keep chunk-level undo).
 *
 * Completely independent from autosave — no coupling, no conflict.
 * Autosave reads state and persists it; this hook only manages the
 * undo/redo navigation stack.  They never interact.
 *
 * Tracked: mTitle + mBody (text notes).
 * Not tracked: color, tags, images, checklist items, drawings.
 */

const DEBOUNCE_MS = 1000;
const MAX_HISTORY = 80;

function eq(a, b) {
  return a && b && a.title === b.title && a.body === b.body;
}

export default function useModalHistory({
  mTitle,
  mBody,
  setMTitle,
  setMBody,
  open,
  activeId,
  mType,
  viewMode,
}) {
  const historyRef = useRef([]);
  const indexRef = useRef(-1);
  const restoringRef = useRef(false);
  const debounceRef = useRef(null);
  const lastSnapRef = useRef(null);
  const [, bump] = useState(0);

  const snap = () => ({ title: mTitle, body: mBody });

  /* ── reset when opening a new note ───────────────────────────── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (open && activeId != null) {
      const s = { title: mTitle, body: mBody };
      historyRef.current = [s];
      indexRef.current = 0;
      lastSnapRef.current = s;
      restoringRef.current = false;
    } else {
      historyRef.current = [];
      indexRef.current = -1;
      lastSnapRef.current = null;
    }
    bump((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeId]);

  /* ── debounced snapshot on text changes ──────────────────────── */
  useEffect(() => {
    if (!open || activeId == null) return;
    // Only track text notes in edit mode
    if (mType !== "text" || viewMode) return;

    // Skip change caused by undo/redo applying a snapshot
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const s = { title: mTitle, body: mBody };
      if (!eq(s, lastSnapRef.current)) {
        const h = historyRef.current;
        const idx = indexRef.current;
        // Truncate forward history
        const next = h.slice(0, idx + 1);
        next.push(s);
        if (next.length > MAX_HISTORY) next.shift();
        historyRef.current = next;
        indexRef.current = next.length - 1;
        lastSnapRef.current = s;
        bump((n) => n + 1);
      }
    }, DEBOUNCE_MS);

    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mTitle, mBody]);

  /* ── apply a snapshot ────────────────────────────────────────── */
  const apply = useCallback(
    (s) => {
      restoringRef.current = true;
      setMTitle(s.title);
      setMBody(s.body);
      lastSnapRef.current = s;
    },
    [setMTitle, setMBody],
  );

  /* ── flush pending debounce (save unsaved typing before undo) ─ */
  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      const s = { title: mTitle, body: mBody };
      if (!eq(s, lastSnapRef.current)) {
        const h = historyRef.current;
        const idx = indexRef.current;
        const next = h.slice(0, idx + 1);
        next.push(s);
        if (next.length > MAX_HISTORY) next.shift();
        historyRef.current = next;
        indexRef.current = next.length - 1;
        lastSnapRef.current = s;
      }
    }
  }, [mTitle, mBody]);

  /* ── undo / redo ─────────────────────────────────────────────── */
  const undo = useCallback(() => {
    flush();
    const idx = indexRef.current;
    if (idx > 0) {
      indexRef.current = idx - 1;
      apply(historyRef.current[idx - 1]);
      bump((n) => n + 1);
    }
  }, [flush, apply]);

  const redo = useCallback(() => {
    const idx = indexRef.current;
    const h = historyRef.current;
    if (idx < h.length - 1) {
      indexRef.current = idx + 1;
      apply(h[idx + 1]);
      bump((n) => n + 1);
    }
  }, [apply]);

  /* ── only active for text notes in edit mode ─────────────────── */
  const active = mType === "text" && !viewMode;

  return {
    undo,
    redo,
    canUndo: active && indexRef.current > 0,
    canRedo: active && indexRef.current < historyRef.current.length - 1,
  };
}
