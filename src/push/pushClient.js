// src/push/pushClient.js
//
// Client side of Web Push for the note-reminders feature. Wraps the
// browser PushManager + the server's /api/push/* endpoints behind a few
// small, well-defined helpers so the Settings toggle (and anywhere else)
// can enable/disable push without touching the plumbing.
//
// Everything degrades gracefully: unsupported browsers, denied
// permission, and a server with no VAPID keys all return a clear status
// instead of throwing, so reminders' in-app notifications keep working
// regardless.

import { api } from "../utils/api.js";

// True when the browser has the APIs Web Push needs. Note: on iOS this is
// only true inside an installed (home-screen) PWA, never in a Safari tab.
export function isPushSupported() {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// "granted" | "denied" | "default" | "unsupported"
export function getPushPermission() {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

// VAPID public keys are base64url; PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function getRegistration() {
  // The SW is registered by main.jsx (vite-plugin-pwa). Wait for it to be
  // active so pushManager is usable.
  return navigator.serviceWorker.ready;
}

// Is this device currently subscribed? (best-effort, never throws)
export async function isPushEnabledHere() {
  if (!isPushSupported()) return false;
  try {
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

// Turn push ON for this device. Returns:
//   { ok: true }
//   { ok: false, reason: "unsupported" | "unconfigured" | "denied" | "error" }
export async function enablePush(token) {
  if (!isPushSupported()) {
    console.log("[push] enable: unsupported browser");
    return { ok: false, reason: "unsupported" };
  }
  try {
    // 1. Server must have VAPID keys configured.
    const { key } = await api("/push/vapid-public-key", { token });
    if (!key) {
      console.log("[push] enable: server has no VAPID keys (unconfigured)");
      return { ok: false, reason: "unconfigured" };
    }

    // 2. Ask the user (must be triggered by a user gesture — the Settings
    //    toggle click qualifies).
    const permission = await Notification.requestPermission();
    console.log("[push] enable: permission =", permission);
    if (permission !== "granted") {
      return { ok: false, reason: permission === "denied" ? "denied" : "default" };
    }

    // 3. Subscribe (reuse an existing subscription if present).
    const reg = await getRegistration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }

    // 4. Hand the subscription to the server.
    await api("/push/subscribe", {
      method: "POST",
      token,
      body: { subscription: sub.toJSON() },
    });
    console.log("[push] enable: subscribed OK", sub.endpoint?.slice(0, 48) + "…");
    return { ok: true };
  } catch (e) {
    console.warn("[push] enable: error", e?.message);
    return { ok: false, reason: "error", error: e?.message };
  }
}

// Turn push OFF for this device: unsubscribe locally and drop the row
// server-side. Best-effort and idempotent.
export async function disablePush(token) {
  if (!isPushSupported()) return { ok: true };
  try {
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      try {
        await sub.unsubscribe();
      } catch {
        /* ignore — still drop server-side */
      }
      await api("/push/unsubscribe", {
        method: "POST",
        token,
        body: { endpoint },
      }).catch(() => {});
      console.log("[push] disable: unsubscribed");
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "error", error: e?.message };
  }
}
