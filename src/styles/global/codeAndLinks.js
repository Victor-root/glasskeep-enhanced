// Phone scrollbar hiding, code copy buttons, the editor's edit-mode link and
// code affordances, checklist drag handle and the masonry grid.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const codeAndLinksCSS = `
/* Copy buttons */
/* Hide scrollbars on mobile (keep scrolling) */
@media (max-width: 639px) {
  html, body {
    scrollbar-width: none;      /* Firefox */
    -ms-overflow-style: none;   /* IE/Edge legacy */
  }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    display: none;              /* Chrome/Safari/Brave */
  }
  .mobile-hide-scrollbar {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .mobile-hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
}

/* Shared theme for code-copy buttons. Applied to the in-editor /
   view-mode code-block button AND to the portaled inline-code button
   (.rt-inline-code-copy below), so both surfaces look identical
   regardless of which DOM context they end up rendered in. */
.code-copy-btn {
  font-size: .75rem;
  padding: .2rem .45rem;
  border-radius: .35rem;
  background: var(--note-color, #111);
  color: #fff;
  border: none;
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  cursor: pointer;
}
.code-copy-btn:hover {
  background: var(--note-color-opaque, #111);
}
html:not(.dark) .code-copy-btn {
  color: rgba(0,0,0,0.75);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

/* Code-block button positioning + hover-show. Scoped to descendants
   of the wrapper / pre so the rules don't catch the portaled inline
   button, which has its own visibility mechanism. */
.note-content pre .code-copy-btn,
.code-block-wrapper .code-copy-btn {
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 2;
}
.code-block-wrapper:hover .code-copy-btn {
  opacity: 1;
}

/* Legacy class kept for the rare case an inline copy button is still
   inserted as a sibling. Read-mode now uses the same floating overlay
   as edit-mode (.rt-inline-code-copy), so this rule only ensures any
   stray sibling button still picks up the spacing tweak. */
.inline-code-copy-btn {
  margin-left: 6px;
  vertical-align: baseline;
}

/* ============================================================
   Edit-mode link / code affordances (EditExtras + CodeBlockCopy)
   ============================================================
   Gated visually by data-edit-extras="on" on the editor wrapper
   (RichTextEditor sets it based on the user's read-mode pref).
   With the attribute absent, the editor stays exactly as it was
   before so users who rely on the read-only view-mode keep their
   previous edit-mode behaviour. */

/* Code-block copy button inside the editor: hidden when extras off. */
.rt-editor:not([data-edit-extras="on"]) .code-block-wrapper .code-copy-btn {
  display: none;
}
/* Mobile arm: tapping a code block once on a coarse pointer adds
   data-armed="true" so the copy button stays visible without the
   editor stealing focus. CSS also shows it for hover on desktop via
   the existing .code-block-wrapper:hover rule. Selector intentionally
   doesn't require the .code-block-wrapper class — we also fall back
   to arming a bare <pre> if for any reason the NodeView wrapper
   isn't found at runtime, and we want the copy button (if present)
   to still appear. */
.rt-editor[data-edit-extras="on"] [data-armed="true"] .code-copy-btn {
  opacity: 1;
}

/* "Copier" overlay anchored to inline code. Lives INSIDE the editor's
   scroll container (e.g. .modal-scroll-themed) as a position:absolute
   child, so it rides the scroll along with the underlying inline code
   and is clipped naturally when the line leaves the viewport — no JS
   scroll listener required. The visual theme (font, padding, colours,
   shadow) is shared with the code-block button via .code-copy-btn. */
.rt-inline-code-copy {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 5;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
.rt-inline-code-copy--visible {
  opacity: 1;
  pointer-events: auto;
}

/* Link hover tooltip. */
.rt-link-tooltip {
  position: fixed;
  z-index: 10050;
  font-size: .72rem;
  font-weight: 500;
  padding: .2rem .5rem;
  border-radius: .35rem;
  background: rgba(17, 17, 17, 0.92);
  color: #fff;
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s;
  white-space: nowrap;
}
.rt-link-tooltip--visible { opacity: 1; }

/* Mobile tap-on-link popover with Open / Edit actions. */
.rt-link-popover {
  position: fixed;
  z-index: 10060;
  display: none;
  flex-direction: row;
  gap: 6px;
  padding: 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 8px 28px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.12);
  border: 1px solid rgba(0,0,0,0.06);
}
.dark .rt-link-popover {
  background: rgba(30, 30, 35, 0.98);
  border-color: rgba(255,255,255,0.08);
  box-shadow: 0 8px 28px rgba(0,0,0,0.55);
}
.rt-link-popover--visible { display: inline-flex; }
.rt-link-popover__btn {
  font-size: .82rem;
  font-weight: 600;
  padding: .4rem .8rem;
  border-radius: 7px;
  border: none;
  cursor: pointer;
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  color: #fff;
}
.rt-link-popover__btn--secondary {
  background: transparent;
  color: inherit;
  border: 1px solid rgba(0,0,0,0.12);
}
.dark .rt-link-popover__btn--secondary {
  border-color: rgba(255,255,255,0.18);
}
.rt-link-popover__btn:active { transform: scale(0.97); }

/* When extras are off (read-mode user toggled note to edit) the
   editor must not show a link-affordance cursor, since we don't wire
   any link interaction in that mode. */
.rt-editor:not([data-edit-extras="on"]) .ProseMirror a { cursor: text; }
/* In edit-extras mode, hovering a link in the editor should hint at
   the new interaction without making it look like a plain web link. */
.rt-editor[data-edit-extras="on"] .ProseMirror a { cursor: pointer; }

.checklist-drag-clone {
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  border-radius: 8px;
  will-change: top;
}

/* Drag handle cursor – native OS move cursor */
.checklist-grab-handle { cursor: move; }
.checklist-grab-handle:active { cursor: move; }
.masonry-grid { display: flex; margin-left: -0.75rem; width: auto; }
.masonry-grid-column { padding-left: 0.75rem; background-clip: padding-box; }
.masonry-grid-column > div { margin-bottom: 0.75rem; }
`;
