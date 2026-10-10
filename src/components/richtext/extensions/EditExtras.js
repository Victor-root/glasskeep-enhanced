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
// portaled into `document.body` and styled in `globalCSS.js`; they live in
// linkOverlays.js and inlineCodeCopy.js.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { attachPlainTextCodeCopy } from "../../../utils/plainTextCodeCopy.js";
import { t } from "../../../i18n";
import {
  TAP_MOVE_PX,
  closestCodeBlockWrapper,
  closestInlineCode,
  closestLink,
  eventElement,
  hasCoarsePointer,
  isInsideCopyButton,
} from "./editTargets.js";
import { ensureSchemeURL, hideTooltip, showLinkPopover, showTooltip } from "./linkOverlays.js";
import {
  MOBILE_ARM_AUTO_HIDE_MS,
  armInlineCode,
  clearInlineCodeArm,
  isArmedInlineCode,
  isInlineCopyButton,
  scheduleInlineCopyHide,
  showInlineCopyFor,
} from "./inlineCodeCopy.js";

const EDIT_EXTRAS_ATTR = "data-edit-extras";

function isEditExtrasOn(view) {
  return view?.dom?.getAttribute(EDIT_EXTRAS_ATTR) === "on";
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

/* -------------------- mobile-armed state -------------------- */

// Which code-block wrapper is currently "armed" (showing its copy button
// after a single tap on mobile). The inline-code one lives in
// inlineCodeCopy.js; at most one of the two is armed at a time.
let armedCodeBlockEl = null;
// Auto-hide timer (mobile only), see MOBILE_ARM_AUTO_HIDE_MS.
let armedCodeBlockHideTimer = null;

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

/* -------------------- the plugin -------------------- */

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
              if (isArmedInlineCode(inlineCode)) {
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
                if (related && (code.contains(related) || isInlineCopyButton(related))) return false;
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
