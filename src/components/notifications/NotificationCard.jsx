// Single notification card. macOS Notification Centre styling with
// the app's violet/blue/pink gradient + heavy blur instead of a flat
// white surface — see globalCSS.
//
// Layout:
//   [variant icon]  [title]                     [time]
//                   [message]               [action btn]
//
// The `title` field is what "presents" the notification (the user
// renamed the previous "GlassKeep" header into a per-notification
// title). Every notification should carry one — the fallback below
// uses the variant name so a malformed dispatch still looks correct
// instead of dropping the header entirely.
//
// Message content can be a plain string OR contain `**bold**` markers
// (parsed into <strong> spans). React escapes the surrounding text
// children, so title / message / sender remain XSS-safe even when the
// values originate from the server.

import React from "react";
import TI from "../../icons/editor/index.jsx";
import { t } from "../../i18n";

const VARIANT_CLASS = {
  success: "gk-notif-card--success",
  error: "gk-notif-card--error",
  warning: "gk-notif-card--warning",
  info: "gk-notif-card--info",
};

// Filled Tabler icon used as the variant indicator. No coloured chip
// background — the icon itself carries the variant colour via the
// `--filled` CSS class which lets fill: currentColor through. Each
// variant uses the canonical Tabler glyph for its semantic.
function VariantGlyph({ variant }) {
  const className = "tabler-icon tabler-icon--filled gk-notif-card__icon-glyph";
  if (variant === "success") return <TI.CircleCheckFilled className={className} />;
  if (variant === "warning") return <TI.AlertTriangleFilled className={className} />;
  if (variant === "error") return <TI.AlertCircleFilled className={className} />;
  return <TI.InfoCircleFilled className={className} />;
}

// Sensible per-variant fallback title for callers that forgot to set
// one. Keeps the header occupied so the layout never collapses.
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

// Tiny `**bold**` parser used by message rendering — lets callers
// emphasise a single substring (a note title, a username, …) without
// having to pass a React node through the provider state. Only `**`
// is recognised; everything else is rendered as plain text so a
// stray asterisk in user content can't generate unexpected markup.
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

export default function NotificationCard({
  notification,
  onDismiss,
  onAction,
  compact = false,
  closeSide = "left",
}) {
  if (!notification) return null;
  const { id, title, message, variant, dismissible, action, createdAt } =
    notification;
  const klass = VARIANT_CLASS[variant] || VARIANT_CLASS.info;
  const closeKlass =
    closeSide === "right" ? " gk-notif-card--close-right" : "";
  const time = formatRelativeTime(createdAt);
  const headline = title || fallbackTitle(variant);

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

      {time ? <span className="gk-notif-card__time">{time}</span> : null}

      <span className="gk-notif-card__icon" aria-hidden="true">
        <VariantGlyph variant={variant} />
      </span>

      <div className="gk-notif-card__body">
        <div className="gk-notif-card__title">{headline}</div>
        {message ? (
          <div className="gk-notif-card__message">{renderMessage(message)}</div>
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
