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
// CSS via `.rt-editor--with-edit-extras` on the editor wrapper, which
// `RichTextEditor.jsx` toggles based on the user's preference — so
// users with read-mode ON keep their unchanged edit-mode behaviour.

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

      return {
        dom: wrapper,
        contentDOM: code,
        // Selection / mutation never touches our button — let PM handle
        // the editable `code` subtree as usual.
        ignoreMutation: (mutation) =>
          mutation.target === btn || btn.contains(mutation.target),
      };
    };
  },
});

export default CodeBlockCopy;
