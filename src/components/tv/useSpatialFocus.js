import { useEffect, useRef } from "react";

// 2D spatial navigation for the D-pad / arrow keys.
//
// Picks the closest focusable in the requested direction by geometry
// (the way Android TV's framework does), not by tab order. Tuned for
// older Shield hardware:
//  - keydown handler runs in capture phase so the throttle hits before
//    React's synthetic events
//  - scrollIntoView uses block:"nearest" without smooth — smooth scroll
//    on the Shield webview can stall for 200-300ms per row
//  - candidate scan ignores the viewport bounds; otherwise the user
//    gets stuck on the last visible row (no row below is "visible")
//  - data-tv-focused attribute is only swapped on the previous & next
//    elements, never the whole tree, to avoid a CSS recalc storm

const FOCUSABLE_SELECTOR = ".tv-focusable";
const DPAD_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Up", "Down", "Left", "Right",
]);

function getRect(el) {
  const r = el.getBoundingClientRect();
  return {
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
    left: r.left, right: r.right, top: r.top, bottom: r.bottom,
    width: r.width, height: r.height,
  };
}

function isFocusable(el) {
  if (!el || !el.isConnected) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el.hasAttribute("disabled")) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return true;
}

// Return a coarse "zone" label so D-pad nav stays inside its own area
// where it makes sense:
//   - vertical (up/down) trapped in sidebar / detail viewer
//   - horizontal (left/right) trapped in header — otherwise pressing
//     Right on the rightmost header button jumped focus into a card
//     down in the grid, which felt like a teleport
function zoneOf(el) {
  if (!el) return "main";
  if (el.closest(".tv-sidebar")) return "sidebar";
  if (el.closest(".tv-detail")) return "detail";
  if (el.closest(".tv-header")) return "header";
  return "main";
}

function pickNextFocus(current, direction) {
  const all = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(isFocusable);
  if (!all.length) return null;
  if (!current || !current.isConnected) return all[0];
  const cur = getRect(current);
  let pool = all;
  const curZone = zoneOf(current);
  // Vertical containment: sidebar and detail viewer keep their own
  // up/down loops. Header lets up/down leave (Down goes to cards).
  if (direction === "up" || direction === "down") {
    if (curZone === "sidebar" || curZone === "detail") {
      pool = all.filter((el) => zoneOf(el) === curZone);
    }
  }
  // Horizontal containment: header stays on its own row — the three
  // left chrome buttons cycle to the user chip on Right and back via
  // Left, without leaking down into the notes grid.
  if (direction === "left" || direction === "right") {
    if (curZone === "header" || curZone === "detail") {
      pool = all.filter((el) => zoneOf(el) === curZone);
    }
  }
  let best = null;
  let bestScore = Infinity;
  for (const el of pool) {
    if (el === current) continue;
    const r = getRect(el);
    let primary, lateral, passes = false;
    if (direction === "right") {
      primary = r.left - cur.right;
      lateral = Math.abs(r.cy - cur.cy);
      passes = r.left >= cur.right - 8;
    } else if (direction === "left") {
      primary = cur.left - r.right;
      lateral = Math.abs(r.cy - cur.cy);
      passes = r.right <= cur.left + 8;
    } else if (direction === "down") {
      primary = r.top - cur.bottom;
      lateral = Math.abs(r.cx - cur.cx);
      passes = r.top >= cur.bottom - 8;
    } else if (direction === "up") {
      primary = cur.top - r.bottom;
      lateral = Math.abs(r.cx - cur.cx);
      passes = r.bottom <= cur.top + 8;
    }
    if (!passes || primary < 0) continue;
    const score = primary + lateral * 2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

let lastFocusedRef = null; // module-scoped: only one TV viewer alive at a time
function focusElement(el) {
  if (!el) return;
  if (lastFocusedRef && lastFocusedRef !== el) {
    lastFocusedRef.removeAttribute("data-tv-focused");
  }
  if (typeof el.focus === "function") {
    try { el.focus({ preventScroll: false }); }
    catch { el.focus(); }
  }
  el.setAttribute("data-tv-focused", "true");
  lastFocusedRef = el;
  if (typeof el.scrollIntoView === "function") {
    try {
      // Non-smooth scroll: smooth is too laggy on older Shield WebViews
      // (each step triggers a paint). Instant scroll lets the focus
      // transition (scale + glow) be the only animation.
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch { /* WebViews missing the options bag — skip */ }
  }
}

function focusFirst() {
  const first = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR))
    .find(isFocusable);
  if (first) focusElement(first);
}

export default function useSpatialFocus({ enabled, onBack, onEdgeReached, onZoneChange } = {}) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const onEdgeReachedRef = useRef(onEdgeReached);
  onEdgeReachedRef.current = onEdgeReached;
  const onZoneChangeRef = useRef(onZoneChange);
  onZoneChangeRef.current = onZoneChange;

  useEffect(() => {
    if (!enabled) return undefined;
    const id = requestAnimationFrame(() => {
      if (!document.activeElement || document.activeElement === document.body) {
        focusFirst();
      }
    });

    // Throttle key auto-repeats. 30ms was the original target but the
    // CSS focus transition takes 130ms and the Shield can't repaint
    // that fast — the user reported the cursor "disappearing" while
    // holding Down. 110ms lets the focus glow visibly land on every
    // step (still ~9 moves/sec, well within usable range).
    let keyLockUntil = 0;
    const REPEAT_LOCK_MS = 110;
    const handler = (e) => {
      const active = document.activeElement;
      const isEditable = active && (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable
      );
      if (isEditable) return;

      if (DPAD_KEYS.has(e.key)) {
        const now = performance.now();
        // Apply the lock to auto-repeats only — a single tap is fast
        // enough to always go through.
        if (e.repeat && now < keyLockUntil) { e.preventDefault(); return; }
        keyLockUntil = now + REPEAT_LOCK_MS;
        e.preventDefault();
        const dir = e.key.replace("Arrow", "").toLowerCase();
        const anchor = active && active.matches?.(FOCUSABLE_SELECTOR) ? active : lastFocusedRef;
        const next = pickNextFocus(anchor, dir);
        if (next) {
          // Notify the consumer when the move crosses zones (e.g. the
          // user just left the sidebar going right). That's how the
          // viewer auto-closes the rail.
          if (anchor && typeof onZoneChangeRef.current === "function") {
            const fromZone = zoneOf(anchor);
            const toZone = zoneOf(next);
            if (fromZone !== toZone) onZoneChangeRef.current(fromZone, toZone, dir);
          }
          focusElement(next);
        } else if (typeof onEdgeReachedRef.current === "function") {
          // No candidate in this direction — let the parent decide
          // (open / close sidebar, etc).
          onEdgeReachedRef.current(dir, anchor);
        } else if (!active || !active.matches?.(FOCUSABLE_SELECTOR)) {
          focusFirst();
        }
        return;
      }
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        if (active && active.matches?.(FOCUSABLE_SELECTOR)) {
          e.preventDefault();
          active.click();
        }
        return;
      }
      if (e.key === "Escape" || e.key === "GoBack" || e.key === "Backspace") {
        if (typeof onBackRef.current === "function") {
          e.preventDefault();
          onBackRef.current();
        }
      }
    };
    document.addEventListener("keydown", handler);

    const focusEvt = (e) => {
      const target = e.detail?.target;
      if (target instanceof HTMLElement) focusElement(target);
      else focusFirst();
    };
    window.addEventListener("tv-focus", focusEvt);

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", handler);
      window.removeEventListener("tv-focus", focusEvt);
    };
  }, [enabled]);
}
