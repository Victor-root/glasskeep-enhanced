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

/* -------------------- Event target normalization -------------------- */

// Touch events fire with a Text node as event.target when the tap
// lands on actual text characters — Text nodes don't expose .closest(),
// so naive helpers like `target.closest(".code-block-wrapper")` would
// silently return null and our "is this a code block?" detection
// failed. That was the root cause of the mobile-code-block-tap bug
// (tapping on the empty padding area of a `<pre>` worked because the
// target was then the Element itself; tapping on actual text didn't).
// Normalize to the nearest Element before any DOM walk.
function asElement(node) {
  if (!node) return null;
  if (node.nodeType === 1) return node; // ELEMENT_NODE
  if (node.nodeType === 3) return node.parentElement; // TEXT_NODE
  return node.parentElement || null;
}

// Compose-aware lookup: walks composedPath() so the helper still works
// if the tap target lives inside a shadow root (none today, but cheap
// safety net). Falls back to event.target normalisation.
function eventElement(event) {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : null;
  if (Array.isArray(path)) {
    for (const item of path) {
      if (item && item.nodeType === 1) return item;
    }
  }
  return asElement(event.target);
}

// 2nd-tap helper: focuses the editor at the user's tap point so the
// OS keyboard opens and the caret lands where they pointed. Called
// synchronously from touchend so the user gesture survives to the
// focus() call. Used by the code-block 2nd-tap branch where the
// NodeView's wrapper/pre/code structure doesn't always cause PM's
// default mousedown handler to focus the contenteditable.
function focusEditorAtClientPoint(view, x, y) {
  try {
    view.focus();
    const found = view.posAtCoords({ left: x, top: y });
    if (found && Number.isFinite(found.pos)) {
      const $pos = view.state.doc.resolve(found.pos);
      view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
    }
  } catch (_e) {}
}

/* -------------------- opt-in tap debug overlay -------------------- */

// Enable with `#dbg-tap` on the URL hash. Shows a small log overlay
// in the top-left corner with each touch-handler decision so we can
// see exactly what's happening on devices where the tap behaviour is
// flaky. No effect when the hash is missing.
function isTapDebugOn() {
  if (typeof window === "undefined") return false;
  try {
    return /(?:^|[#&])dbg-tap(?:=|&|$)/.test(window.location.hash || "");
  } catch (_e) {
    return false;
  }
}
let dbgEl = null;
const dbgLines = [];
function ensureDbgEl() {
  if (!isTapDebugOn()) return null;
  if (dbgEl && dbgEl.isConnected) return dbgEl;
  dbgEl = document.createElement("div");
  dbgEl.style.cssText = [
    "position:fixed",
    "top:4px",
    "left:4px",
    "z-index:99999",
    "background:rgba(0,0,0,0.82)",
    "color:#fff",
    "padding:4px 8px",
    "border-radius:4px",
    "font:11px/1.25 ui-monospace,monospace",
    "max-width:92vw",
    "max-height:40vh",
    "overflow:hidden",
    "white-space:pre",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(dbgEl);
  return dbgEl;
}
function dbg(line) {
  if (!isTapDebugOn()) return;
  const t = new Date().toTimeString().slice(0, 8);
  dbgLines.push(t + " " + line);
  if (dbgLines.length > 10) dbgLines.shift();
  const el = ensureDbgEl();
  if (el) el.textContent = dbgLines.join("\n");
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
// Mobile arms the inline-code button via a tap; it stays visible
// (sticky) until the user taps elsewhere or taps the same code again.
// Desktop hover shows it briefly and hides on mouseout.
let inlineCopySticky = false;
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
    if (!inlineCopySticky) scheduleInlineCopyHide();
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
function positionInlineCopyForCurrent() {
  const code = inlineCopyTarget;
  const el = inlineCopyEl;
  if (!code || !el || !el.isConnected) return;
  // Anchor the button right after the visual END of the inline code,
  // vertically centered on the line that contains its last fragment.
  // `getClientRects()` returns one rect per line for inline content,
  // so the last rect is the line where the code ends — placing the
  // button at `lastRect.right + small offset` puts it directly after
  // the closing letter the way the user asked ("juste après le .sh").
  const rects = code.getClientRects();
  const lastRect = rects[rects.length - 1];
  if (!lastRect) return;
  const btnR = el.getBoundingClientRect();
  let top = lastRect.top + (lastRect.height - btnR.height) / 2;
  let left = lastRect.right + 4;
  if (top < 4) top = 4;
  if (left < 4) left = 4;
  const maxLeft = window.innerWidth - btnR.width - 4;
  if (left > maxLeft) left = maxLeft;
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}
function showInlineCopyFor(codeEl, { sticky = false } = {}) {
  inlineCopyTarget = codeEl;
  inlineCopySticky = sticky;
  if (inlineCopyHideTimer) {
    clearTimeout(inlineCopyHideTimer);
    inlineCopyHideTimer = null;
  }
  const el = getInlineCopyEl();
  // Propagate the modal's note-colour CSS vars to the button. The
  // button is portaled to document.body so it doesn't inherit them
  // naturally — read the computed value off the editor wrapper
  // (which IS inside the themed modal) and apply inline. Without
  // this, the gradient fell back to `#111` and the button looked
  // out of place next to the code-block copy button.
  const ancestor = codeEl.closest(".rt-editor") || codeEl;
  try {
    const cs = window.getComputedStyle(ancestor);
    const nc = cs.getPropertyValue("--note-color");
    const nco = cs.getPropertyValue("--note-color-opaque");
    if (nc && nc.trim()) el.style.setProperty("--note-color", nc.trim());
    if (nco && nco.trim())
      el.style.setProperty("--note-color-opaque", nco.trim());
  } catch (_e) {}
  el.textContent = t("copy");
  el.classList.add("rt-inline-code-copy--visible");
  el.classList.toggle("rt-inline-code-copy--sticky", sticky);
  // Defer positioning to next frame so the just-shown element has
  // measurable dimensions (getBoundingClientRect returns the post-
  // layout rect; before the next frame it might be 0).
  requestAnimationFrame(positionInlineCopyForCurrent);
}
function scheduleInlineCopyHide() {
  if (inlineCopySticky) return;
  if (inlineCopyHideTimer) clearTimeout(inlineCopyHideTimer);
  // Small delay so the user can move the cursor between the code and
  // the floating button without it disappearing under them.
  inlineCopyHideTimer = setTimeout(() => {
    inlineCopyEl?.classList.remove("rt-inline-code-copy--visible");
    inlineCopyEl?.classList.remove("rt-inline-code-copy--sticky");
    inlineCopyTarget = null;
    inlineCopyHideTimer = null;
  }, 180);
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

// All four helpers accept either an Element, a Text node, or anything
// asElement() can normalise. Crucially they must NOT bail out when
// passed a Text node — that was the original bug. asElement() turns
// a Text node into its parentElement so .closest() can do its job.
function closestLink(node) {
  const el = asElement(node);
  if (!el || !el.closest) return null;
  return el.closest("a[href]");
}
function closestInlineCode(node) {
  const el = asElement(node);
  if (!el || !el.closest) return null;
  const code = el.closest("code");
  if (!code) return null;
  if (code.closest("pre")) return null; // fenced block handled by NodeView
  return code;
}
function closestCodeBlockWrapper(node) {
  const el = asElement(node);
  if (!el || !el.closest) return null;
  return el.closest(".code-block-wrapper");
}
function isInsideCopyButton(node) {
  const el = asElement(node);
  if (!el || !el.closest) return false;
  return !!el.closest("[data-copy-btn='1']");
}

/* -------------------- mobile-armed state -------------------- */

// Which code-block wrapper / inline-code element is currently "armed"
// (showing its copy button after a single tap on mobile). At most one
// is armed at a time — they're mutually exclusive UX states.
let armedCodeBlockEl = null;
let armedInlineCodeEl = null;

function clearCodeBlockArm() {
  if (armedCodeBlockEl) {
    armedCodeBlockEl.removeAttribute("data-armed");
  }
  armedCodeBlockEl = null;
}
function armCodeBlock(wrapper) {
  if (armedCodeBlockEl && armedCodeBlockEl !== wrapper) {
    armedCodeBlockEl.removeAttribute("data-armed");
  }
  armedCodeBlockEl = wrapper;
  wrapper.setAttribute("data-armed", "true");
  ensureScrollReflowListener();
}
function clearInlineCodeArm() {
  armedInlineCodeEl = null;
  hideInlineCopyImmediate();
}
function armInlineCode(codeEl) {
  armedInlineCodeEl = codeEl;
  showInlineCopyFor(codeEl, { sticky: true });
  ensureScrollReflowListener();
}

// Global capture-phase scroll listener that re-positions the sticky
// inline-code button to follow its anchor as the user scrolls. The
// code-block button has its own per-node scroll listener inside the
// NodeView (see CodeBlockCopy.js). We register lazily on first arm
// and never tear down — handlers are cheap (single rect read) and
// the singletons live for the page lifetime.
let scrollReflowRegistered = false;
function ensureScrollReflowListener() {
  if (scrollReflowRegistered) return;
  scrollReflowRegistered = true;
  const handler = () => {
    if (armedInlineCodeEl) positionInlineCopyForCurrent();
  };
  document.addEventListener("scroll", handler, { passive: true, capture: true });
  window.addEventListener("resize", handler, { passive: true });
}

/* -------------------- the plugin -------------------- */

// Tap-vs-scroll threshold. Generous on purpose — Android WebViews
// fire spurious low-amplitude touchmove events during a deliberate
// tap, and the `<pre>` element's `overflow-x: auto` makes the
// WebView's tap detection extra noisy on code blocks. We measure
// purely from touchstart to touchend (not from intermediate
// touchmove) so jitter during the press doesn't poison the tap.
const TAP_MOVE_PX = 24;
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
          // Coordination flag for the mousedown fallback below. The
          // touch handlers set this whenever they handle a tap so the
          // synthesised mousedown that follows doesn't try to re-arm
          // (or re-disarm) the same target. Cleared after a tap
          // guard window passes.
          let touchPathHandledRecently = false;
          let touchPathHandledTimer = null;
          const markTouchHandled = () => {
            touchPathHandledRecently = true;
            if (touchPathHandledTimer) clearTimeout(touchPathHandledTimer);
            touchPathHandledTimer = setTimeout(() => {
              touchPathHandledRecently = false;
            }, TAP_GUARD_MS);
          };

          // Helper that swallows the synthesised mouse events the
          // browser fires after a tap, used by all three "tap-arms"
          // flows (link popover, code-block arm, inline-code arm).
          const blurEditorIfFocused = () => {
            const ae = document.activeElement;
            if (ae && (ae === dom || dom.contains(ae))) {
              try {
                ae.blur();
              } catch (_e) {}
            }
          };
          const armSyntheticGuard = () => {
            if (pendingTapTimer) clearTimeout(pendingTapTimer);
            pendingTap = true;
            pendingTapTimer = setTimeout(clearPending, TAP_GUARD_MS);
          };

          const onTouchStart = (event) => {
            if (!isEditExtrasOn(editorView)) {
              dbg("touchstart skip: extras off");
              return;
            }
            if (!hasCoarsePointer()) return;
            if (event.touches.length === 1) {
              clearPending();
            } else {
              touchInfo = null;
              return;
            }
            if (isInsideCopyButton(event.target)) {
              dbg("touchstart on copy-btn -> skip");
              touchInfo = null;
              return;
            }
            // Normalise event.target to its nearest Element. Touching
            // on actual text characters fires with a Text node as
            // target on Android WebView, Pixel emulator, iOS Safari —
            // .closest() doesn't exist on text nodes, so detection
            // would silently fail without this step.
            const target = eventElement(event);
            const link = closestLink(target);
            const inlineCode = link ? null : closestInlineCode(target);
            const codeBlock = link || inlineCode
              ? null
              : closestCodeBlockWrapper(target);
            const t0 = event.touches[0];
            touchInfo = {
              link,
              inlineCode,
              codeBlock,
              href: link ? link.getAttribute("href") : null,
              startX: t0.clientX,
              startY: t0.clientY,
            };
            const origNt = event.target?.nodeType ?? "?";
            const normTag = target?.tagName || "?";
            dbg(
              "touchstart nt=" + origNt + " tag=" + normTag +
              " link=" + (link ? "Y" : "-") +
              " inline=" + (inlineCode ? "Y" : "-") +
              " block=" + (codeBlock ? "Y" : "-"),
            );
          };

          // No touchmove handler: we decide tap vs scroll purely from
          // the start↔end touch distance in onTouchEnd (see comment
          // there). Tracking touchmove was too noisy on scrollable
          // `<pre>` elements and made first-tap arming flake out.

          const onTouchEnd = (event) => {
            if (!touchInfo) {
              dbg("touchend no touchInfo");
              return;
            }
            const { link, href, inlineCode, codeBlock, startX, startY } =
              touchInfo;
            touchInfo = null;
            const ct = event.changedTouches && event.changedTouches[0];
            if (ct) {
              const dx = Math.abs(ct.clientX - startX);
              const dy = Math.abs(ct.clientY - startY);
              if (dx > TAP_MOVE_PX || dy > TAP_MOVE_PX) {
                dbg("touchend SCROLL dx=" + dx + " dy=" + dy);
                return;
              }
            }

            if (link && href) {
              dbg("touchend LINK -> popover");
              event.preventDefault();
              blurEditorIfFocused();
              clearCodeBlockArm();
              clearInlineCodeArm();
              armSyntheticGuard();
              markTouchHandled();
              showLinkPopover(link, href, editorView);
              return;
            }

            if (codeBlock) {
              if (armedCodeBlockEl === codeBlock) {
                dbg("touchend BLOCK 2nd -> release+focus");
                clearCodeBlockArm();
                clearInlineCodeArm();
                // Release the synthetic-event guard so PM's mousedown
                // can focus normally; mark touch as handled so the
                // mousedown fallback doesn't see "wrapper no longer
                // armed" and immediately re-arm.
                clearPending();
                markTouchHandled();
                // The NodeView's wrapper/pre/code structure means PM's
                // default mousedown handling doesn't always restore
                // focus to the contenteditable (the OS keyboard then
                // stays hidden). Place the caret and call focus()
                // explicitly here, inside the user-gesture touchend,
                // so Android / iOS open the keyboard reliably.
                const ct2 = event.changedTouches && event.changedTouches[0];
                if (ct2) {
                  focusEditorAtClientPoint(
                    editorView,
                    ct2.clientX,
                    ct2.clientY,
                  );
                }
                return;
              }
              dbg("touchend BLOCK 1st -> arm");
              event.preventDefault();
              blurEditorIfFocused();
              clearInlineCodeArm();
              armCodeBlock(codeBlock);
              armSyntheticGuard();
              markTouchHandled();
              return;
            }

            if (inlineCode) {
              if (armedInlineCodeEl === inlineCode) {
                dbg("touchend INLINE 2nd -> release+focus");
                clearInlineCodeArm();
                clearCodeBlockArm();
                clearPending();
                markTouchHandled();
                return;
              }
              dbg("touchend INLINE 1st -> arm");
              event.preventDefault();
              blurEditorIfFocused();
              clearCodeBlockArm();
              armInlineCode(inlineCode);
              armSyntheticGuard();
              markTouchHandled();
              return;
            }

            dbg("touchend TEXT -> nothing");
            markTouchHandled();
            clearCodeBlockArm();
            clearInlineCodeArm();
          };

          const onTouchCancel = () => {
            touchInfo = null;
          };

          // Safety net + fallback. Two roles:
          //
          // 1. When the touch path armed correctly, the synthesised
          //    mousedown / click events the browser fires from the
          //    tap must NOT focus the contenteditable (which would
          //    pop the OS keyboard up). `pendingTap` flags that
          //    state and we preventDefault the synthesised events.
          //
          // 2. Some Android WebViews emit touchend with
          //    `preventDefault` already silently passive-ignored, so
          //    the synthesised mousedown still arrives without our
          //    touch-path having armed anything. In that case we arm
          //    here as a fallback. `touchPathHandledRecently` lets
          //    us tell the two cases apart so we don't double-arm
          //    after a successful touch path nor re-arm a wrapper
          //    the user just disarmed by tapping twice.
          //
          // Exception: tapping the in-block copy button (which lives
          // inside the editor DOM via the CodeBlockCopy NodeView)
          // must still copy — neither role 1 nor role 2 should
          // swallow its click.
          const tryArmFromMouseDown = (event) => {
            if (!hasCoarsePointer()) return false;
            if (touchPathHandledRecently) return false;
            const target = eventElement(event);
            if (isInsideCopyButton(target)) return false;
            if (closestLink(target)) return false;
            const wrapper = closestCodeBlockWrapper(target);
            if (wrapper) {
              if (armedCodeBlockEl === wrapper) {
                dbg("mousedown BLOCK 2nd -> release+focus");
                clearCodeBlockArm();
                markTouchHandled();
                return true;
              }
              dbg("mousedown BLOCK 1st -> arm");
              event.preventDefault();
              event.stopPropagation();
              blurEditorIfFocused();
              clearInlineCodeArm();
              armCodeBlock(wrapper);
              armSyntheticGuard();
              markTouchHandled();
              return true;
            }
            const inlineCode = closestInlineCode(target);
            if (inlineCode) {
              if (armedInlineCodeEl === inlineCode) {
                dbg("mousedown INLINE 2nd -> release+focus");
                clearInlineCodeArm();
                markTouchHandled();
                return true;
              }
              dbg("mousedown INLINE 1st -> arm");
              event.preventDefault();
              event.stopPropagation();
              blurEditorIfFocused();
              clearCodeBlockArm();
              armInlineCode(inlineCode);
              armSyntheticGuard();
              markTouchHandled();
              return true;
            }
            return false;
          };
          const onMouseDownCapture = (event) => {
            if (pendingTap) {
              if (isInsideCopyButton(event.target)) return;
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            tryArmFromMouseDown(event);
          };
          const onClickCapture = (event) => {
            if (!pendingTap) return;
            if (isInsideCopyButton(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
          };

          // We deliberately do NOT listen to the editor's focus event
          // anymore. The previous focus-fallback was a workaround for
          // the symptom of the real bug — event.target being a Text
          // node — and it had the side-effect of re-arming the block
          // after the 2nd tap's release branch had just disarmed it,
          // which is why the keyboard never opened. With the
          // asElement() / eventElement() normalisation above, the
          // touchend path detects the code block reliably on a single
          // quick tap, making the focus fallback unnecessary.

          dom.addEventListener("touchstart", onTouchStart, {
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
              if (touchPathHandledTimer) clearTimeout(touchPathHandledTimer);
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
