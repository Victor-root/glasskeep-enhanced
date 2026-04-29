import { useRef, useCallback, useEffect, useState } from "react";

/**
 * Lightweight undo / redo for the note modal — text + checklist.
 *
 * Groups rapid changes into a single undo step via a 1-second
 * debounce (similar to Word / Google Keep chunk-level undo).
 *
 * Completely independent from autosave — no coupling, no conflict.
 * Autosave reads state and persists it; this hook only manages the
 * undo/redo navigation stack.  They never interact.
 *
 * Tracked snapshot per note type:
 *   - text       → { type, title, body }
 *   - checklist  → { type, title, items }    (deep-compared via JSON)
 * Not tracked: color, tags, images, drawings.
 *
 * Why checklist needs its own snapshot shape: text notes carry their
 * payload in `mBody` (string), checklist notes in `mItems` (an array
 * of section/entry objects). Comparing by JSON.stringify is fast
 * enough at the 1-second debounce cadence even for large lists, and
 * sidesteps the cost of writing a structural deep-equal.
 */

const DEBOUNCE_MS = 1000;
const MAX_HISTORY = 80;

function itemsEq(a, b) {
  // Same reference fast path; otherwise stringify (debounced anyway).
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function eq(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.title !== b.title) return false;
  if (a.type === "checklist") return itemsEq(a.items, b.items);
  return a.body === b.body;
}

export default function useModalHistory({
  mTitle,
  mBody,
  mItems,
  setMTitle,
  setMBody,
  setMItems,
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

  const snap = useCallback(() => {
    if (mType === "checklist") {
      return { type: "checklist", title: mTitle, items: mItems };
    }
    return { type: "text", title: mTitle, body: mBody };
  }, [mType, mTitle, mBody, mItems]);

  /* ── reset when opening a new note ───────────────────────────── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (open && activeId != null) {
      const s = snap();
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

  /* ── debounced snapshot on tracked changes ───────────────────── */
  useEffect(() => {
    if (!open || activeId == null) return;
    // Tracked types: text in edit mode, checklist always (no view
    // mode toggle exists for checklists — items are always editable).
    if (mType === "text" && viewMode) return;
    if (mType !== "text" && mType !== "checklist") return;

    // Skip change caused by undo/redo applying a snapshot.
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const s = snap();
      if (!eq(s, lastSnapRef.current)) {
        const h = historyRef.current;
        const idx = indexRef.current;
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
  }, [mTitle, mBody, mItems]);

  /* ── apply a snapshot ────────────────────────────────────────── */
  const apply = useCallback(
    (s) => {
      restoringRef.current = true;
      setMTitle(s.title);
      if (s.type === "checklist") {
        if (setMItems) setMItems(s.items);
      } else {
        if (setMBody) setMBody(s.body);
      }
      lastSnapRef.current = s;
    },
    [setMTitle, setMBody, setMItems],
  );

  /* ── flush pending debounce (save unsaved typing before undo) ─ */
  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      const s = snap();
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
  }, [snap]);

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

  /* ── active for text-edit and any checklist ──────────────────── */
  const active =
    (mType === "text" && !viewMode) || mType === "checklist";

  return {
    undo,
    redo,
    canUndo: active && indexRef.current > 0,
    canRedo: active && indexRef.current < historyRef.current.length - 1,
  };
}
