// Single notification card. macOS Notification Centre styling with
// the app's violet/blue/pink gradient + heavy blur instead of a flat
// white surface — see globalCSS.
//
// Message content can be a plain string OR contain `**bold**` markers
// (parsed into <strong> spans). React escapes the surrounding text
// children, so title / message / label remain XSS-safe even when the
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

// Glyph rendered as the variant indicator. Info gets the filled
// info-circle Tabler icon — rendered ungrouped (no coloured square
// behind it) so it reads as a free-floating "i" inside the circle.
// success has no glyph (the plain white card communicates "all good"
// on its own); error / warning keep the punchy "!" inside their
// chip background.
function VariantGlyph({ variant }) {
  if (variant === "info") {
    return (
      <TI.InfoCircleFilled
        className="tabler-icon tabler-icon--filled gk-notif-card__icon-glyph"
      />
    );
  }
  if (variant === "error" || variant === "warning") {
    return <span aria-hidden="true">!</span>;
  }
  return null;
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
  if (typeof message !== "string") return message; // already a React node
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
  // "left" (default) places the close button on the top-left corner;
  // "right" flips it to the top-right.
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

      {/* Timestamp sits in its own absolutely-positioned slot in the
          card's top-right corner so it stays put whether or not an
          action button is rendered. The action button's column would
          otherwise squeeze the header into a half-width strip. */}
      {time ? <span className="gk-notif-card__time">{time}</span> : null}

      <span className="gk-notif-card__icon" aria-hidden="true">
        <VariantGlyph variant={variant} />
      </span>

      <div className="gk-notif-card__body">
        <div className="gk-notif-card__header">
          <span className="gk-notif-card__label">{t("appName")}</span>
        </div>
        {title ? <div className="gk-notif-card__title">{title}</div> : null}
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
