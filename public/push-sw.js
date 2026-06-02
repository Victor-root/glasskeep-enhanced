/* public/push-sw.js
 *
 * Web Push handlers for the note-reminders feature.
 *
 * This file is layered onto the Workbox-generated service worker via
 * `workbox.importScripts` in vite.config.js — the officially supported
 * way to add custom logic to a generateSW service worker. It stays a
 * plain classic worker script (no imports / no bundling) so the generated
 * sw.js can importScripts() it at runtime. None of the existing offline /
 * precache behaviour is touched; this only ADDS push + click handling.
 */

// A reminder (or any server push) arrives. Show a system notification.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Glass Keep";
  const options = {
    body: data.body || "",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    // `tag` + `renotify` collapse repeat reminders for the same note into
    // one entry instead of stacking duplicates in the tray.
    tag: data.tag || undefined,
    renotify: data.tag ? true : undefined,
    data: { noteId: data.noteId || null },
  };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // De-dupe: if an app window is visible on THIS device, the in-app
        // SSE notification already shows this reminder — skip the system
        // notification so the user doesn't see it twice. Other devices
        // (app closed) still get the system push. (Showing nothing on an
        // occasional focused push is within Chrome's userVisibleOnly
        // budget; the common, accepted pattern for foreground de-dupe.)
        const appVisible = clients.some((c) => c.visibilityState === "visible");
        if (appVisible) return undefined;
        return self.registration.showNotification(title, options);
      }),
  );
});

// Tapping the notification focuses an open app window (or opens one).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const noteId = event.notification.data && event.notification.data.noteId;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            // Best-effort: let a live app instance open the note. The app
            // may ignore this message; focusing the window is the
            // guaranteed behaviour.
            if (noteId && "postMessage" in client) {
              client.postMessage({ type: "gk-open-note", noteId: String(noteId) });
            }
            return undefined;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow("/");
        }
        return undefined;
      }),
  );
});
