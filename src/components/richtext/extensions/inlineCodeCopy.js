// Floating "Copier" overlay for inline `<code>`, shared by the editor
// (EditExtras) and the read-only view-mode renderer: desktop hover shows it
// briefly, a mobile tap "arms" it until the next tap. The button is a
// singleton DOM node styled in `globalCSS.js`.

import { t } from "../../../i18n";
import {
  TAP_MOVE_PX,
  closestInlineCode,
  eventElement,
  hasCoarsePointer,
  isInsideCopyButton,
} from "./editTargets.js";

// Lifetime of the floating "Copier" overlay after it appears on hover.
// The button stays visible this long total (timer restarted whenever
// the user hovers another inline `<code>` or re-enters the button),
// giving the user enough time to reach and click it without having to
// keep the cursor on the underlying inline code.
const INLINE_COPY_VISIBLE_MS = 500;
let inlineCopyEl = null;
let inlineCopyTarget = null;
let inlineCopyHideTimer = null;
// Mobile arms the inline-code button via a tap; it stays visible
// (sticky) until the user taps elsewhere or taps the same code again.
// Desktop hover shows it briefly and hides on mouseout.
let inlineCopySticky = false;
function getInlineCopyEl(host) {
  // Lazy-create the singleton button. The element is re-used across
  // shows; only its host (the editor's scroll container) may change.
  if (!inlineCopyEl || !inlineCopyEl.isConnected) {
    inlineCopyEl = document.createElement("button");
    inlineCopyEl.type = "button";
    // Share .code-copy-btn with the code-block button so font/colors/
    // padding/shadow are guaranteed identical; .rt-inline-code-copy
    // contributes only positioning + show/hide.
    inlineCopyEl.className = "rt-inline-code-copy code-copy-btn";
    inlineCopyEl.setAttribute("data-copy-btn", "1");
    inlineCopyEl.textContent = t("copy");
    inlineCopyEl.addEventListener("mousedown", (e) => e.preventDefault());
    inlineCopyEl.addEventListener("mouseenter", () => {
      if (inlineCopyHideTimer) {
        clearTimeout(inlineCopyHideTimer);
        inlineCopyHideTimer = null;
      }
    });
    inlineCopyEl.addEventListener("mouseleave", () => {
      if (!inlineCopySticky) scheduleInlineCopyHide();
    });
    inlineCopyEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!inlineCopyTarget) return;
      const text = inlineCopyTarget.textContent || "";
      try {
        navigator.clipboard?.writeText(text);
      } catch { /* clipboard blocked: the label still confirms the tap */ }
      const old = t("copy");
      inlineCopyEl.textContent = t("copied");
      clearTimeout(inlineCopyEl._gkResetTimer);
      inlineCopyEl._gkResetTimer = setTimeout(() => {
        inlineCopyEl.textContent = old;
      }, 1200);
    });
  }
  // Attach (or re-attach) to the right host so the button lives in
  // the editor's scroll context and rides the scroll naturally.
  const target = host || document.body;
  if (inlineCopyEl.parentElement !== target) {
    target.appendChild(inlineCopyEl);
  }
  return inlineCopyEl;
}
function positionInlineCopyForCurrent() {
  const code = inlineCopyTarget;
  const el = inlineCopyEl;
  if (!code || !el || !el.isConnected) return;
  const host = el.parentElement;
  if (!host) return;
  // Anchor the button right after the visual END of the inline code,
  // vertically centered on the line that contains its last fragment.
  // `getClientRects()` returns one rect per line for inline content,
  // so the last rect is the line where the code ends.
  const rects = code.getClientRects();
  const lastRect = rects[rects.length - 1];
  if (!lastRect) return;
  const btnR = el.getBoundingClientRect();
  // Convert viewport-relative rects into the host's scrolled
  // content-coordinate space so the button sits inside the editor's
  // own layer. Once placed, the scroll container drags the button
  // along with the rest of the content, no scroll listener needed.
  const hostRect = host.getBoundingClientRect();
  const GAP = 4;
  const preferredLeft =
    lastRect.right - hostRect.left + host.scrollLeft + GAP;
  // Fall back to the line below when the right-of-line slot would push
  // the button past the host's visible right edge, typical of an
  // inline code that ends flush with the viewport on narrow mobile
  // widths. The button gets clamped to stay inside the host and a
  // spacer is dropped after the code's block ancestor so the next
  // paragraph / list item moves out of the way instead of being
  // overlapped.
  const innerRight = host.clientWidth;
  const overflowsRight = preferredLeft + btnR.width + GAP > innerRight;
  let top;
  let left;
  if (overflowsRight) {
    top = lastRect.bottom - hostRect.top + host.scrollTop + GAP;
    const desiredRight = Math.min(
      lastRect.right - hostRect.left + host.scrollLeft,
      innerRight - GAP,
    );
    left = Math.max(GAP, desiredRight - btnR.width);
    applyBelowSpacerFor(code, btnR.height + GAP * 2);
  } else {
    top =
      lastRect.top - hostRect.top + host.scrollTop +
      (lastRect.height - btnR.height) / 2;
    left = preferredLeft;
    clearBelowSpacer();
  }
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}

// Push-down spacer used by positionInlineCopyForCurrent when the
// button can't fit beside the inline code and has to drop to the line
// below. Inserting a block-level placeholder after the code's nearest
// block ancestor reserves the vertical room the button now occupies
// so the following content moves down instead of being covered.
let belowSpacerEl = null;
function findBlockAncestor(node) {
  let cur = node?.parentElement;
  while (cur) {
    let display;
    try {
      display = window.getComputedStyle(cur).display;
    } catch {
      display = "";
    }
    if (display && display !== "inline" && display !== "contents") return cur;
    cur = cur.parentElement;
  }
  return null;
}
function applyBelowSpacerFor(codeEl, height) {
  const block = findBlockAncestor(codeEl);
  if (!block || !block.parentNode) return;
  if (!belowSpacerEl) {
    belowSpacerEl = document.createElement("div");
    belowSpacerEl.className = "rt-inline-code-copy-spacer";
    belowSpacerEl.setAttribute("aria-hidden", "true");
    belowSpacerEl.style.pointerEvents = "none";
    belowSpacerEl.style.margin = "0";
    belowSpacerEl.style.padding = "0";
  }
  belowSpacerEl.style.height = `${height}px`;
  if (
    belowSpacerEl.parentNode !== block.parentNode ||
    belowSpacerEl.previousSibling !== block
  ) {
    block.parentNode.insertBefore(belowSpacerEl, block.nextSibling);
  }
}
function clearBelowSpacer() {
  if (belowSpacerEl && belowSpacerEl.parentNode) {
    belowSpacerEl.parentNode.removeChild(belowSpacerEl);
  }
}
// While the content is actively scrolling, the cursor stays put on screen
// and inline `<code>` elements sweep under it: the browser fires a burst
// of `mouseover`s, each of which would pop + reposition the copy overlay
// (getClientRects/getBoundingClientRect + DOM writes). On a note with lots
// of inline code that thrashes layout and janks the scroll. We suppress
// hover-triggered overlays for a short window after any scroll; a real
// pointer hover (once scrolling settles) still works.
let inlineCopyScrollSuppressUntil = 0;
let inlineCopyScrollHooked = false;
function hookInlineCopyScrollSuppression() {
  if (inlineCopyScrollHooked || typeof document === "undefined") return;
  inlineCopyScrollHooked = true;
  // Capture so it catches scrolls from any scroll container (the note
  // modal scrolls an inner element, not the window).
  document.addEventListener(
    "scroll",
    () => { inlineCopyScrollSuppressUntil = performance.now() + 150; },
    true,
  );
}

export function showInlineCopyFor(codeEl, { sticky = false } = {}) {
  hookInlineCopyScrollSuppression();
  // Hover overlays caused by content scrolling under a stationary cursor
  // are skipped; explicit taps (sticky) always show.
  if (!sticky && performance.now() < inlineCopyScrollSuppressUntil) return;
  inlineCopyTarget = codeEl;
  inlineCopySticky = sticky;
  if (inlineCopyHideTimer) {
    clearTimeout(inlineCopyHideTimer);
    inlineCopyHideTimer = null;
  }
  // Host the button inside the same scroll container as the code:
  // .modal-scroll-themed when we're in a note modal, otherwise fall
  // back to body. The button is position:absolute inside this host,
  // so it scrolls with the content and is clipped by the host's
  // overflow when the inline `<code>` leaves the visible area.
  const host = codeEl.closest(".modal-scroll-themed") || document.body;
  const el = getInlineCopyEl(host);
  // Propagate the modal's note-colour CSS vars to the portaled button
  // so the gradient matches the surrounding modal instead of falling
  // back to #111.
  const ancestor = codeEl.closest(".rt-editor") || codeEl;
  try {
    const cs = window.getComputedStyle(ancestor);
    const nc = cs.getPropertyValue("--note-color");
    const nco = cs.getPropertyValue("--note-color-opaque");
    if (nc && nc.trim()) el.style.setProperty("--note-color", nc.trim());
    if (nco && nco.trim())
      el.style.setProperty("--note-color-opaque", nco.trim());
  } catch { /* styles unreadable: the button keeps its default colours */ }
  el.textContent = t("copy");
  el.classList.add("rt-inline-code-copy--visible");
  el.classList.toggle("rt-inline-code-copy--sticky", sticky);
  // Defer positioning to next frame so the just-shown element has
  // measurable dimensions. After this one placement, the button
  // rides the scroll container natively: its position:absolute
  // coords are relative to the scrolled content, not the viewport.
  requestAnimationFrame(positionInlineCopyForCurrent);
  // The hide timer is NOT started here: it fires only when the cursor
  // leaves the inline code (mouseout) or the button (mouseleave).
  // Sticky (mobile tap) is dismissed by an explicit outside tap.
}
export function scheduleInlineCopyHide() {
  if (inlineCopySticky) return;
  if (inlineCopyHideTimer) clearTimeout(inlineCopyHideTimer);
  inlineCopyHideTimer = setTimeout(() => {
    inlineCopyEl?.classList.remove("rt-inline-code-copy--visible");
    inlineCopyEl?.classList.remove("rt-inline-code-copy--sticky");
    inlineCopyTarget = null;
    inlineCopyHideTimer = null;
    clearBelowSpacer();
  }, INLINE_COPY_VISIBLE_MS);
}
function hideInlineCopyImmediate() {
  if (inlineCopyHideTimer) {
    clearTimeout(inlineCopyHideTimer);
    inlineCopyHideTimer = null;
  }
  inlineCopySticky = false;
  inlineCopyEl?.classList.remove("rt-inline-code-copy--visible");
  inlineCopyEl?.classList.remove("rt-inline-code-copy--sticky");
  inlineCopyTarget = null;
  clearBelowSpacer();
}

// Which inline-code element is currently "armed" (showing its copy button
// after a single tap on mobile). EditExtras keeps the code-block one; at
// most one of the two is armed at a time: they're mutually exclusive UX
// states.
let armedInlineCodeEl = null;
// Auto-hide timers (mobile only): the button vanishes after a few
// seconds of inactivity so a stale arm doesn't sit on screen forever.
// Disarming via the timer is a plain clear: it does NOT focus the
// editor or open the keyboard, so the next tap on the same element
// is detected as a "1st tap" again and the cycle restarts cleanly.
let armedInlineCodeHideTimer = null;
export const MOBILE_ARM_AUTO_HIDE_MS = 5000;

export function isArmedInlineCode(el) {
  return armedInlineCodeEl === el;
}
export function isInlineCopyButton(el) {
  return el === inlineCopyEl;
}

export function clearInlineCodeArm() {
  if (armedInlineCodeHideTimer) {
    clearTimeout(armedInlineCodeHideTimer);
    armedInlineCodeHideTimer = null;
  }
  armedInlineCodeEl = null;
  hideInlineCopyImmediate();
}
export function armInlineCode(codeEl) {
  if (armedInlineCodeHideTimer) {
    clearTimeout(armedInlineCodeHideTimer);
    armedInlineCodeHideTimer = null;
  }
  armedInlineCodeEl = codeEl;
  showInlineCopyFor(codeEl, { sticky: true });
  armedInlineCodeHideTimer = setTimeout(() => {
    armedInlineCodeHideTimer = null;
    clearInlineCodeArm();
  }, MOBILE_ARM_AUTO_HIDE_MS);
}

/* -------------------- read-mode inline copy -------------------- */

/* Wire the same inline-code copy affordance onto a non-editor
   container so the read-only renderer behaves identically to the
   editor: desktop hovers reveal the floating "Copier" overlay, mobile
   taps arm it sticky and a second tap (or a tap elsewhere inside the
   container) dismisses it. We reuse the singleton overlay + armed
   state from the editor side, so the visibility timer (2 s),
   positioning, theming and clipboard logic stay in one place, no
   parallel implementation to drift.
   Returns a cleanup function the caller invokes when the view-mode
   container unmounts or the modal closes. */
export function attachReadModeInlineCopy(root) {
  if (!root) return () => {};

  let touchInfo = null;

  const onMouseOver = (event) => {
    if (hasCoarsePointer()) return;
    const code = closestInlineCode(event.target);
    if (code) showInlineCopyFor(code);
  };

  const onMouseOut = (event) => {
    const code = closestInlineCode(event.target);
    if (!code) return;
    const related = event.relatedTarget;
    if (related && (code.contains(related) || related === inlineCopyEl)) return;
    scheduleInlineCopyHide();
  };

  const onTouchStart = (event) => {
    if (!hasCoarsePointer()) return;
    if (event.touches.length !== 1) {
      touchInfo = null;
      return;
    }
    const target = eventElement(event);
    if (isInsideCopyButton(target)) {
      touchInfo = null;
      return;
    }
    const inlineCode = closestInlineCode(target);
    const t0 = event.touches[0];
    touchInfo = {
      inlineCode,
      startX: t0.clientX,
      startY: t0.clientY,
    };
  };

  const onTouchEnd = (event) => {
    if (!touchInfo) return;
    const { inlineCode, startX, startY } = touchInfo;
    touchInfo = null;
    const ct = event.changedTouches && event.changedTouches[0];
    if (ct) {
      const dx = Math.abs(ct.clientX - startX);
      const dy = Math.abs(ct.clientY - startY);
      if (dx > TAP_MOVE_PX || dy > TAP_MOVE_PX) return;
    }
    if (inlineCode) {
      if (armedInlineCodeEl === inlineCode) {
        clearInlineCodeArm();
        return;
      }
      // Block the synthesised click so the tap purely arms the button
      // without bubbling into the modal's link / scrim handlers.
      event.preventDefault();
      armInlineCode(inlineCode);
      return;
    }
    // Tap landed elsewhere inside the rendered container: dismiss any
    // armed inline code so the user gets a clean state back.
    if (armedInlineCodeEl) clearInlineCodeArm();
  };

  const onTouchCancel = () => {
    touchInfo = null;
  };

  root.addEventListener("mouseover", onMouseOver);
  root.addEventListener("mouseout", onMouseOut);
  root.addEventListener("touchstart", onTouchStart, {
    passive: true,
    capture: true,
  });
  root.addEventListener("touchend", onTouchEnd, {
    passive: false,
    capture: true,
  });
  root.addEventListener("touchcancel", onTouchCancel, {
    passive: true,
    capture: true,
  });

  return () => {
    root.removeEventListener("mouseover", onMouseOver);
    root.removeEventListener("mouseout", onMouseOut);
    root.removeEventListener("touchstart", onTouchStart, { capture: true });
    root.removeEventListener("touchend", onTouchEnd, { capture: true });
    root.removeEventListener("touchcancel", onTouchCancel, { capture: true });
    // Drop any state owned by this container so the next mount starts
    // clean and a stale arm doesn't outlive the view-mode session.
    clearInlineCodeArm();
    hideInlineCopyImmediate();
  };
}
