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
import { attachStickyCopyButton } from "../../../utils/codeCopySticky.js";

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
        } catch { /* clipboard blocked: the label still confirms the tap */ }
        btn.textContent = doneLabel;
        clearTimeout(btn._gkResetTimer);
        btn._gkResetTimer = setTimeout(() => {
          btn.textContent = idleLabel;
        }, 1200);
      });
      wrapper.appendChild(btn);

      // Sticky scroll-follow: the copy button tracks the visible top of a
      // tall code block as it scrolls under the editor's sticky header.
      // attachStickyCopyButton does this without layout-thrashing (rAF
      // coalescing + skips off-screen blocks). Lazy-attached after the
      // NodeView is mounted so closest(".modal-scroll-themed") resolves.
      let cleanupFollow = () => {};
      const attachScrollFollow = () => {
        const scrollEl = wrapper.closest(".modal-scroll-themed");
        if (!scrollEl) return;
        cleanupFollow = attachStickyCopyButton(scrollEl, wrapper, btn);
      };
      const raf = requestAnimationFrame(attachScrollFollow);

      return {
        dom: wrapper,
        contentDOM: code,
        // Ignore mutations PM would otherwise treat as content changes:
        //   - anything inside the copy button (label flip, style.top
        //     updates from the sticky scroll follower)
        //   - attribute changes on the wrapper itself, in particular
        //     the mobile `data-armed="true"` flag set by EditExtras.
        //     Without this PM marks the node dirty and recreates the
        //     whole NodeView on every arm/disarm, so the button never
        //     stays visible.
        ignoreMutation: (mutation) => {
          if (mutation.target === btn || btn.contains(mutation.target)) {
            return true;
          }
          if (mutation.type === "attributes" && mutation.target === wrapper) {
            return true;
          }
          return false;
        },
        destroy: () => {
          cancelAnimationFrame(raf);
          cleanupFollow();
          clearTimeout(btn._gkResetTimer);
        },
      };
    };
  },
});

export default CodeBlockCopy;
