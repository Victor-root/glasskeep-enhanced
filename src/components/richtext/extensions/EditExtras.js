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
//   - Touch tap on a code block / inline code arms a "Copier" button
//     on the first tap (no keyboard) and focuses the editor on the
//     second tap of the same target (keyboard + edit).
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
import { attachPlainTextCodeCopy } from "../../../utils/plainTextCodeCopy.js";
import { t } from "../../../i18n";

const EDIT_EXTRAS_ATTR = "data-edit-extras";

function isEditExtrasOn(view) {
  return view?.dom?.getAttribute(EDIT_EXTRAS_ATTR) === "on";
}

function hasCoarsePointer() {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.("(pointer: coarse)").matches || false;
  } catch {
    return false;
  }
}

// Tap events fire with a Text node as event.target when the tap lands
// on actual characters; Text nodes don't expose .closest(). Without
// normalising first, every "is this a link / code block / inline code"
// check silently failed on the most common case (tapping the text
// itself), which is what made mobile code-block taps look random.
function asElement(node) {
  if (!node) return null;
  if (node.nodeType === 1) return node;
  if (node.nodeType === 3) return node.parentElement;
  return node.parentElement || null;
}
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

// Place the caret at a viewport point and focus the editor. Called from
// the code-block 2nd-tap branch where the NodeView's wrapper/pre/code
// structure prevents PM's default mousedown handling from restoring
// focus to the contenteditable — without an explicit focus() inside
// the user-gesture touchend the OS keyboard stayed hidden.
function focusEditorAtClientPoint(view, x, y) {
  try {
    view.focus();
    const found = view.posAtCoords({ left: x, top: y });
    if (found && Number.isFinite(found.pos)) {
      const $pos = view.state.doc.resolve(found.pos);
      view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
    }
  } catch { /* stale position: keep the current caret */ }
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
  // along with the rest of the content — no scroll listener needed.
  const hostRect = host.getBoundingClientRect();
  const GAP = 4;
  const preferredLeft =
    lastRect.right - hostRect.left + host.scrollLeft + GAP;
  // Fall back to the line below when the right-of-line slot would push
  // the button past the host's visible right edge — typical of an
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
// and inline `<code>` elements sweep under it — the browser fires a burst
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

function showInlineCopyFor(codeEl, { sticky = false } = {}) {
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
  // Host the button inside the same scroll container as the code —
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
  // rides the scroll container natively — its position:absolute
  // coords are relative to the scrolled content, not the viewport.
  requestAnimationFrame(positionInlineCopyForCurrent);
  // The hide timer is NOT started here — it fires only when the cursor
  // leaves the inline code (mouseout) or the button (mouseleave).
  // Sticky (mobile tap) is dismissed by an explicit outside tap.
}
function scheduleInlineCopyHide() {
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
    // the keyboard. Then place the caret inside the link.
    try {
      view.focus();
      const pos = view.posAtDOM(anchor, 0);
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
      );
    } catch {
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
// Auto-hide timers (mobile only): the button vanishes after a few
// seconds of inactivity so a stale arm doesn't sit on screen forever.
// Disarming via the timer is a plain clear — it does NOT focus the
// editor or open the keyboard, so the next tap on the same element
// is detected as a "1st tap" again and the cycle restarts cleanly.
let armedCodeBlockHideTimer = null;
let armedInlineCodeHideTimer = null;
const MOBILE_ARM_AUTO_HIDE_MS = 5000;

function clearCodeBlockArm() {
  if (armedCodeBlockHideTimer) {
    clearTimeout(armedCodeBlockHideTimer);
    armedCodeBlockHideTimer = null;
  }
  if (armedCodeBlockEl) {
    armedCodeBlockEl.removeAttribute("data-armed");
  }
  armedCodeBlockEl = null;
}
function armCodeBlock(wrapper) {
  // Cancel any leftover timer from the previously armed wrapper so
  // its delayed clear doesn't fire after we re-arm a new one.
  if (armedCodeBlockHideTimer) {
    clearTimeout(armedCodeBlockHideTimer);
    armedCodeBlockHideTimer = null;
  }
  if (armedCodeBlockEl && armedCodeBlockEl !== wrapper) {
    armedCodeBlockEl.removeAttribute("data-armed");
  }
  armedCodeBlockEl = wrapper;
  wrapper.setAttribute("data-armed", "true");
  armedCodeBlockHideTimer = setTimeout(() => {
    armedCodeBlockHideTimer = null;
    clearCodeBlockArm();
  }, MOBILE_ARM_AUTO_HIDE_MS);
}
function clearInlineCodeArm() {
  if (armedInlineCodeHideTimer) {
    clearTimeout(armedInlineCodeHideTimer);
    armedInlineCodeHideTimer = null;
  }
  armedInlineCodeEl = null;
  hideInlineCopyImmediate();
}
function armInlineCode(codeEl) {
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

/* -------------------- the plugin -------------------- */

// Tap-vs-scroll threshold measured from touchstart to touchend.
const TAP_MOVE_PX = 24;
// How long synthesised mouse events are suppressed after a tap we
// handled, so the OS keyboard doesn't pop up from the click the
// browser fires a few hundred ms later.
const TAP_GUARD_MS = 700;

export const EditExtras = Extension.create({
  name: "editExtras",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("editExtras"),
        // Manage touch handlers via the plugin view so we can register
        // touchend with `passive: false` — PM's own handleDOMEvents
        // registration defaults to passive on touch events on some
        // browsers, which would silently ignore preventDefault and let
        // the OS keyboard pop up on link / code-block tap.
        view(editorView) {
          const dom = editorView.dom;

          // Touch lifecycle state. We only act on a confirmed *tap*
          // (touchend without scroll). Anything that becomes a scroll
          // is left alone so the page still scrolls.
          let touchInfo = null;
          // After a tap we handled, the synthesised mouse events the
          // browser fires next must NOT focus the editor. `pendingTap`
          // flags that state for the worst-case delay between
          // touchend and the synthesised mousedown.
          let pendingTap = null;
          let pendingTapTimer = null;
          const clearPending = () => {
            pendingTap = null;
            if (pendingTapTimer) {
              clearTimeout(pendingTapTimer);
              pendingTapTimer = null;
            }
          };
          const blurEditorIfFocused = () => {
            const ae = document.activeElement;
            if (ae && (ae === dom || dom.contains(ae))) {
              try {
                ae.blur();
              } catch { /* element already detached: nothing to blur */ }
            }
          };
          const armSyntheticGuard = () => {
            if (pendingTapTimer) clearTimeout(pendingTapTimer);
            pendingTap = true;
            pendingTapTimer = setTimeout(clearPending, TAP_GUARD_MS);
          };

          const onTouchStart = (event) => {
            if (!isEditExtrasOn(editorView)) return;
            if (!hasCoarsePointer()) return;
            if (event.touches.length === 1) {
              clearPending();
            } else {
              touchInfo = null;
              return;
            }
            if (isInsideCopyButton(event.target)) {
              touchInfo = null;
              return;
            }
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
          };

          const onTouchEnd = (event) => {
            if (!touchInfo) return;
            const { link, href, inlineCode, codeBlock, startX, startY } =
              touchInfo;
            touchInfo = null;
            const ct = event.changedTouches && event.changedTouches[0];
            if (ct) {
              const dx = Math.abs(ct.clientX - startX);
              const dy = Math.abs(ct.clientY - startY);
              if (dx > TAP_MOVE_PX || dy > TAP_MOVE_PX) return;
            }

            if (link && href) {
              event.preventDefault();
              blurEditorIfFocused();
              clearCodeBlockArm();
              clearInlineCodeArm();
              armSyntheticGuard();
              showLinkPopover(link, href, editorView);
              return;
            }

            if (codeBlock) {
              if (armedCodeBlockEl === codeBlock) {
                // 2nd tap on the same block: dismiss the button and
                // hand focus back to the editor so the keyboard
                // opens and the caret lands where the user pointed.
                // PM's default mousedown doesn't reliably focus
                // through the NodeView wrapper, so we do it
                // explicitly inside the touch gesture.
                clearCodeBlockArm();
                clearInlineCodeArm();
                clearPending();
                if (ct) {
                  focusEditorAtClientPoint(
                    editorView,
                    ct.clientX,
                    ct.clientY,
                  );
                }
                return;
              }
              event.preventDefault();
              blurEditorIfFocused();
              clearInlineCodeArm();
              armCodeBlock(codeBlock);
              armSyntheticGuard();
              return;
            }

            if (inlineCode) {
              if (armedInlineCodeEl === inlineCode) {
                clearInlineCodeArm();
                clearCodeBlockArm();
                clearPending();
                return;
              }
              event.preventDefault();
              blurEditorIfFocused();
              clearCodeBlockArm();
              armInlineCode(inlineCode);
              armSyntheticGuard();
              return;
            }

            // Tap on regular text: clear any armed state and let PM
            // handle the tap normally (caret placement + keyboard).
            clearCodeBlockArm();
            clearInlineCodeArm();
          };

          const onTouchCancel = () => {
            touchInfo = null;
          };

          // Swallow the synthesised mousedown / click that the browser
          // fires after a tap we handled, so the editor doesn't focus
          // and the OS keyboard doesn't pop up. The in-block / inline
          // copy buttons are exceptions — they live inside the editor
          // DOM but must still receive their own click handler.
          const onMouseDownCapture = (event) => {
            if (!pendingTap) return;
            if (isInsideCopyButton(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
          };
          const onClickCapture = (event) => {
            if (!pendingTap) return;
            if (isInsideCopyButton(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
          };

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

          // Force plain-text on the clipboard when the user selects
          // and copies inside a code block / inline code (Ctrl+C, OS
          // long-press → Copy). The in-block "Copier" button already
          // serialises via textContent; this catches manual selections
          // so the surrounding fragment never sneaks the styled HTML
          // into the clipboard.
          const detachCodeCopy = attachPlainTextCodeCopy(dom);

          return {
            destroy() {
              detachCodeCopy();
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
              // Ctrl/Cmd-click → open in a new tab. Caught on mousedown
              // because PM eats the click event for caret placement and
              // auxclick semantics differ across browsers.
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

/* -------------------- read-mode inline copy -------------------- */

/* Wire the same inline-code copy affordance onto a non-editor
   container so the read-only renderer behaves identically to the
   editor: desktop hovers reveal the floating "Copier" overlay, mobile
   taps arm it sticky and a second tap (or a tap elsewhere inside the
   container) dismisses it. We reuse the singleton overlay + armed
   state from the editor side, so the visibility timer (2 s),
   positioning, theming and clipboard logic stay in one place — no
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
