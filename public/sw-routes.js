/* public/sw-routes.js
 *
 * Layered onto the Workbox-generated service worker through
 * `workbox.importScripts` in vite.config.js, like push-sw.js.
 *
 * Every request from a page this worker controls is dispatched to it, /api
 * included, because the precache registers a fetch handler: the worker has
 * to be up and responsive before a request can even reach the network. A
 * worker left in a bad state after a long background freeze then took the
 * whole API down with it, page reloads included, until the app was killed.
 *
 * The Static Routing API (Chrome / WebView 123+) sends /api straight to the
 * network without waking the worker at all. API responses are live data the
 * worker never handles anyway. Browsers without it keep the previous
 * behaviour.
 */
self.addEventListener("install", (event) => {
  if (typeof event.addRoutes !== "function") return;
  event.waitUntil(
    event
      .addRoutes({ condition: { urlPattern: "/api/*" }, source: "network" })
      .catch(() => {}),
  );
});
