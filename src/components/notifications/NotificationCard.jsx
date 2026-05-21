// Single notification card. Designed in the macOS Notification Centre
// style: heavy backdrop blur, very translucent background so the
// underlying UI tints through, soft rounded corners, app-style header
// (variant chip + label + relative timestamp), bold title, message,
// and a pill action on the right. The close button sits at the
// top-left corner and only reveals on hover (always visible on touch
// devices because there's no hover state to reveal it).
//
// String content is rendered as text children — React escapes, so
// title/message/label are XSS-safe even when the values originate
// from the server.

import React from "react";
import { t } from "../../i18n";

const VARIANT_CLASS = {
  success: "gk-notif-card--success",
  error: "gk-notif-card--error",
  warning: "gk-notif-card--warning",
  info: "gk-notif-card--info",
};

const VARIANT_GLYPH = {
  success: "✓",
  error: "!",
  warning: "!",
  info: "i",
};

// Reused by NotificationCenter too — we re-export so the center can
// fall back to the same relative-time format the card uses, keeping
// "à l'instant" / "il y a 5 min" formatting consistent.
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

export default function NotificationCard({
  notification,
  onDismiss,
  onAction,
  compact = false,
  // "left" (default) places the close button on the top-left corner;
  // "right" flips it to the top-right. The viewport picks the side
  // opposite its anchor edge so the X never sits flush against the
  // screen border. The notification center always passes "left" to
  // stay consistent inside the right-anchored panel.
  closeSide = "left",
}) {
  if (!notification) return null;
  const { id, title, message, variant, dismissible, action, createdAt } =
    notification;
  const klass = VARIANT_CLASS[variant] || VARIANT_CLASS.info;
  const closeKlass =
    closeSide === "right" ? " gk-notif-card--close-right" : "";
  const time = formatRelativeTime(createdAt);

  return (
    <div
      role="status"
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={`gk-notif-card ${klass}${compact ? " gk-notif-card--compact" : ""}${closeKlass}`}
    >
      {dismissible !== false ? (
        <button
          type="button"
          aria-label={t("close")}
          className="gk-notif-card__close"
          onClick={() => onDismiss && onDismiss(id)}
        >
          ✕
        </button>
      ) : null}

      <span className="gk-notif-card__icon" aria-hidden="true">
        {VARIANT_GLYPH[variant] || VARIANT_GLYPH.info}
      </span>

      <div className="gk-notif-card__body">
        <div className="gk-notif-card__header">
          <span className="gk-notif-card__label">{t("appName")}</span>
          {time ? <span className="gk-notif-card__time">{time}</span> : null}
        </div>
        {title ? <div className="gk-notif-card__title">{title}</div> : null}
        {message ? (
          <div className="gk-notif-card__message">{message}</div>
        ) : null}
      </div>

      {action ? (
        <button
          type="button"
          className="gk-notif-card__action-btn"
          onClick={() => onAction && onAction(notification)}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
