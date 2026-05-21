// Single notification card. Used by both the viewport (top-of-screen
// floating stack) and the notification center (history list).
//
// Visual structure: variant-coloured left border + variant chip icon,
// optional title, message body, optional action button, optional close
// button. The card is rendered as plain text — React escapes children,
// so no HTML injection is possible from title/message/sender values
// the server returns to us.

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

export default function NotificationCard({
  notification,
  onDismiss,
  onAction,
  // When rendered inside the notification center we don't want a slide
  // animation (the user just opened the panel) and the layout is a bit
  // tighter. Toggle via `compact`.
  compact = false,
}) {
  if (!notification) return null;
  const { id, title, message, variant, dismissible, action } = notification;
  const klass = VARIANT_CLASS[variant] || VARIANT_CLASS.info;

  return (
    <div
      role="status"
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={`gk-notif-card ${klass}${compact ? " gk-notif-card--compact" : ""}`}
    >
      <span className="gk-notif-card__glyph" aria-hidden="true">
        {VARIANT_GLYPH[variant] || VARIANT_GLYPH.info}
      </span>
      <div className="gk-notif-card__body">
        {title ? <div className="gk-notif-card__title">{title}</div> : null}
        {message ? (
          <div className="gk-notif-card__message">{message}</div>
        ) : null}
        {action ? (
          <div className="gk-notif-card__actions">
            <button
              type="button"
              className="gk-notif-card__action-btn"
              onClick={() => onAction && onAction(notification)}
            >
              {action.label}
            </button>
          </div>
        ) : null}
      </div>
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
    </div>
  );
}
