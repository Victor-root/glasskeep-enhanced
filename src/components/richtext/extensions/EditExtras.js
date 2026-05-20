// Edit-mode-only affordances that the read-only view-mode already
// provided users with the "Read mode for notes" preference turned ON:
//
//   - Floating "Copier" overlay on inline `<code>` hover (desktop).
//   - Link tooltip on hover that says "Ctrl+Click to open".
//   - Ctrl/Cmd+Click and middle-click on a link open it in a new tab.
//   - Touch tap on a link shows a small popover with Open / Edit
//     instead of letting the OS keyboard pop up — the user can then
//     either visit the link or explicitly choose to edit it (which
//     focuses the editor at the link and lets the keyboard appear).
//
// All of this only activates when the editor wrapper exposes
// `data-edit-extras="on"` (set by `RichTextEditor.jsx` based on the
// user's read-mode preference). With it off — the case for users who
// rely on the read-only view-mode — the plugin's event handlers
// no-op and PM keeps its default editor behaviour.
//
// Tooltip / popover / inline-copy overlay are singleton DOM nodes
// portaled into `document.body` and styled in `globalCSS.js`.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { t } from "../../../i18n";

const EDIT_EXTRAS_ATTR = "data-edit-extras";

function isEditExtrasOn(view) {
  return view?.dom?.getAttribute(EDIT_EXTRAS_ATTR) === "on";
}

// Best-effort isMobile / coarse-pointer detection. We only use it to
// decide between the desktop hover affordances (tooltip + inline-copy
// overlay) and the mobile tap popover — if the heuristic is wrong, the
// worst case is a popover appears on a desktop with a touch screen,
// which is still a usable UX.
function hasCoarsePointer() {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.("(pointer: coarse)").matches || false;
  } catch (_e) {
    return false;
  }
}

function ensureSchemeURL(raw) {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/^(https?|mailto|tel):/i.test(v)) return v;
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(v)) return `mailto:${v}`;
  return `https://${v}`;
}

/* -------------------- singleton overlays -------------------- */

let tooltipEl = null;
function getTooltipEl() {
  if (tooltipEl && tooltipEl.isConnected) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "rt-link-tooltip";
  tooltipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}
function showTooltip(target, label) {
  const el = getTooltipEl();
  el.textContent = label;
  const r = target.getBoundingClientRect();
  // Position above the link; flip below if there's no room.
  el.style.visibility = "hidden";
  el.classList.add("rt-link-tooltip--visible");
  const tipR = el.getBoundingClientRect();
  let top = r.top - tipR.height - 6;
  let left = r.left + r.width / 2 - tipR.width / 2;
  if (top < 4) top = r.bottom + 6;
  // Keep within viewport horizontally.
  const maxLeft = window.innerWidth - tipR.width - 4;
  if (left < 4) left = 4;
  else if (left > maxLeft) left = maxLeft;
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
  el.style.visibility = "";
}
function hideTooltip() {
  tooltipEl?.classList.remove("rt-link-tooltip--visible");
}

let inlineCopyEl = null;
let inlineCopyTarget = null;
let inlineCopyHideTimer = null;
function getInlineCopyEl() {
  if (inlineCopyEl && inlineCopyEl.isConnected) return inlineCopyEl;
  inlineCopyEl = document.createElement("button");
  inlineCopyEl.type = "button";
  inlineCopyEl.className = "rt-inline-code-copy";
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
    scheduleInlineCopyHide();
  });
  inlineCopyEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inlineCopyTarget) return;
    const text = inlineCopyTarget.textContent || "";
    try {
      navigator.clipboard?.writeText(text);
    } catch (_e) {}
    const old = t("copy");
    inlineCopyEl.textContent = t("copied");
    clearTimeout(inlineCopyEl._gkResetTimer);
    inlineCopyEl._gkResetTimer = setTimeout(() => {
      inlineCopyEl.textContent = old;
    }, 1200);
  });
  document.body.appendChild(inlineCopyEl);
  return inlineCopyEl;
}
function showInlineCopyFor(codeEl) {
  inlineCopyTarget = codeEl;
  if (inlineCopyHideTimer) {
    clearTimeout(inlineCopyHideTimer);
    inlineCopyHideTimer = null;
  }
  const el = getInlineCopyEl();
  el.textContent = t("copy");
  const r = codeEl.getBoundingClientRect();
  el.classList.add("rt-inline-code-copy--visible");
  const btnR = el.getBoundingClientRect();
  let top = r.top - btnR.height - 4;
  let left = r.right - btnR.width;
  if (top < 4) top = r.bottom + 4;
  if (left < 4) left = 4;
  const maxLeft = window.innerWidth - btnR.width - 4;
  if (left > maxLeft) left = maxLeft;
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}
function scheduleInlineCopyHide() {
  if (inlineCopyHideTimer) clearTimeout(inlineCopyHideTimer);
  // Small delay so the user can move the cursor between the code and
  // the floating button without it disappearing under them.
  inlineCopyHideTimer = setTimeout(() => {
    inlineCopyEl?.classList.remove("rt-inline-code-copy--visible");
    inlineCopyTarget = null;
    inlineCopyHideTimer = null;
  }, 180);
}

let linkPopoverEl = null;
let linkPopoverDismiss = null;
function getLinkPopoverEl() {
  if (linkPopoverEl && linkPopoverEl.isConnected) return linkPopoverEl;
  linkPopoverEl = document.createElement("div");
  linkPopoverEl.className = "rt-link-popover";
  linkPopoverEl.setAttribute("role", "dialog");
  document.body.appendChild(linkPopoverEl);
  return linkPopoverEl;
}
function hideLinkPopover() {
  if (!linkPopoverEl) return;
  linkPopoverEl.classList.remove("rt-link-popover--visible");
  if (linkPopoverDismiss) {
    document.removeEventListener("pointerdown", linkPopoverDismiss, true);
    linkPopoverDismiss = null;
  }
}
function showLinkPopover(anchor, href, view) {
  const el = getLinkPopoverEl();
  el.innerHTML = "";

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "rt-link-popover__btn";
  openBtn.textContent = t("openLink");
  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = ensureSchemeURL(href);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    hideLinkPopover();
  });

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "rt-link-popover__btn rt-link-popover__btn--secondary";
  editBtn.textContent = t("editLink");
  editBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideLinkPopover();
    // Focus FIRST (synchronously, inside the user-initiated click
    // handler) so iOS Safari accepts it as a user gesture and shows
    // the keyboard. Then place the caret inside the link. Reversing
    // the order works on Android but iOS sometimes refuses to show
    // the keyboard if the focus call isn't the first thing.
    try {
      view.focus();
      const pos = view.posAtDOM(anchor, 0);
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
      );
    } catch (_e) {
      view.focus();
    }
  });

  el.appendChild(openBtn);
  el.appendChild(editBtn);

  const r = anchor.getBoundingClientRect();
  el.classList.add("rt-link-popover--visible");
  const pR = el.getBoundingClientRect();
  let top = r.top - pR.height - 8;
  let left = r.left + r.width / 2 - pR.width / 2;
  if (top < 8) top = r.bottom + 8;
  if (left < 8) left = 8;
  const maxLeft = window.innerWidth - pR.width - 8;
  if (left > maxLeft) left = maxLeft;
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;

  // Dismiss on any pointer activity outside the popover (capture phase
  // so it runs before any inner handler).
  linkPopoverDismiss = (evt) => {
    if (el.contains(evt.target)) return;
    hideLinkPopover();
  };
  // Defer so the synthetic tap that opened the popover doesn't itself
  // dismiss it on the same tick.
  setTimeout(() => {
    document.addEventListener("pointerdown", linkPopoverDismiss, true);
  }, 0);
}

/* -------------------- shared helpers -------------------- */

function closestLink(el) {
  if (!el) return null;
  // Walk to the nearest anchor — avoids missing the link if the user
  // hovered a `<strong>` inside the link, etc.
  return el.closest && el.closest("a[href]");
}
function closestInlineCode(el) {
  if (!el || !el.closest) return null;
  const code = el.closest("code");
  if (!code) return null;
  if (code.closest("pre")) return null; // fenced block handled by NodeView
  return code;
}

/* -------------------- the plugin -------------------- */

// Tap-vs-scroll threshold. Smaller than the default OS recogniser so a
// tap on a thin inline link still feels responsive, but large enough
// that a deliberate flick doesn't trigger the popover.
const TAP_MOVE_PX = 10;
// How long the post-tap synthesised mouse-events suppression stays
// armed. iOS / some Android WebViews can take a few hundred ms to
// fire the synthesised `mousedown` after `touchend`, so we keep the
// guard wider than the worst case we've seen.
const TAP_GUARD_MS = 700;

export const EditExtras = Extension.create({
  name: "editExtras",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("editExtras"),
        // Manage touch handlers via the plugin view so we can register
        // them with `passive: false` + `capture: true`. PM's own
        // `handleDOMEvents` registration can default to passive on
        // touch events depending on browser, which would silently
        // ignore our preventDefault and let the OS keyboard pop up
        // on link tap.
        view(editorView) {
          const dom = editorView.dom;

          // Touch lifecycle state. We only show the popover on a
          // confirmed *tap* (touchend without scroll). Anything that
          // becomes a scroll is left alone so the page still scrolls.
          let touchInfo = null;
          // After a confirmed link tap, mouse events that the OS
          // synthesises from the touch must NOT focus the editor.
          // `pendingTap` keeps the guard armed for the worst-case
          // delay between touchend and the synthesised mousedown.
          let pendingTap = null;
          let pendingTapTimer = null;
          const clearPending = () => {
            pendingTap = null;
            if (pendingTapTimer) {
              clearTimeout(pendingTapTimer);
              pendingTapTimer = null;
            }
          };

          const onTouchStart = (event) => {
            if (!isEditExtrasOn(editorView)) return;
            if (!hasCoarsePointer()) return;
            // Fresh single-finger touch — reset any stale tap-guard
            // from a previous link tap so the user can resume normal
            // editor interaction by tapping anywhere outside a link.
            if (event.touches.length === 1) {
              clearPending();
            } else {
              touchInfo = null;
              return;
            }
            const link = closestLink(event.target);
            if (!link) {
              touchInfo = null;
              return;
            }
            const href = link.getAttribute("href");
            if (!href) {
              touchInfo = null;
              return;
            }
            const t = event.touches[0];
            touchInfo = {
              link,
              href,
              startX: t.clientX,
              startY: t.clientY,
              moved: false,
            };
          };

          const onTouchMove = (event) => {
            if (!touchInfo) return;
            const t = event.touches[0];
            if (!t) return;
            const dx = Math.abs(t.clientX - touchInfo.startX);
            const dy = Math.abs(t.clientY - touchInfo.startY);
            if (dx > TAP_MOVE_PX || dy > TAP_MOVE_PX) {
              touchInfo.moved = true;
            }
          };

          const onTouchEnd = (event) => {
            if (!touchInfo) return;
            const { link, href, moved } = touchInfo;
            touchInfo = null;
            if (moved) {
              // The touch became a scroll, not a tap. Let the
              // synthesised mouse events run normally — the user
              // didn't ask for the popover.
              return;
            }
            // Real tap on a link.
            // 1. `preventDefault` on touchend is honoured by most
            //    modern browsers and suppresses the synthesised mouse
            //    events. The capture-phase mousedown/click guards
            //    below are the safety net for the few that don't.
            event.preventDefault();
            // 2. If the editor was already focused, blur it so the
            //    OS keyboard goes away. Without this, tapping a link
            //    while the keyboard is up would leave it up.
            const ae = document.activeElement;
            if (ae && (ae === dom || dom.contains(ae))) {
              try {
                ae.blur();
              } catch (_e) {}
            }
            // 3. Arm the synthesised-mouse-event guard before showing
            //    the popover, so any straggling mousedown/click is
            //    caught by the capture handlers below.
            pendingTap = { link, href };
            if (pendingTapTimer) clearTimeout(pendingTapTimer);
            pendingTapTimer = setTimeout(clearPending, TAP_GUARD_MS);
            // 4. Show the popover. The dismiss listener installed
            //    inside `showLinkPopover` uses pointerdown on
            //    document, so a tap outside the popover closes it
            //    (and a tap on Open / Edit fires those handlers
            //    first because of pointerdown -> click ordering).
            showLinkPopover(link, href, editorView);
          };

          const onTouchCancel = () => {
            touchInfo = null;
          };

          // Safety net: even with touchend.preventDefault, some
          // mobile browsers still synthesise mousedown / click for
          // taps on links. Block those during the guard window so
          // they can't focus the contenteditable.
          const onMouseDownCapture = (event) => {
            if (!pendingTap) return;
            event.preventDefault();
            event.stopPropagation();
          };
          const onClickCapture = (event) => {
            if (!pendingTap) return;
            event.preventDefault();
            event.stopPropagation();
          };

          dom.addEventListener("touchstart", onTouchStart, {
            passive: true,
            capture: true,
          });
          dom.addEventListener("touchmove", onTouchMove, {
            passive: true,
            capture: true,
          });
          dom.addEventListener("touchend", onTouchEnd, {
            passive: false,
            capture: true,
          });
          dom.addEventListener("touchcancel", onTouchCancel, {
            passive: true,
            capture: true,
          });
          dom.addEventListener("mousedown", onMouseDownCapture, {
            capture: true,
          });
          dom.addEventListener("click", onClickCapture, { capture: true });

          return {
            destroy() {
              dom.removeEventListener("touchstart", onTouchStart, {
                capture: true,
              });
              dom.removeEventListener("touchmove", onTouchMove, {
                capture: true,
              });
              dom.removeEventListener("touchend", onTouchEnd, {
                capture: true,
              });
              dom.removeEventListener("touchcancel", onTouchCancel, {
                capture: true,
              });
              dom.removeEventListener("mousedown", onMouseDownCapture, {
                capture: true,
              });
              dom.removeEventListener("click", onClickCapture, {
                capture: true,
              });
              clearPending();
            },
          };
        },
        props: {
          handleDOMEvents: {
            mouseover: (view, event) => {
              if (!isEditExtrasOn(view)) return false;
              // Skip hover affordances on coarse pointers — touch
              // devices fire fake mouseover events right after a tap,
              // and "Ctrl+Click to open" is meaningless on mobile.
              if (hasCoarsePointer()) return false;
              const link = closestLink(event.target);
              if (link) {
                showTooltip(link, t("openLinkHint"));
                return false;
              }
              const code = closestInlineCode(event.target);
              if (code) {
                showInlineCopyFor(code);
                return false;
              }
              return false;
            },
            mouseout: (view, event) => {
              if (!isEditExtrasOn(view)) return false;
              const link = closestLink(event.target);
              if (link) {
                const related = event.relatedTarget;
                if (!related || !link.contains(related)) hideTooltip();
              }
              const code = closestInlineCode(event.target);
              if (code) {
                const related = event.relatedTarget;
                if (related && (code.contains(related) || related === inlineCopyEl)) return false;
                scheduleInlineCopyHide();
              }
              return false;
            },
            mousedown: (view, event) => {
              if (!isEditExtrasOn(view)) return false;
              // Synthesised-from-touch mousedown carries button 0 +
              // no modifier keys, so neither branch below ever fires
              // for a mobile link tap. The capture-phase guard above
              // is what prevents focus on mobile.
              const link = closestLink(event.target);
              if (!link) return false;
              const href = link.getAttribute("href");
              if (!href) return false;
              // Middle-click → open in a new tab.
              if (event.button === 1) {
                event.preventDefault();
                window.open(ensureSchemeURL(href), "_blank", "noopener,noreferrer");
                return true;
              }
              // Ctrl/Cmd-click → open in a new tab. We catch it on
              // mousedown because PM eats the click event for caret
              // placement and the auxclick semantics differ across
              // browsers.
              if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                window.open(ensureSchemeURL(href), "_blank", "noopener,noreferrer");
                return true;
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});

export default EditExtras;
