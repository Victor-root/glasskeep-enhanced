import React, { useEffect, useState } from "react";
import { t } from "../../i18n";
import TI from "../../icons/editor/index.jsx";
import { RowIcon } from "../common/SettingsAccordion.jsx";
import {
  isPushSupported,
  getPushPermission,
  isPushEnabledHere,
  enablePush,
  disablePush,
} from "../../push/pushClient.js";

// Detect iOS so we can explain the "add to Home Screen" requirement —
// Web Push on iOS only works inside an installed PWA (iOS 16.4+).
function isIos() {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports as Mac; detect the touch-capable variant.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// The Android app is a plain WebView (it injects window.AndroidTheme).
// WebView has no Web Push API, so push can't work there — only in the
// PWA installed via Chrome. Detect it to show a clearer message.
function isAndroidWebView() {
  return typeof window !== "undefined" && !!window.AndroidTheme;
}

// Pick the right "why is push unavailable" message for this platform.
function unsupportedNote() {
  if (isAndroidWebView()) return "pushUnsupportedWebview";
  if (isIos()) return "pushUnsupportedIos";
  return "pushUnsupported";
}

/**
 * Self-contained Settings row that enables/disables Web Push on this
 * device. Lives in the Notifications section. Degrades to an explanatory
 * line (disabled toggle) when push is unsupported, blocked, or the server
 * has no VAPID keys — the in-app reminders work regardless.
 */
export default function PushNotificationToggle({ token }) {
  const [supported] = useState(() => isPushSupported());
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // explanatory sub-line key

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supported) {
        setNote(unsupportedNote());
        return;
      }
      if (getPushPermission() === "denied") setNote("pushDenied");
      const on = await isPushEnabledHere();
      if (!cancelled) setEnabled(on);
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const handleToggle = async () => {
    if (busy || !supported) return;
    setBusy(true);
    setNote(null);
    try {
      if (!enabled) {
        const res = await enablePush(token);
        if (res.ok) {
          setEnabled(true);
        } else {
          setEnabled(false);
          if (res.reason === "denied") setNote("pushDenied");
          else if (res.reason === "unconfigured") setNote("pushUnconfigured");
          else if (res.reason === "unsupported") setNote(unsupportedNote());
          else if (res.reason === "default") setNote("pushDenied");
          else setNote("pushEnableError");
        }
      } else {
        await disablePush(token);
        setEnabled(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const disabled = !supported || busy;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <RowIcon icon={TI.Bell} />
          <div className="min-w-0">
            <div className="font-medium">{t("pushNotifTitle")}</div>
            <div className="text-sm text-gray-500">{t("pushNotifDesc")}</div>
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
            enabled ? "bg-[var(--gk-switch-on)]" : "bg-gray-300 dark:bg-gray-600"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={handleToggle}
          aria-pressed={enabled}
          aria-label={t("pushNotifTitle")}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {note && (
        <p className="text-xs text-gray-500 dark:text-gray-400 px-3 pb-1 ml-10">
          {t(note)}
        </p>
      )}
    </div>
  );
}
