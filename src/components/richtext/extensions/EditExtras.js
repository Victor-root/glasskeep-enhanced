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
import { t } from "../../../i18n";

const EDIT_EXTRAS_ATTR = "data-edit-extras";

function isEditExtrasOn(view) {
  return view?.dom?.getAttribute(EDIT_EXTRAS_ATTR) === "on";
}

function hasCoarsePointer() {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.("(pointer: coarse)").matches || false;
  } catch (_e) {
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
  } catch (_e) {}
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
  // so the last rect is the line where the code ends.
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
  } catch (_e) {}
  el.textContent = t("copy");
  el.classList.add("rt-inline-code-copy--visible");
  el.classList.toggle("rt-inline-code-copy--sticky", sticky);
  // Defer positioning to next frame so the just-shown element has
  // measurable dimensions.
  requestAnimationFrame(positionInlineCopyForCurrent);
}
function scheduleInlineCopyHide() {
  if (inlineCopySticky) return;
  if (inlineCopyHideTimer) clearTimeout(inlineCopyHideTimer);
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
    // the keyboard. Then place the caret inside the link.
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
// NodeView (see CodeBlockCopy.js). Registered lazily on first arm and
// never torn down — handler is cheap (single rect read) and the
// singletons live for the page lifetime.
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
              } catch (_e) {}
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
