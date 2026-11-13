import { useEffect, useLayoutEffect, useRef } from "react";

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
  // Vertical containment: sidebar and detail viewer prefer their own
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
  let best = scoreBest(cur, pool, current, direction);
  // If the zone-restricted pool yielded nothing (e.g. user is at the
  // top of the sidebar pressing Up — no sidebar candidate higher up),
  // fall back to the full focusable list so the focus can ESCAPE the
  // zone vertically. Otherwise the user would be stuck. The detail
  // viewer covers the screen: nothing behind it is reachable.
  if (!best && pool !== all && curZone !== "detail") {
    best = scoreBest(cur, all, current, direction);
  }
  return best;
}

function scoreBest(cur, pool, current, direction) {
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
// The focus ring follows the focus wherever it comes from: this hook, a
// click, or the WebView moving it between fields on its own.
function markFocused(el) {
  if (lastFocusedRef && lastFocusedRef !== el) {
    lastFocusedRef.removeAttribute("data-tv-focused");
  }
  el.setAttribute("data-tv-focused", "true");
  lastFocusedRef = el;
}
function focusElement(el) {
  if (!el) return;
  if (typeof el.focus === "function") {
    try { el.focus({ preventScroll: false }); }
    catch { el.focus(); }
  }
  markFocused(el);
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

// Asks the hook below (through its "tv-focus" window event) to move the
// D-pad focus onto `target`. Ignored when target isn't an element.
export function requestTvFocus(target) {
  if (target instanceof HTMLElement) {
    window.dispatchEvent(new CustomEvent("tv-focus", { detail: { target } }));
  }
}

// The remote's Back key reaches the page as a history step back (the
// Android app turns the key into it), never as a key press. A marker at
// the bottom of the TV history catches the step that lands below it: the
// screen gets its onBack, which returns whether it had something to
// close, and with nothing left the app is closed as any TV app is. The
// detail viewer and the user menu push their own markers above it and
// handle their own steps.
const ROOT_MARKER = { tvRoot: true };

// A field reached with the remote stays closed: the keyboard only opens
// when OK is pressed on it. A WebView field opens the keyboard by itself
// when it takes the focus, so it is read-only until then, and OK asks the
// Android app to open the keyboard. An app too old to do that keeps the
// fields as they were, or they could never be typed in.
const canOpenKeyboard = () => typeof window.AndroidTheme?.showKeyboard === "function";
const isClosedField = (el) => el?.tagName === "INPUT" && el.dataset.tvKeyboard === "closed";

export default function useSpatialFocus({ enabled, onBack, onEdgeReached, onZoneChange } = {}) {
  const onBackRef = useRef(onBack);
  const onEdgeReachedRef = useRef(onEdgeReached);
  const onZoneChangeRef = useRef(onZoneChange);
  useLayoutEffect(() => {
    onBackRef.current = onBack;
    onEdgeReachedRef.current = onEdgeReached;
    onZoneChangeRef.current = onZoneChange;
  });

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
      if (e.key === "Enter" && isClosedField(active)) {
        e.preventDefault();
        delete active.dataset.tvKeyboard;
        active.readOnly = false;
        // Once the field is editable for the WebView too.
        requestAnimationFrame(() => window.AndroidTheme.showKeyboard());
        return;
      }
      // In a text field the arrows move the caret, except Up and Down in a
      // single-line field, where they have no caret to move: there they go
      // to the next field, as everywhere else.
      const singleLine = active?.tagName === "INPUT";
      const isEditable = active && (
        singleLine || active.tagName === "TEXTAREA" || active.isContentEditable
      );
      const vertical = e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Up" || e.key === "Down";
      if (isEditable && !(singleLine && vertical)) return;

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
    const onFocusIn = (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || !el.matches(FOCUSABLE_SELECTOR)) return;
      markFocused(el);
      if (el.tagName === "INPUT" && canOpenKeyboard()) {
        el.dataset.tvKeyboard = "closed";
        el.readOnly = true;
      }
    };
    document.addEventListener("focusin", onFocusIn);

    const focusEvt = (e) => {
      const target = e.detail?.target;
      if (target instanceof HTMLElement) focusElement(target);
      else focusFirst();
    };
    window.addEventListener("tv-focus", focusEvt);

    if (!window.history.state?.tvRoot) window.history.pushState(ROOT_MARKER, "");
    const onPop = () => {
      // An overlay above the marker was closed: not this screen's Back.
      if (window.history.state?.tvRoot) return;
      const handled = typeof onBackRef.current === "function" && onBackRef.current();
      if (!handled && window.AndroidTheme?.exitApp) {
        window.AndroidTheme.exitApp();
        return;
      }
      window.history.pushState(ROOT_MARKER, "");
    };
    window.addEventListener("popstate", onPop);

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", handler);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("tv-focus", focusEvt);
      window.removeEventListener("popstate", onPop);
    };
  }, [enabled]);
}
