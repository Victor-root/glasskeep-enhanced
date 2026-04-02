// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

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
        theme_color: "#4f46e5",
        background_color: "#ffffff",
        display: "standalone",
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
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: []
      }
      // devOptions: { enabled: true } // ← uncomment to test SW in dev (remember to disable later)
    })
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true
      }
    }
  }
});
