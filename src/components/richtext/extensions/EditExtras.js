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
    // Place the caret inside the link and focus the editor so the OS
    // keyboard pops up on the next interaction tick — same effect as a
    // direct tap on the link would have had without our intercept.
    try {
      const pos = view.posAtDOM(anchor, 0);
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
      );
      view.focus();
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

export const EditExtras = Extension.create({
  name: "editExtras",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("editExtras"),
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
            // Mobile / coarse-pointer: tap on a link shows the popover
            // instead of placing the caret and opening the keyboard.
            // We use `touchstart` (capture-able, fires before the
            // click that would focus the contenteditable) and only
            // intervene on coarse pointers so desktop click semantics
            // stay untouched.
            touchstart: (view, event) => {
              if (!isEditExtrasOn(view)) return false;
              if (!hasCoarsePointer()) return false;
              const link = closestLink(event.target);
              if (!link) return false;
              const href = link.getAttribute("href");
              if (!href) return false;
              event.preventDefault();
              showLinkPopover(link, href, view);
              return true;
            },
          },
        },
      }),
    ];
  },
});

export default EditExtras;
