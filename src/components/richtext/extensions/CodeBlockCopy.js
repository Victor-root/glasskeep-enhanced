// Code-block node view that adds a copy button next to the rendered
// `<pre><code>` inside the editor.
//
// The view-mode read-only renderer already injects copy buttons into
// each `<pre>` via `useModalState.js`. The editor was missing that
// affordance for users who have the "Read mode for notes" preference
// turned OFF — they never see the view-mode rendering, so they had no
// way to copy a fenced block without manually selecting its text.
//
// We extend StarterKit's CodeBlock with a Tiptap NodeView so the copy
// affordance lives inside the editor DOM that ProseMirror owns. The
// button is marked `contenteditable=false` so PM treats it as inert
// chrome and never tries to move the caret into it or include it in a
// selection. Whether the button is actually *visible* is controlled by
// CSS — desktop shows it on wrapper hover (gated by the editor-level
// `data-edit-extras="on"` flag), mobile shows it when the wrapper is
// armed via `data-armed="true"` (set by `EditExtras` on the first
// single tap so the OS keyboard doesn't pop up; second tap clears it
// and lets PM focus normally).
//
// We also port the view-mode's sticky scroll-following logic: as the
// user scrolls past the top of a tall code block, the copy button
// stays visible by tracking the top of the visible portion of the
// wrapper instead of scrolling out with the start of the block.

import CodeBlock from "@tiptap/extension-code-block";
import { t } from "../../../i18n";

export const CodeBlockCopy = CodeBlock.extend({
  addNodeView() {
    return ({ node }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper";

      const pre = document.createElement("pre");
      const code = document.createElement("code");
      // Mirror what the renderer emits so syntax-class CSS still applies
      // if a language attr is later added (it's a no-op while empty).
      if (node.attrs?.language) {
        code.className = `language-${node.attrs.language}`;
      }
      // Turn off the OS / browser spellchecker for code: shell paths,
      // CLI flags, identifiers etc. are not natural-language words and
      // the red squiggles only get in the way.
      pre.setAttribute("spellcheck", "false");
      code.setAttribute("spellcheck", "false");
      pre.appendChild(code);
      wrapper.appendChild(pre);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy-btn";
      btn.setAttribute("contenteditable", "false");
      btn.setAttribute("data-copy-btn", "1");
      const idleLabel = t("copy");
      const doneLabel = t("copied");
      btn.textContent = idleLabel;
      // Stop PM from focusing the editor / moving the caret on
      // mousedown — without this, clicking the button steals focus
      // mid-press and the click handler runs against the wrong target.
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = code.textContent || "";
        try {
          navigator.clipboard?.writeText(text);
        } catch (_e) {}
        btn.textContent = doneLabel;
        clearTimeout(btn._gkResetTimer);
        btn._gkResetTimer = setTimeout(() => {
          btn.textContent = idleLabel;
        }, 1200);
      });
      wrapper.appendChild(btn);

      // Sticky scroll-follow: when the top of the wrapper scrolls past
      // the editor's sticky header (or the top of the scroll container),
      // push the button's offset down so it stays visible at the top
      // of the *visible portion* of the block. Mirrors what
      // `useModalState.js` does for view-mode rendering.
      let scrollEl = null;
      let stickyHeader = null;
      const adjustBtnPos = () => {
        if (!wrapper.isConnected || !scrollEl) return;
        const headerBottom = stickyHeader
          ? stickyHeader.getBoundingClientRect().bottom
          : scrollEl.getBoundingClientRect().top;
        const wrapperTop = wrapper.getBoundingClientRect().top;
        const offset = headerBottom - wrapperTop;
        if (offset > 8) {
          const maxTop = wrapper.offsetHeight - btn.offsetHeight - 8;
          btn.style.top = `${Math.min(offset + 8, Math.max(8, maxTop))}px`;
        } else {
          btn.style.top = "8px";
        }
      };
      // Lazy-attach after the NodeView is mounted into the document so
      // closest(".modal-scroll-themed") finds the host scroll container.
      const attachScrollFollow = () => {
        scrollEl = wrapper.closest(".modal-scroll-themed");
        if (!scrollEl) return;
        stickyHeader = scrollEl.querySelector(".sticky");
        scrollEl.addEventListener("scroll", adjustBtnPos, { passive: true });
        adjustBtnPos();
      };
      const raf = requestAnimationFrame(attachScrollFollow);

      return {
        dom: wrapper,
        contentDOM: code,
        // PM's MutationObserver fires for every DOM change inside the
        // editor. For nodes it owns it would normally try to reconcile
        // — and for an attribute mutation on a NodeView's wrapper PM
        // marks the node dirty and recreates the whole NodeView, which
        // destroys our wrapper / button instances.
        //
        // Two classes of mutation we must explicitly ignore:
        //   1. Anything happening inside our copy button (label flip
        //      "Copier" ↔ "Copié", style.top changes from the sticky
        //      scroll follower). These are chrome, not content.
        //   2. Attribute changes on the wrapper itself — most
        //      importantly the mobile `data-armed="true"` flag set by
        //      EditExtras on the first tap. Without this exception PM
        //      destroyed and recreated the NodeView every time the
        //      user tapped a code block, which is why the copy button
        //      never appeared and every tap was logged as "BLOCK 1st
        //      -> arm" instead of alternating 1st/2nd.
        ignoreMutation: (mutation) => {
          if (mutation.target === btn || btn.contains(mutation.target)) {
            return true;
          }
          if (
            mutation.type === "attributes" &&
            mutation.target === wrapper
          ) {
            return true;
          }
          return false;
        },
        destroy: () => {
          cancelAnimationFrame(raf);
          if (scrollEl) {
            scrollEl.removeEventListener("scroll", adjustBtnPos);
          }
          clearTimeout(btn._gkResetTimer);
        },
      };
    };
  },
});

export default CodeBlockCopy;
