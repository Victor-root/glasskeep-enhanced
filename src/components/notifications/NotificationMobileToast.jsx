// Mobile notification dispatcher.
//
// Renders the same in-app CSS pill on every form factor — PWA,
// browser, AND inside the Android WebView wrapper. The native
// Toast.makeText bridge (window.AndroidToast) is still shipped by
// the APK but no longer invoked from here: a native OS toast can't
// carry our action buttons (e.g. "Mettre à jour maintenant") and
// it bypasses the variant palette / countdown bar that make the
// pill recognisable, so we keep one consistent visual across
// devices.
//
// The notification still lands in the provider's history list so
// the bell + panel work the same everywhere.

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNotifications } from "./NotificationProvider.jsx";
import TI from "../../icons/editor/index.jsx";

const VARIANT_GLYPH = {
  success: TI.CircleCheckFilled,
  warning: TI.AlertTriangleFilled,
  error: TI.AlertCircleFilled,
  info: TI.InfoCircleFilled,
};

const SEMANTIC_ICONS = {
  trash: TI.Trash,
  "trash-x": TI.TrashX,
  restore: TI.ArrowBackUp,
  archive: TI.Archive,
  "archive-off": TI.ArchiveOff,
  copy: TI.Copy,
  save: TI.DeviceFloppy,
  share: TI.UserShare,
  unshare: TI.UserX,
  "user-plus": TI.UserPlus,
  "user-check": TI.UserCheck,
  "user-x": TI.UserX,
  "user-clock": TI.UserClock,
  key: TI.Key,
  shield: TI.ShieldLock,
  qr: TI.Qrcode,
  camera: TI.Camera,
  refresh: TI.Refresh,
  power: TI.Power,
};

function pickGlyph(notif) {
  if (notif.icon && SEMANTIC_ICONS[notif.icon]) {
    return { Comp: SEMANTIC_ICONS[notif.icon], filled: false };
  }
  const Filled = VARIANT_GLYPH[notif.variant] || TI.InfoCircleFilled;
  return { Comp: Filled, filled: true };
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

// Native Toast.makeText bridge is intentionally disabled — we render
// the in-app pill on Android too so the visual + actions stay
// consistent with PWA / browser. Kept as a no-op stub (rather than
// removing the call sites) so the bridge can be re-enabled by
// returning the real probe if we ever want to toggle back.
function hasAndroidBridge() {
  return false;
}

// Build the plain-text payload for the native toast. The OS widget
// can't show inline bold anyway, and notification messages can now
// be either strings (legacy / system text) or React elements (any
// message that embeds a highlighted user-provided value — note title,
// user name, etc.), so we walk both into a flat string. Strings still
// get the legacy `**bold**` strip for callers that pre-date the JSX
// path. Title + message glued with a colon so a share notification
// reads as "Note partagée: Victor a partagé la note …".
function nodeToText(node) {
  if (node == null || node === false) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  const children = node?.props?.children;
  if (children !== undefined) return nodeToText(children);
  return "";
}
function buildToastText(notif) {
  const flatten = (v) =>
    typeof v === "string"
      ? v.replace(/\*\*([^*]+)\*\*/g, "$1")
      : nodeToText(v);
  const title = flatten(notif.title);
  const message = flatten(notif.message);
  if (title && message) return `${title}: ${message}`;
  return title || message || "";
}

function shouldUseLong(notif) {
  if (notif.persistent) return true;
  if (typeof notif.duration === "number" && notif.duration > 3000) return true;
  return false;
}

export default function NotificationMobileToast({ onAction, suppressed = false, position = "bottom" }) {
  const { notifications, remove, dismissLocal, cancelAutoDismiss } = useNotifications();
  const [visible, setVisible] = useState(false);
  const lastIdRef = useRef(null);
  const notificationsRef = useRef(notifications);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // ── Sticky displayed-id ────────────────────────────────────────────
  // The pill shows ONE notification at a time. A newly arriving
  // notification must NOT pre-empt the one currently on screen —
  // otherwise rapid bursts of 4+ notifs cause the earlier ones to
  // flash for a single frame each as `find(!dismissed)` rotates to
  // the newest every render. We keep showing the same id until
  // either the cycler dismisses it OR the provider's own auto-dismiss
  // timer fires.
  const displayedIdRef = useRef(null);
  // Wall-clock moment the current notif first became visible. Used
  // by the bar's animation-delay anchor so the countdown measures
  // from "now I'm on screen", not from createdAt (which can be far
  // in the past for notifs that sat queued behind earlier ones).
  const displayStartRef = useRef(0);

  // ── Burst snapshot ────────────────────────────────────────────────
  // burst is the FROZEN rotation for the current run. Captured at
  // settle (= 100 ms after the last arrival of the burst) and used
  // as the single authority for which notif is on screen and when
  // to advance. The cycler increments burst.cursor, not the provider
  // state — so external dismissals from a desktop session's SSE
  // broadcast (notification_delivered for a notif desktop's bar just
  // finished on) can no longer cut a mobile notif short mid-slice.
  //
  //   { ids: string[], cursor: number, slice: number }
  //
  // null between bursts.
  const [burst, setBurst] = useState(null);

  // Pick current. Inside a burst, the cursor points at the id we
  // display, EVEN IF it's been marked dismissed externally — the
  // cycler is the only thing allowed to advance the cursor. Outside
  // a burst we fall back to sticky displayedIdRef + first active
  // (handles persistent notifs and the brief settling window before
  // the first burst snapshot is taken).
  /* eslint-disable react-hooks/refs, react-hooks/purity -- the sticky display tracker is updated during render on purpose so the cycler and countdown read the stamp of the slot being rendered */
  let current = null;
  if (burst && burst.ids[burst.cursor]) {
    const id = burst.ids[burst.cursor];
    current = notifications.find((n) => n.id === id) || null;
  }
  if (!current) {
    if (displayedIdRef.current != null) {
      const sticky = notifications.find(
        (n) => n.id === displayedIdRef.current && !n.dismissed,
      );
      if (sticky) current = sticky;
    }
  }
  if (!current) {
    current = notifications.find((n) => !n.dismissed) || null;
    if (current && current.id !== displayedIdRef.current) {
      displayedIdRef.current = current.id;
      displayStartRef.current = Date.now();
    } else if (!current) {
      displayedIdRef.current = null;
      displayStartRef.current = 0;
    }
  } else if (
    burst &&
    current &&
    current.id !== displayedIdRef.current
  ) {
    // Burst cursor moved to a new id (cycler advanced). Update the
    // sticky tracker and stamp display start so the bar's
    // animation-delay anchor is fresh for this slot.
    displayedIdRef.current = current.id;
    displayStartRef.current = Date.now();
  }
  /* eslint-enable react-hooks/refs, react-hooks/purity */

  // burstSlice derived from burst object — keeps the rest of the
  // component (bar duration, cycler, layout effect) reading from
  // a single field.
  const burstSlice = burst ? burst.slice : null;

  // NOTE: there's intentionally no "end burst when nothing's active"
  // effect anymore. The cycler is the sole authority for burst
  // lifecycle: it advances the cursor every slice and setBurst(null)
  // when the cursor passes burst.ids.length. An external dismiss
  // (provider timer, SSE broadcast) marks the row dismissed in the
  // notifications array but the burst snapshot keeps cycling. If we
  // killed the burst on "no active notif", a stray provider timer or
  // a desktop session's SSE broadcast would close the pill mid-cycle.

  // End the burst when the user opens the notification centre. The
  // bell handler also dismissAll()-s, so the queue is already
  // visually moved to the panel — keeping the snapshot cycling in
  // the background would have it pop back as a pill the moment the
  // user closes the panel. setBurst(null) drops the snapshot so
  // closing the panel reveals nothing (until a fresh notif arrives).
  useEffect(() => {
    if (suppressed && burst != null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- drop the burst snapshot once the notification centre opens
      setBurst(null);
    }
  }, [suppressed, burst]);
  // Start burst (with settling) when one isn't running and there's
  // an eligible notif on screen. The settling timer restarts every
  // time the effect re-runs (new arrival), so its callback fires
  // 100 ms after the LAST arrival — that's when we snapshot the
  // queue size.
  useEffect(() => {
    if (burst != null) return undefined;
    if (hasAndroidBridge()) return undefined;
    if (!current) return undefined;
    const dur = current.duration;
    if (typeof dur !== "number" || dur <= 0) return undefined;
    const h = setTimeout(() => {
      const fresh = notificationsRef.current;
      // Snapshot ids in chronological order (notifications is
      // newest-first, reverse for FIFO display).
      const eligibleIds = [];
      for (let i = fresh.length - 1; i >= 0; i--) {
        const n = fresh[i];
        if (n.dismissed) continue;
        if (n.persistent || typeof n.duration !== "number" || n.duration <= 0) continue;
        eligibleIds.push(n.id);
      }
      if (eligibleIds.length === 0) return;
      const slice =
        eligibleIds.length > 1
          ? Math.max(800, Math.floor(dur / eligibleIds.length))
          : dur;
      // Take ownership of every notif we're about to rotate
      // through: cancel each one's provider auto-dismiss timer so
      // it can't fire mid-burst. Combined with the snapshot below
      // ignoring the dismissed flag, this insulates the mobile
      // cycle from external dismissals (provider timer OR SSE
      // notification_delivered from a desktop session's bar end).
      if (cancelAutoDismiss) {
        for (const id of eligibleIds) {
          cancelAutoDismiss(id);
        }
      }
      setBurst({ ids: eligibleIds, cursor: 0, slice });
    }, 100);
    return () => {
      clearTimeout(h);
    };
    // notifications is in the dep array on purpose: the settle
    // timer must restart on every new arrival so it fires 100ms
    // after the LAST arrival of the burst, not 100ms after the
    // first. Once burst is set, the early return at the top makes
    // subsequent re-runs cheap no-ops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burst, current?.id, notifications]);

  useEffect(() => {
    if (current && current.id !== lastIdRef.current) {
      lastIdRef.current = current.id;
      if (hasAndroidBridge()) {
        try {
          window.AndroidToast.show(buildToastText(current), shouldUseLong(current));
        } catch { /* native toast unavailable: nothing else to show */ }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the native toast replaces the web pill when a new notification shows
        setVisible(false);
      } else {
        setVisible(true);
      }
    } else if (!current) {
      setVisible(false);
      lastIdRef.current = null;
    }
  }, [current]);

  // Cycler — advances the burst cursor after burstSlice ms. Anchored
  // on displayStartRef so remaining time is measured from the moment
  // the notif became visible. On fire we:
  //   1. dismissLocal the leaving notif (idempotent if already
  //      dismissed externally — provider's dispatch DISMISS no-ops on
  //      already-dismissed rows).
  //   2. advance burst.cursor; setBurst(null) when the snapshot is
  //      exhausted.
  // Provider state changes on the displayed id (e.g. SSE-driven
  // DISMISS_BY_SERVER_IDS from a desktop session's bar end) do NOT
  // affect the cycler because current is picked from burst.ids[cursor]
  // unconditionally.
  useEffect(() => {
    if (!current || hasAndroidBridge()) return undefined;
    if (!burst) return undefined;
    if (!burst.slice || burst.slice <= 0) return undefined;
    const elapsed = Date.now() - displayStartRef.current;
    const remaining = Math.max(0, burst.slice - elapsed);
    const id = current.id;
    const h = setTimeout(() => {
      dismissLocal(id);
      setBurst((b) => {
        if (!b) return null;
        const next = b.cursor + 1;
        if (next >= b.ids.length) return null;
        return { ...b, cursor: next };
      });
    }, remaining);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id: a new object for the same notification must not restart the slice timer
  }, [current?.id, burst, dismissLocal]);

  const showCountdown = !!(burstSlice && burstSlice > 0 && current);
  const countdownFillRef = useRef(null);
  // Detects the burstSlice null → value transition (settle just
  // fired) so we can reset displayStartRef. Without this, the
  // first notif of a burst is "visible without bar" during the
  // settling window (100–300ms), and when the bar finally appears
  // it's anchored on displayStart from BEFORE the settle, so it
  // starts at e.g. 19% depleted and the cycler shortens its slice
  // accordingly. Resetting at the settle moment realigns both.
  const prevBurstSliceRef = useRef(null);
  useLayoutEffect(() => {
    // Snapshot the previous value and update the ref UNCONDITIONALLY
    // before any early-return, otherwise renders where showCountdown
    // is false (between bursts) skip the update and the ref stays
    // pinned at the previous burst's slice — making the next
    // null→value transition look like value→value and skipping the
    // reset.
    const prevSlice = prevBurstSliceRef.current;
    prevBurstSliceRef.current = burstSlice;

    if (!showCountdown || !current) return;
    const el = countdownFillRef.current;
    if (!el) return;
    // burstSlice just became non-null → the bar is rendering for
    // the first time on this notif. Anchor "display start" at now
    // so the bar runs the full slice and the cycler does too.
    if (prevSlice == null && burstSlice != null) {
      displayStartRef.current = Date.now();
    }
    const elapsed = Math.max(
      0,
      Math.min(burstSlice, Date.now() - displayStartRef.current),
    );
    el.style.animationDelay = `-${elapsed}ms`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, burstSlice]);

  if (typeof document === "undefined") return null;
  if (hasAndroidBridge()) return null;
  if (!current || !visible) return null;
  if (suppressed) return null;

  const { Comp, filled } = pickGlyph(current);
  // Unified action list — prefer the multi-action `actions` field
  // (Accept/Reject on pending-user notifs, etc.), fall back to the
  // single `action` field. Matches the desktop card's behaviour so
  // multi-action notifs are usable from the floating pill, not just
  // from the panel.
  const actionList =
    Array.isArray(current.actions) && current.actions.length > 0
      ? current.actions
      : current.action
        ? [current.action]
        : [];
  const stacked = current.actionLayout === "below" && actionList.length > 0;
  const handleTap = () => {
    setVisible(false);
    remove(current.id);
  };
  const handleAction = (e, chosenAction) => {
    e.stopPropagation();
    // Forward both args — the App-level dispatcher branches on
    // chosenAction.kind for multi-action cards.
    if (onAction) onAction(current, chosenAction);
    setVisible(false);
    remove(current.id);
  };

  const node = (
    <div
      className={`gk-mobile-toast gk-mobile-toast--${current.variant || "info"}${stacked ? " gk-mobile-toast--stacked" : ""} gk-mobile-toast--anchor-${position === "top" ? "top" : "bottom"}`}
      role="status"
      onClick={handleTap}
    >
      <span className="gk-mobile-toast__icon" aria-hidden="true">
        <Comp
          className={`tabler-icon${filled ? " tabler-icon--filled" : ""}`}
          style={{ width: 18, height: 18 }}
        />
      </span>
      <span className="gk-mobile-toast__body">
        {current.title ? (
          <span className="gk-mobile-toast__title">{current.title}</span>
        ) : null}
        {current.message ? (
          <span className="gk-mobile-toast__message">
            {renderMessage(current.message)}
          </span>
        ) : null}
      </span>
      {actionList.length > 0 ? (
        <span className="gk-mobile-toast__actions">
          {actionList.map((a, i) => {
            const secondary =
              a.kind === "reject_pending_user" || a.variant === "secondary";
            return (
              <button
                key={i}
                type="button"
                className={`gk-mobile-toast__action${secondary ? " gk-mobile-toast__action--secondary" : ""}`}
                onClick={(e) => handleAction(e, a)}
              >
                {a.label}
              </button>
            );
          })}
        </span>
      ) : null}
      {showCountdown ? (
        <div className="gk-mobile-toast__countdown-clip" aria-hidden="true">
          <div className="gk-mobile-toast__countdown">
            {/* key={current.id} forces React to re-mount this DOM
                node every time the cycler advances. Without it, the
                bar element stays alive across cycles, its CSS
                animation has already run to scaleX(0), and changing
                style.animationDelay imperatively does NOT restart
                a completed animation. Remount = fresh animation
                from full to empty for every notif of the burst. */}
            <div
              key={current.id}
              ref={countdownFillRef}
              className="gk-mobile-toast__countdown-fill"
              style={{ animationDuration: `${burstSlice}ms` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );

  return createPortal(node, document.body);
}
