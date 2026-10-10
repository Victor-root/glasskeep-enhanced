import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Dock geometry used to fit the action buttons into the measured width.
const PAD = 20; // dock inner padding (10px each side)
const GAP = 8; // dock flex gap
const DIVIDER = 1 + GAP * 2; // counter|actions and actions|close dividers
const KEBAB = 36;

/**
 * Splits the multi-select dock's actions between the dock row and its
 * kebab menu, from real measurements: the wrapper's width (containerRef),
 * each button in a hidden ghost row (measureRef, one `data-action-id` per
 * action), the counter cluster (fixedRef) and the close button (closeRef).
 * Actions earlier in the list win the width budget. `compact` turns the
 * dock buttons into icon-only squares on narrow docks.
 */
export default function useDockOverflow({ shouldRender, isMobile, actions }) {
  const containerRef = useRef(null); // outer wrapper: drives the budget
  const measureRef = useRef(null);   // hidden ghost row: measures each btn
  const fixedRef = useRef(null);     // counter cluster: measure
  const closeRef = useRef(null);     // close button: measure

  const [availableWidth, setAvailableWidth] = useState(0);
  const [actionWidths, setActionWidths] = useState({});
  const [counterWidth, setCounterWidth] = useState(110);
  const [closeWidth, setCloseWidth] = useState(36);

  // ResizeObserver: track the wrapper's available width as a real budget.
  // On mobile the viewport width is stable (no resize events), so we do a
  // single read and skip the observer to avoid continuous layout work.
  useEffect(() => {
    if (!shouldRender) return;
    const el = containerRef.current;
    if (!el) return;
    if (isMobile) {
      setAvailableWidth(el.clientWidth);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        setAvailableWidth((prev) => (prev === w ? prev : w));
      }
    });
    ro.observe(el);
    setAvailableWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [shouldRender, isMobile]);

  // Compact (icon-only) mode kicks in on narrow docks, typically mobile.
  // Drops every button's text label and turns each into a 36x36 square,
  // with tooltips (data-tooltip) preserving discoverability. Multiplies
  // the number of actions that can stay in the dock before overflowing
  // into the kebab.
  const compact = isMobile || (availableWidth > 0 && availableWidth < 700);

  // Measure each button via the hidden ghost. On mobile, all buttons are
  // compact 36px squares: no DOM measurement needed; use fixed widths
  // and only re-run when the ACTION IDs change (filter switch), not on
  // every label/selectedIds change.
  const actionsKey = actions.map((a) => `${a.id}:${a.label}`).join("|");
  const mobileActionsKey = actions.map((a) => a.id).join("|");
  useLayoutEffect(() => {
    if (!shouldRender) return;
    if (isMobile) {
      // Compact buttons are all 36px: skip ghost DOM queries.
      const mobileWidths = {};
      for (const a of actions) mobileWidths[a.id] = 36;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- layout measurement feeding the overflow split
      setActionWidths(mobileWidths);
      if (fixedRef.current) setCounterWidth(fixedRef.current.offsetWidth);
      if (closeRef.current) setCloseWidth(closeRef.current.offsetWidth);
      return;
    }
    if (!measureRef.current) return;
    const widths = {};
    measureRef.current.querySelectorAll("[data-action-id]").forEach((b) => {
      widths[b.dataset.actionId] = b.offsetWidth;
    });
    setActionWidths(widths);
    if (fixedRef.current) setCounterWidth(fixedRef.current.offsetWidth);
    if (closeRef.current) setCloseWidth(closeRef.current.offsetWidth);
  }, [shouldRender, isMobile ? mobileActionsKey : actionsKey, compact, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps -- the action keys stand for the actions list, remeasured only when the set of buttons changes

  // Compute the visible / overflow split based on real measurements.
  // Two passes: first without reserving kebab space; if that overflows,
  // reserve kebab and re-fit so reserving the kebab itself doesn't push
  // another button out unexpectedly.
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

  return { containerRef, measureRef, fixedRef, closeRef, compact, visibleActions, overflowActions };
}
