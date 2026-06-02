// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-512-maskable.png",
        "robots.txt"
      ],
      manifest: {
        name: "Glass Keep",
        short_name: "GlassKeep",
        description: "A lightweight notes app with Markdown, images, and offline support.",
        theme_color: "#f0e8ff",
        background_color: "#f0e8ff",
        display: "standalone",
        display_override: ["standalone"],
        scope: "/",
        start_url: "/",
        orientation: "portrait-primary",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // The main app chunk is ~2 MB (single bundle, not code-split) and
        // grows over time, which exceeds Workbox's default 2 MiB precache
        // ceiling — without this the chunk silently drops out of the
        // precache manifest and the PWA can't load offline. Raise it to
        // 3 MiB so the whole app shell is precached, with headroom.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Activate new SW immediately — critical for mobile PWAs where there
        // is only one "tab". Without this, a stale SW can stay in control
        // indefinitely after long background suspension on Android.
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
        // All /api/* requests bypass the Service Worker entirely.
        // On mobile, a suspended/stuck SW can intercept fetch and cause
        // AbortError timeouts even when the network is fine. API calls
        // are live data — caching them causes stale reads and sync bugs.
        // Only static assets (JS, CSS, images) benefit from SW caching.
        //
        // /.well-known/* is also excluded: Android's Digital Asset Links
        // verifier (used to authorise the native app for passkeys) hits
        // /.well-known/assetlinks.json and expects raw JSON, not the SPA
        // shell. Letting the SW return index.html here would break the
        // passkey association silently.
        navigateFallbackDenylist: [/^\/api\//, /^\/\.well-known\//],
        runtimeCaching: [],
        // Layer the Web Push handlers (push + notificationclick) onto the
        // generated service worker. This is Workbox's supported extension
        // point, so all the precache/offline behaviour above is preserved
        // untouched — we only ADD push handling. push-sw.js lives in
        // /public, so it ships to the dist root and is importScripts()'d
        // at /push-sw.js by the generated sw.js.
        importScripts: ["/push-sw.js"]
      }
      // devOptions: { enabled: true } // ← uncomment to test SW in dev (remember to disable later)
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true
      }
    }
  }
});
