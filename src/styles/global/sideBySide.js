// Side-by-side mode (two notes open at once), desktop and stacked mobile.
// Part of the global stylesheet, assembled in order by ../globalCSS.js.

export const sideBySideCSS = `
/* ───────── Side-by-side mode ─────────
   Two NoteModal instances render their own scrims simultaneously. Both
   scrims keep their natural full-screen flex-center layout (i.e. the
   pane's NATURAL position is the same in SBS and single mode — exact
   viewport centre). The only thing SBS does is apply a translateX to
   each pane so it visibly anchors to one half of the screen with a
   configurable gap between them. When a pane closes, its surviving
   sibling animates its translateX back to 0 — i.e. exactly its natural
   centred position — so when the body class drops at the end of the
   animation, no layout property has actually moved and there is no
   "jolt": the pane was already at the same position the new layout
   would put it.                                                          */
:root {
  /* SBS layout vars.
       --sbs-gap   : space between the two panes
       --sbs-edge  : safety margin on each viewport edge so panes never
                     touch the screen border
       --sbs-pane-w: each pane's width, computed so that
                     2 * pane + gap + 2 * edge fits in 100vw. Capped at
                     896px so on very wide screens the panes don't grow
                     past the comfortable single-modal width.
       The translateX(-50%) anchors used below are relative to the
       pane's own width, so once --sbs-pane-w shrinks, the anchor
       offsets shrink with it and the pair stays centred + visible
       end-to-end without any JS work. */
  --sbs-gap: clamp(12px, 2vw, 32px);
  --sbs-edge: clamp(12px, 2vw, 28px);
  --sbs-pane-w: min(896px, calc((100vw - var(--sbs-gap) - var(--sbs-edge) * 2) / 2));
  /* Width the modal would naturally take in single-pane mode, mirroring
     the Tailwind utilities on .note-modal-anim
     (sm:w-11/12 sm:max-w-3xl). Used by the survivor's recenter rule so
     it expands to its single-pane width as part of the SAME animation
     as the recenter — no width flash after the transform settles. */
  --sbs-single-w: min(91.6667vw, 768px, calc(100vw - var(--sbs-edge) * 2));
  --sbs-anim: 360ms;
}
@media (min-width: 1024px) {
  :root {
    /* lg breakpoint: lg:max-w-4xl raises the cap to 896px. */
    --sbs-single-w: min(91.6667vw, 896px, calc(100vw - var(--sbs-edge) * 2));
  }
}
/* Side-by-side panes take their height and anchor offsets from dvh-based
   !important rules, so a scrim moved by the soft keyboard would leave them
   hanging past its edges. Neutralise it for the whole subtree; single-pane
   mode keeps it. */
.modal-scrim[data-split-mode="true"] {
  --keyboard-inset: 0px;
  --keyboard-pan: 0px;
}
/* The right-pane scrim is invisible — only the left scrim provides
   the shared backdrop. Setting pointer-events:none lets clicks pass
   through the transparent scrim overlay to the left pane below. */
body.sbs-active .modal-scrim[data-split-mode="true"][data-split-side="right"] {
  background: transparent !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  pointer-events: none;
}
/* Restore pointer events on the right pane content itself. */
body.sbs-active .modal-scrim[data-split-mode="true"][data-split-side="right"] > .note-modal-anim {
  pointer-events: auto;
}
/* Each pane keeps its native modal dimensions (no width / height /
   border-radius override). The SBS layout is purely transform-based
   so the natural flex layout is identical in SBS and single mode.
   Two CSS variables compose the final transform:
     --sbs-anchor-x  →  half-pane offset that anchors the pane to
                        one side of the viewport centre
     --sbs-close-x   →  small extra offset applied to the pane that's
                        animating out                                  */
body.sbs-active .modal-scrim[data-split-mode="true"] > .note-modal-anim {
  --sbs-anchor-x: 0px;
  --sbs-close-x: 0px;
  transform: translateX(var(--sbs-anchor-x)) translateX(var(--sbs-close-x));
  /* Base SBS transition: ONLY transform + opacity. width/max-width are
     deliberately excluded here so the dock-from-Tailwind-width to
     --sbs-pane-w switch on OPEN happens instantly (no visible resize on
     entry). The survivor's recenter rule below opts back into width
     transitions for the close animation only. */
  transition:
    transform var(--sbs-anim) cubic-bezier(.22,.61,.36,1),
    opacity var(--sbs-anim) ease;
  will-change: transform;
}
body.sbs-active .modal-scrim[data-split-mode="true"][data-split-side="left"] > .note-modal-anim {
  --sbs-anchor-x: calc(-50% - var(--sbs-gap) / 2);
  --note-anim-x: translateX(calc(-50% - var(--sbs-gap) / 2));
}
body.sbs-active .modal-scrim[data-split-mode="true"][data-split-side="right"] > .note-modal-anim {
  --sbs-anchor-x: calc(50% + var(--sbs-gap) / 2);
  --note-anim-x: translateX(calc(50% + var(--sbs-gap) / 2));
}
/* Pane that's animating out: small extra offset + fade. The anchor
   stays the same so the pane fades from its current position. */
body.sbs-active .modal-scrim[data-split-mode="true"][data-split-closing="true"] > .note-modal-anim {
  opacity: 0;
  pointer-events: none;
}
body.sbs-active .modal-scrim[data-split-mode="true"][data-split-side="left"][data-split-closing="true"] > .note-modal-anim {
  --sbs-close-x: -24px;
}
body.sbs-active .modal-scrim[data-split-mode="true"][data-split-side="right"][data-split-closing="true"] > .note-modal-anim {
  --sbs-close-x: 24px;
}
/* Surviving pane recenters: anchor goes back to 0. This is exactly
   the pane's natural flex-centre position, so when sbs-active drops
   at t=anim-end the transform clears with no visible delta.          */
body.sbs-active.sbs-closing-right .modal-scrim[data-split-mode="true"][data-split-side="left"] > .note-modal-anim {
  --sbs-anchor-x: 0px;
}
body.sbs-active.sbs-closing-left .modal-scrim[data-split-mode="true"][data-split-side="right"] > .note-modal-anim {
  --sbs-anchor-x: 0px;
}
/* SBS left-close handoff. At the end of requestCloseLeftPaneSBS, React
   swaps the primary's content from note A to note B and drops the SBS
   body classes / data-split attrs. Without this rule, the residual
   transition transform from the SBS base rule would animate the primary
   from its closing position back to centre — a visible left to right
   kick. Cutting only transition is intentional: changing animation
   name or shorthand could restart noteModalIn when the class is removed. */
.note-modal-anim.note-modal-anim--sbs-handoff {
  transition: none !important;
}
/* Horizontal SBS width clamp. On ≥768px each pane takes --sbs-pane-w,
   which auto-shrinks below 100vw - gap - 2*edge so the pair always
   fits the viewport end-to-end. The Tailwind utilities on the modal
   (sm:w-11/12 sm:max-w-3xl lg:max-w-4xl) are overridden via
   !important so the dynamic clamp wins regardless of breakpoint.
   Mobile (<=767px) is left untouched and keeps the vertical stack
   rule defined in the next @media block. */
@media (min-width: 768px) {
  body.sbs-active .modal-scrim[data-split-mode="true"] > .note-modal-anim {
    width: var(--sbs-pane-w) !important;
    max-width: var(--sbs-pane-w) !important;
  }
  /* Survivor expansion. When ONE pane is closing (sbs-closing-left or
     sbs-closing-right), the surviving pane already recenters via
     --sbs-anchor-x: 0. Here we additionally expand its width to the
     single-modal width so the recenter and the expansion play as a
     SINGLE smooth animation. The width/max-width transitions are
     declared on this rule (NOT on the base rule) so they exist only
     during the close animation — preventing any width resize on OPEN
     when --sbs-pane-w first replaces the Tailwind class width.
     When sbsBothClosing fires (backdrop click) sbsClosingSide stays
     null, neither sbs-closing-* class is set, and these rules do
     nothing — both panes keep --sbs-pane-w through their fade-out. */
  body.sbs-active.sbs-closing-left
    .modal-scrim[data-split-mode="true"][data-split-side="right"] > .note-modal-anim,
  body.sbs-active.sbs-closing-right
    .modal-scrim[data-split-mode="true"][data-split-side="left"] > .note-modal-anim {
    width: var(--sbs-single-w) !important;
    max-width: var(--sbs-single-w) !important;
    transition:
      transform var(--sbs-anim) cubic-bezier(.22,.61,.36,1),
      opacity var(--sbs-anim) ease,
      width var(--sbs-anim) cubic-bezier(.22,.61,.36,1),
      max-width var(--sbs-anim) cubic-bezier(.22,.61,.36,1);
  }
}
/* Mobile: stack vertically with the same transform-only approach.
   Gap is forced to 0 so the two panes touch — the screen is too cramped
   for breathing space and a flush split reads as a clear divider. The
   pane height derives from --sbs-gap so changing the gap automatically
   adjusts the height (with gap=0, height = 50vh, anchors = ±25vh,
   panes stack edge-to-edge). */
@media (max-width: 767px) {
  /* In vertical SBS, each scrim is a fullscreen layer. The desktop rule already
     makes the right scrim transparent; extend it to ALL mobile SBS scrims so no
     scrim background can bleed through any gap between the two note-modal-anim
     panes during the close animation. */
  body.sbs-active .modal-scrim[data-split-mode="true"] {
    background: transparent !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  /* Base rule: vertical stack, no X offset, no height transition (prevents 100dvh flash on open) */
  body.sbs-active .modal-scrim[data-split-mode="true"] > .note-modal-anim {
    --sbs-gap: 0px;
    --sbs-anchor-x: 0px;
    --sbs-anchor-y: 0px;
    --sbs-close-y: 0px;
    transform: translateY(var(--sbs-anchor-y)) translateY(var(--sbs-close-y));
    height: calc(50dvh - var(--sbs-gap) / 2) !important;
    clip-path: inset(0 0 0 0);
  }
  /* Per-side anchors; override --note-anim-x so noteModalIn starts at the correct Y position */
  body.sbs-active .modal-scrim[data-split-mode="true"][data-split-side="left"] > .note-modal-anim {
    --sbs-anchor-y: calc(-25dvh - var(--sbs-gap) / 2);
    --note-anim-x: translateY(calc(-25dvh - var(--sbs-gap) / 2));
    /* Top pane: keep safe-area-top, strip safe-area-bottom (junction edge, not screen bottom) */
    padding-bottom: 0 !important;
  }
  body.sbs-active .modal-scrim[data-split-mode="true"][data-split-side="right"] > .note-modal-anim {
    --sbs-anchor-y: calc(25dvh + var(--sbs-gap) / 2);
    --note-anim-x: translateY(calc(25dvh + var(--sbs-gap) / 2));
    /* Bottom pane: keep safe-area-bottom, strip safe-area-top (junction edge, not screen top) */
    padding-top: 0 !important;
  }
  /* Mobile SBS open: pop/zoom at the anchor Y position, no vertical slide.
     The global noteModalIn keyframe is redefined at <=639px to a translateY(14px)
     slide; combined with --note-anim-x = translateY(anchor) it would slide both
     panes up from below. Override with a scale-only keyframe anchored at Y. */
  @keyframes sbsMobilePaneIn {
    from { opacity: 0; transform: translateY(var(--sbs-anchor-y)) scale(0.92); }
    to   { opacity: 1; transform: translateY(var(--sbs-anchor-y)) scale(1);    }
  }
  body.sbs-active:not(.sbs-closing-left):not(.sbs-closing-right)
    .modal-scrim[data-split-mode="true"]:not([data-split-closing="true"])
    > .note-modal-anim:not(.closing) {
    animation: sbsMobilePaneIn 220ms cubic-bezier(.22,.61,.36,1);
  }
  /* Closing pane: stays frozen at its original position, fully opaque, no animation.
     The survivor slides over it, so backdrop is never exposed during the transition.
     opacity: 1 !important neutralises the global data-split-closing { opacity: 0 } rule
     which has no media-query guard and could otherwise fade the frozen pane. */
  body.sbs-active.sbs-closing-left
    .modal-scrim[data-split-mode="true"][data-split-side="left"] > .note-modal-anim {
    --sbs-anchor-y: calc(-25dvh - var(--sbs-gap) / 2);
    --sbs-close-y: 0px;
    --sbs-close-x: 0px;
    height: calc(50dvh - var(--sbs-gap) / 2) !important;
    clip-path: inset(0 0 0 0) !important;
    opacity: 1 !important;
    pointer-events: none;
    overflow: hidden;
    transition: none !important;
  }
  body.sbs-active.sbs-closing-right
    .modal-scrim[data-split-mode="true"][data-split-side="right"] > .note-modal-anim {
    --sbs-anchor-y: calc(25dvh + var(--sbs-gap) / 2);
    --sbs-close-y: 0px;
    --sbs-close-x: 0px;
    height: calc(50dvh - var(--sbs-gap) / 2) !important;
    clip-path: inset(0 0 0 0) !important;
    opacity: 1 !important;
    pointer-events: none;
    overflow: hidden;
    transition: none !important;
  }
  /* Explicit keyframes so height + transform always move on the same composited
     pass. CSS transitions animate each property independently, which can produce
     a 2-frame jump on Android WebView when height (layout) and transform
     (composited) are scheduled on different tick queues. */
  @keyframes sbsMobileSurvivorFromBottom {
    from {
      transform: translateY(calc(25dvh + var(--sbs-gap) / 2));
      height: calc(50dvh - var(--sbs-gap) / 2);
    }
    to {
      transform: translateY(0px);
      height: 100dvh;
    }
  }
  @keyframes sbsMobileSurvivorFromTop {
    from {
      transform: translateY(calc(-25dvh - var(--sbs-gap) / 2));
      height: calc(50dvh - var(--sbs-gap) / 2);
    }
    to {
      transform: translateY(0px);
      height: 100dvh;
    }
  }
  /* Survivor is layered above the frozen closing pane and is the only moving element. */
  body.sbs-active.sbs-closing-left
    .modal-scrim[data-split-mode="true"][data-split-side="right"],
  body.sbs-active.sbs-closing-right
    .modal-scrim[data-split-mode="true"][data-split-side="left"] {
    z-index: 42;
  }
  body.sbs-active.sbs-closing-left
    .modal-scrim[data-split-mode="true"][data-split-side="left"],
  body.sbs-active.sbs-closing-right
    .modal-scrim[data-split-mode="true"][data-split-side="right"] {
    z-index: 41;
  }
  /* Closing top pane → bottom pane (right) is the survivor, plays fromBottom. */
  body.sbs-active.sbs-closing-left
    .modal-scrim[data-split-mode="true"][data-split-side="right"] > .note-modal-anim {
    --sbs-anchor-y: 0px;
    height: 100dvh !important;
    clip-path: inset(0 0 0 0);
    opacity: 1;
    transition: none !important;
    animation: sbsMobileSurvivorFromBottom var(--sbs-anim) cubic-bezier(.22,.61,.36,1) both;
  }
  /* Closing bottom pane → top pane (left) is the survivor, plays fromTop. */
  body.sbs-active.sbs-closing-right
    .modal-scrim[data-split-mode="true"][data-split-side="left"] > .note-modal-anim {
    --sbs-anchor-y: 0px;
    height: 100dvh !important;
    clip-path: inset(0 0 0 0);
    opacity: 1;
    transition: none !important;
    animation: sbsMobileSurvivorFromTop var(--sbs-anim) cubic-bezier(.22,.61,.36,1) both;
  }
  /* Right-close cleanup: when sbs-closing-right drops, the survivor's animation
     rule disappears and the base .note-modal-anim { animation: noteModalIn }
     would re-fire, producing a tiny close/reopen flash. This class is set for
     two frames during the cleanup commit to suppress that replay. */
  .note-modal-anim.note-modal-anim--sbs-suppress-open-replay {
    animation: none !important;
    transition: none !important;
  }
}
`;
