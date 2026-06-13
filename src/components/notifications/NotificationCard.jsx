// Single notification card. macOS Notification Centre styling with
// the app's violet/blue/pink gradient + heavy blur instead of a flat
// white surface — see globalCSS.
//
// Layout:
//   [variant icon]  [title]                      [time]
//                   [message…]
//                                                [action]
//
// The action button is anchored to the bottom-right of the card so
// it never crowds the timestamp at the top-right.
//
// Message content can be a plain string OR contain `**bold**` markers
// (parsed into <strong> spans). React escapes the surrounding text
// children, so title / message remain XSS-safe even when the values
// originate from the server.

import React, { useRef, useEffect, useLayoutEffect } from "react";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

const VARIANT_CLASS = {
  success: "gk-notif-card--success",
  error: "gk-notif-card--error",
  warning: "gk-notif-card--warning",
  info: "gk-notif-card--info",
};

// Semantic icon keys → Tabler component. Callers pass an explicit
// `icon` field on the notification spec (e.g. `icon: "trash"` for a
// move-to-trash toast). The mapping keeps the choice in one place
// rather than scattering icon references across the codebase. When
// the key is missing or unknown we fall back to the variant glyph.
const SEMANTIC_ICONS = {
  trash: { Comp: TI.Trash, filled: false },
  "trash-x": { Comp: TI.TrashX, filled: false },
  restore: { Comp: TI.ArrowBackUp, filled: false },
  archive: { Comp: TI.Archive, filled: false },
  "archive-off": { Comp: TI.ArchiveOff, filled: false },
  copy: { Comp: TI.Copy, filled: false },
  save: { Comp: TI.DeviceFloppy, filled: false },
  note: { Comp: TI.Note, filled: false },
  edit: { Comp: TI.Pencil, filled: false },
  share: { Comp: TI.UserShare, filled: false },
  unshare: { Comp: TI.UserX, filled: false },
  "user-plus": { Comp: TI.UserPlus, filled: false },
  "user-check": { Comp: TI.UserCheck, filled: false },
  "user-x": { Comp: TI.UserX, filled: false },
  "user-clock": { Comp: TI.UserClock, filled: false },
  users: { Comp: TI.Users, filled: false },
  key: { Comp: TI.Key, filled: false },
  shield: { Comp: TI.ShieldLock, filled: false },
  qr: { Comp: TI.Qrcode, filled: false },
  camera: { Comp: TI.Camera, filled: false },
  refresh: { Comp: TI.Refresh, filled: false },
  power: { Comp: TI.Power, filled: false },
  reminder: { Comp: TI.BellRingingFilled, filled: true },
};

function VariantGlyph({ variant, iconKey }) {
  const className = "tabler-icon gk-notif-card__icon-glyph";
  const semantic = iconKey ? SEMANTIC_ICONS[iconKey] : null;
  if (semantic && semantic.Comp) {
    const Comp = semantic.Comp;
    return (
      <Comp
        className={`${className}${semantic.filled ? " tabler-icon--filled" : ""}`}
      />
    );
  }
  // Fallback: variant-coloured filled glyph (info / success / warning
  // / error). These are always filled, so the --filled modifier flips
  // the default outline-icon CSS to fill: currentColor.
  const filledClass = `${className} tabler-icon--filled`;
  if (variant === "success") return <TI.CircleCheckFilled className={filledClass} />;
  if (variant === "warning") return <TI.AlertTriangleFilled className={filledClass} />;
  if (variant === "error") return <TI.AlertCircleFilled className={filledClass} />;
  return <TI.InfoCircleFilled className={filledClass} />;
}

function fallbackTitle(variant) {
  if (variant === "success") return t("notifFallbackSuccess");
  if (variant === "warning") return t("notifFallbackWarning");
  if (variant === "error") return t("notifFallbackError");
  return t("notifFallbackInfo");
}

export function formatRelativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("relativeJustNow");
  if (diff < 3_600_000)
    return t("relativeMinutesAgo", { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000)
    return t("relativeHoursAgo", { n: Math.floor(diff / 3_600_000) });
  return t("relativeDaysAgo", { n: Math.floor(diff / 86_400_000) });
}

function renderMessage(message) {
  if (message == null) return null;
  if (typeof message !== "string") return message;
  if (!message.includes("**")) return message;
  const parts = message.split(/(\*\*[^*]+\*\*)/);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

// Swipe-to-dismiss threshold in pixels.
const SWIPE_DISMISS_THRESHOLD = 80;

export default function NotificationCard({
  notification,
  onDismiss,
  onAction,
  compact = false,
  closeSide = "left",
  // "toast" (default): premium glass with violet/blue gradient + LED
  // halo, used by the floating viewport. "center": neutral, near-
  // transparent glass that lets the panel surface show through — the
  // variant identity falls back to the icon + a thin accent bar on
  // the left edge so the panel doesn't stack two heavy gradients.
  mode = "toast",
  // When true (mobile panel): hides the X button and enables horizontal
  // swipe to dismiss the card.
  swipeable = false,
}) {
  const cardRef = useRef(null);
  const swipeBgRef = useRef(null);
  // Tracking via refs — never triggers React re-renders so the
  // transform follows the finger without batching lag.
  const deltaRef = useRef(0);
  // Stable refs for dismiss callback and notification id so the single
  // useEffect never needs to re-register listeners when props update.
  const onDismissRef = useRef(onDismiss);
  const notifIdRef = useRef(notification?.id);
  useEffect(() => { onDismissRef.current = onDismiss; });
  useEffect(() => { notifIdRef.current = notification?.id; });
  // Ref to the countdown bar's fill DOM node; used by the layout
  // effect below to compensate the React-mount delay against the
  // provider's setTimeout reference time.
  const countdownFillRef = useRef(null);

  useEffect(() => {
    if (!swipeable) return undefined;
    const el = cardRef.current;
    if (!el) return undefined;
    const bg = swipeBgRef.current;

    // Pointer events give us a single uniform stream for touch + pen +
    // mouse, plus setPointerCapture so we keep receiving move events
    // even if the finger drifts outside the card during a fling. The
    // card writes go directly to the DOM (no React state in the loop)
    // so the translate3d stays in sync with the finger at 60 fps.
    let startX = 0;
    let startY = 0;
    let active = false;          // a pointer is down on this card
    let locked = false;          // direction confirmed horizontal
    let activeId = null;
    let endHandler = null;
    let fallbackTimer = null;

    const reset = () => {
      active = false;
      locked = false;
      activeId = null;
    };

    const clearTransitionEnd = () => {
      if (endHandler) {
        el.removeEventListener("transitionend", endHandler);
        endHandler = null;
      }
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const onPointerDown = (e) => {
      // Restrict to touch/pen — mouse should not trigger swipe gestures
      // on desktop in case the panel ever shows up there.
      if (e.pointerType === "mouse") return;
      // Cancel any pending dismiss transition listeners — the user is
      // grabbing the card again.
      clearTransitionEnd();
      activeId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      active = true;
      locked = false;
      deltaRef.current = 0;
      el.style.transition = "none";
      if (bg) bg.style.transition = "none";
    };

    const onPointerMove = (e) => {
      if (!active || e.pointerId !== activeId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!locked) {
        // 6 px deadband so a tap that wobbles slightly doesn't move
        // the card. Once movement exceeds it, commit to a direction.
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          // Vertical gesture → bail out, let the panel list scroll.
          reset();
          return;
        }
        locked = true;
        // Claim the pointer so subsequent moves arrive here even if
        // the finger leaves the card's bounding box mid-swipe.
        try { el.setPointerCapture(activeId); } catch (_) {}
      }

      deltaRef.current = dx;
      // Direct DOM write with translate3d to put the layer on the GPU.
      el.style.transform = `translate3d(${dx}px, 0, 0)`;
      el.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 220));
      if (bg) {
        // Reveal the delete background proportionally to swipe progress.
        const p = Math.min(1, Math.abs(dx) / SWIPE_DISMISS_THRESHOLD);
        bg.style.opacity = String(p);
      }
    };

    const onPointerEnd = (e) => {
      if (!active || e.pointerId !== activeId) return;
      const wasLocked = locked;
      const dx = deltaRef.current;
      try { el.releasePointerCapture(activeId); } catch (_) {}
      reset();
      if (!wasLocked) return; // Was a tap or vertical scroll — nothing to animate.

      if (Math.abs(dx) >= SWIPE_DISMISS_THRESHOLD) {
        // Exit animation — slide off the card's own edge, then dismiss.
        // 120% of the card's own width keeps the exit contained within
        // the panel's overflow-x:hidden clip so no scrollbar appears.
        const dir = dx > 0 ? 1 : -1;
        el.style.transition = "transform 0.22s ease-out, opacity 0.22s ease-out";
        el.style.transform = `translate3d(${dir * 120}%, 0, 0)`;
        el.style.opacity = "0";
        if (bg) {
          bg.style.transition = "opacity 0.22s ease-out";
          bg.style.opacity = "1";
        }
        const finish = () => {
          clearTransitionEnd();
          onDismissRef.current?.(notifIdRef.current);
        };
        endHandler = (ev) => {
          if (ev.propertyName !== "transform") return;
          finish();
        };
        el.addEventListener("transitionend", endHandler);
        // Safety net in case transitionend never fires (e.g. element
        // is removed from the DOM mid-transition).
        fallbackTimer = setTimeout(finish, 350);
      } else {
        // Spring back to rest.
        el.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
        el.style.transform = "translate3d(0, 0, 0)";
        el.style.opacity = "1";
        if (bg) {
          bg.style.transition = "opacity 0.2s ease-out";
          bg.style.opacity = "0";
        }
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerEnd);
    el.addEventListener("pointercancel", onPointerEnd);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerEnd);
      el.removeEventListener("pointercancel", onPointerEnd);
      clearTransitionEnd();
    };
  }, [swipeable]);

  if (!notification) return null;
  const { id, title, message, variant, dismissible, action, actions: rawActions, actionLayout, createdAt, duration, icon: iconKey } =
    notification;
  // Unified action list: prefer the multi-action `actions` field when
  // present, fall back to the single legacy `action` field. Down the
  // line each button calls onAction(notification, chosenAction) so the
  // App-level dispatcher can branch on `chosenAction.kind`.
  const actionList = Array.isArray(rawActions) && rawActions.length > 0
    ? rawActions
    : (action ? [action] : []);
  // Default: a single action sits inline at the end of the message row
  // (compact). Callers with a long message can pass actionLayout:"below"
  // to push even a single button into the dedicated row underneath, so
  // the message wraps naturally at full width instead of being squeezed
  // next to the button.
  const renderActionsBelow =
    actionList.length > 1 || actionLayout === "below";
  const klass = VARIANT_CLASS[variant] || VARIANT_CLASS.info;
  const closeKlass =
    closeSide === "right" ? " gk-notif-card--close-right" : "";
  const modeKlass = mode === "center" ? " gk-notif-card--center" : "";
  const swipeKlass = swipeable ? " gk-notif-card--swipeable" : "";
  const time = formatRelativeTime(createdAt);
  const headline = title || fallbackTitle(variant);
  // Countdown bar — only on floating toasts (not in the history panel,
  // which uses `compact`) with a finite auto-dismiss duration. Drawn
  // imperatively by a CSS animation whose duration matches the
  // provider's auto-dismiss timer so they finish together.
  const showCountdown =
    !compact && typeof duration === "number" && duration > 0;
  // Sync the CSS animation with the provider's setTimeout: notify()
  // schedules the auto-dismiss the moment it runs (t = createdAt),
  // but the bar only starts animating once React commits and the
  // browser mounts the element — a few ms (sometimes a few hundred
  // on slow devices) later. Reading Date.now() during render
  // measures the gap up to the RENDER call, not the actual mount;
  // there's still another commit + paint gap on top. useLayoutEffect
  // runs after the DOM mutation and before paint, so Date.now() in
  // it is effectively the actual mount time — feeding it back as a
  // NEGATIVE animation-delay lands the scaleX(0) frame at the same
  // wall-clock instant the provider's timer fires. Mount-only deps
  // so we don't re-anchor on every render (which would restart the
  // CSS animation and re-create the very desync this fixes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!showCountdown) return undefined;
    const anchor = () => {
      const el = countdownFillRef.current;
      if (!el || !createdAt || typeof duration !== "number" || duration <= 0) return;
      const elapsed = Math.max(0, Math.min(duration, Date.now() - createdAt));
      // Restart the animation so the recomputed negative delay re-seeks
      // the bar — animation-delay is only sampled when an animation
      // begins. Toggle the name off (+ reflow) then back on; touch only
      // animation-name/-delay and leave animation-duration to React's
      // inline style so we don't fight its reconciliation.
      el.style.animationName = "none";
      void el.offsetWidth; // force reflow so the restart registers
      el.style.animationName = "";
      el.style.animationDelay = `-${elapsed}ms`;
    };
    anchor();
    // A backgrounded tab PAUSES the animation timeline, so a toast that
    // appeared (or sat) while the tab was unfocused would otherwise resume
    // from where it froze and lag the provider's wall-clock setTimeout —
    // the bar visibly "starts" only on focus. Re-anchor whenever the tab
    // comes back so the bar jumps to the true elapsed time.
    const onVisible = () => {
      if (document.visibilityState === "visible") anchor();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const card = (
    <div
      ref={cardRef}
      role="status"
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={`gk-notif-card ${klass}${compact ? " gk-notif-card--compact" : ""}${closeKlass}${modeKlass}${swipeKlass}${actionLayout === "below" && !compact ? " gk-notif-card--wide" : ""}`}
    >
      {dismissible !== false && !swipeable ? (
        <button
          type="button"
          aria-label={t("close")}
          className="gk-notif-card__close"
          onClick={() => onDismiss && onDismiss(id)}
        >
          ✕
        </button>
      ) : null}

      {time ? <span className="gk-notif-card__time">{time}</span> : null}

      <span className="gk-notif-card__icon" aria-hidden="true">
        <VariantGlyph variant={variant} iconKey={iconKey} />
      </span>

      <div className="gk-notif-card__body">
        <div className="gk-notif-card__title">{headline}</div>
        <div className="gk-notif-card__body-end">
          {message ? (
            <div className="gk-notif-card__message">{renderMessage(message)}</div>
          ) : (
            // Spacer so the action button still right-aligns inside
            // the flex row when no message is set.
            <div className="gk-notif-card__message" aria-hidden="true" />
          )}
          {actionList.length === 1 && !renderActionsBelow ? (
            <button
              type="button"
              className="gk-notif-card__action-btn"
              onClick={() => onAction && onAction(notification, actionList[0])}
            >
              {actionList[0].label}
            </button>
          ) : null}
        </div>
        {renderActionsBelow ? (
          <div className="gk-notif-card__actions">
            {actionList.map((a, i) => {
              // The "reject" half of an approve/reject pair (or any
              // explicit secondary action) renders as a neutral
              // outline button so the primary CTA reads as default.
              const secondary =
                a.kind === "reject_pending_user" ||
                a.variant === "secondary";
              return (
                <button
                  key={i}
                  type="button"
                  className={`gk-notif-card__action-btn${secondary ? " gk-notif-card__action-btn--secondary" : ""}`}
                  onClick={() => onAction && onAction(notification, a)}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {showCountdown ? (
        <div className="gk-notif-card__countdown-clip" aria-hidden="true">
          <div className="gk-notif-card__countdown">
            <div
              ref={countdownFillRef}
              className="gk-notif-card__countdown-fill"
              style={{ animationDuration: `${duration}ms` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );

  if (!swipeable) return card;

  // Swipe mode: wrap the card in a positioning context with a red
  // "delete" background revealed as the card slides away. Icons on
  // both sides so the affordance reads regardless of swipe direction.
  return (
    <div className="gk-notif-card-swipe-wrap">
      <div className="gk-notif-card-swipe-bg" ref={swipeBgRef} aria-hidden="true">
        <span className="gk-notif-card-swipe-bg__icon">
          <TI.Trash className="tabler-icon" />
        </span>
        <span className="gk-notif-card-swipe-bg__icon">
          <TI.Trash className="tabler-icon" />
        </span>
      </div>
      {card}
    </div>
  );
}
