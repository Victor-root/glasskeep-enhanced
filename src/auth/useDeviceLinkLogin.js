// src/auth/useDeviceLinkLogin.js
//
// The device side of the cross-device QR sign-in: creates a challenge,
// draws its QR code, polls until a signed-in phone approves it, and counts
// down to its expiry. Shared by the desktop panel and the TV login, which
// only differ in how they show it. onLoggedIn receives the
// `/api/device-link/poll` payload, the shape `completeLogin` takes.

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { t } from "../i18n";
import { createDeviceLink, pollDeviceLink, buildLinkUrl } from "./deviceLinkClient.js";

// Don't poll harder than this regardless of what the server returns
// in `pollIntervalMs`: keeps a rogue server config from DoS-ing
// itself with a 100 ms interval.
const MIN_POLL_INTERVAL_MS = 1000;

/** `{ status, qrDataUrl, errorText, secondsLeft, generate }`, status being
 *  loading | pending | approved | expired | rejected | error. */
export default function useDeviceLinkLogin(onLoggedIn) {
  const tokenRef = useRef(null);
  const [linkToken, setLinkToken] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [pollIntervalMs, setPollIntervalMs] = useState(2000);

  const [status, setStatus] = useState("loading");
  const [errorText, setErrorText] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(null);

  const generate = useCallback(async () => {
    setStatus("loading");
    setErrorText("");
    setQrDataUrl(null);
    setLinkToken(null);
    tokenRef.current = null;
    try {
      const created = await createDeviceLink();
      tokenRef.current = created.token;
      setLinkToken(created.token);
      setExpiresAt(created.expiresAt);
      setPollIntervalMs(
        Math.max(MIN_POLL_INTERVAL_MS, Number(created.pollIntervalMs) || 2000),
      );
      const url = buildLinkUrl(created.token);
      const data = await QRCode.toDataURL(url, {
        margin: 1,
        width: 320,
        errorCorrectionLevel: "M",
        color: { dark: "#1f1f1f", light: "#ffffff" },
      });
      setQrDataUrl(data);
      setStatus("pending");
    } catch (e) {
      setErrorText((e && e.message) || "Network error");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- request a fresh link token and QR code on mount
    generate();
    return () => {
      tokenRef.current = null;
    };
  }, [generate]);

  // Polling loop, bound to the current token.
  useEffect(() => {
    if (!linkToken || status !== "pending") return undefined;
    let cancelled = false;
    const tick = async () => {
      const t0 = tokenRef.current;
      if (cancelled || !t0 || t0 !== linkToken) return;
      try {
        const r = await pollDeviceLink(t0);
        if (cancelled || tokenRef.current !== t0) return;
        if (r.status === "approved" && r.token && r.user) {
          setStatus("approved");
          queueMicrotask(() => {
            try { onLoggedIn?.(r); } catch { /* parent decides */ }
          });
        } else if (r.status === "expired") {
          setStatus("expired");
        } else if (r.status === "rejected") {
          setStatus("rejected");
        } else if (r.status === "consumed") {
          setStatus("expired");
        }
      } catch (e) {
        if (e?.status === 404 || e?.status === 410) {
          setStatus("expired");
          return;
        }
        // Transient network blip: keep polling on the next tick.
      }
    };
    const id = setInterval(tick, pollIntervalMs);
    const kick = setTimeout(tick, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(kick);
    };
  }, [linkToken, status, pollIntervalMs, onLoggedIn]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the countdown when there is no expiry, then tick it every second
    if (!expiresAt) { setSecondsLeft(null); return undefined; }
    const update = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.round(ms / 1000)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return { status, qrDataUrl, errorText, secondsLeft, generate };
}

/** The status line under the QR code: `{ text, tone }`, tone being
 *  muted | error | success. The countdown, when there is one, is
 *  `countdown`, apart for a caller to set it in tabular figures. */
export function qrStatusMessage(status, errorText, secondsLeft) {
  switch (status) {
    case "loading":
      return { text: t("qrLoginGenerating"), tone: "muted" };
    case "error":
      return { text: errorText || t("qrLoginError"), tone: "error" };
    case "pending":
      return {
        text: t("qrLoginWaiting"),
        countdown: secondsLeft != null ? t("qrLoginExpiresIn").replace("%s", String(secondsLeft)) : null,
        tone: "muted",
      };
    case "approved":
      return { text: t("qrLoginApproved"), tone: "success" };
    case "rejected":
      return { text: t("qrLoginRejected"), tone: "error" };
    case "expired":
      return { text: t("qrLoginExpired"), tone: "muted" };
    default:
      return null;
  }
}
