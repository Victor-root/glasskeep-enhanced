# 📋 Changelog

## 🚀 v2.3.8 — 2026-05-19

The headline change is **"Read mode for notes"** — a per-user toggle that lets you opt out of the read/edit split entirely and have your text and drawing notes open straight in edit mode, Google-Keep style. The rest of the release is a polish pass on the Settings and Admin side sheets.

### ➕ Added
- 👁 **"Read mode for notes" toggle** — when off, text and drawing notes open directly in edit mode and the read/edit button is hidden from the modal footer; ideal for users who edit far more often than they re-read. Default stays on so existing users keep the read-by-default behaviour. Saved server-side, applied across all your devices
- 🪟 **Collapsible categories** in the Settings and Admin panels — open/closed state per category persisted in `localStorage` and synced via `PATCH /user/settings`
- 📐 **Configurable sidebar breakpoint** — the "Always show sidebar on wide screens" threshold is now a 5-preset dropdown (Tablet → Desktop, default 1280 px) instead of the hard-coded 700 px

### 🐛 Fixed
- 🧷 **Hidden accordion content marked `aria-hidden` + `inert`** so screen readers and Tab navigation skip it

### 🛠️ Upgrade

**Native install:**
```bash
curl -fsSL https://raw.githubusercontent.com/Victor-root/glasskeep-enhanced/main/install.sh | sudo bash
```

## 🚀 v2.3.7 — 2026-05-18

This release brings **passkey support to the native Android app** — fingerprint, face unlock, hardware security keys and password managers (Google Password Manager, 1Password, Bitwarden…) now work from inside the APK the same way they do in a browser. Full setup guide and the reverse-proxy edge cases live in [`PASSKEYS.md`](./PASSKEYS.md).

> ⚠️ **Both sides must be on v2.3.7+** — the Android features in this release (passkeys + cross-device QR sign-in) rely on new server endpoints. Update the server **and** install APK `1.3.0+` on every device that should benefit from them. Running APK `1.3.0` against an older server (or the new server against an older APK) will silently fall back to password-only login.

### ➕ Added
- 📱 **Cross-device QR sign-in** — log in on a borrowed PC without typing your password. The login screen now has a "Sign in with a QR code" button; the GlassKeep app on a phone you're already signed in on can scan it (Settings → "Sign in another device"), show a confirmation card with the PC's browser / IP, and approve. The PC's poll picks up a fresh JWT a couple of seconds later. Single-use 2-minute tokens, origin-bound (the phone refuses to approve QRs that point at a different GlassKeep instance), and approval requires the phone to be authenticated — a stolen QR alone gets you nothing
- 🔑 **Native Android passkey support** — `androidx.credentials` bridge wired into the WebView so `navigator.credentials.create / get` routes through Android's Credential Manager instead of the (gimped) in-WebView WebAuthn stack
- 📖 **[`PASSKEYS.md`](./PASSKEYS.md) guide** — full walkthrough covering Madame-Michu setup, the non-standard-port reverse-proxy trap (with apache/nginx/caddy snippets), custom-build path, and an error-to-cause troubleshooting matrix
- 🚀 **Android launcher shortcuts** — long-press the app icon on the home screen for a quick-action menu: "Scanner QRCODE" (jumps straight to the QR scanner for PC sign-in), "Nouvelle note texte", "Nouvelle liste", "Nouvelle note audio". Each shortcut shipped as an adaptive icon so the rendering is consistent across Pixel / AOSP / Samsung / Oppo launchers

### 🔄 Changed
- 📱 **Mobile toasts now span the viewport** — long messages no longer crammed into a 384px column with empty gutters on each side; desktop layout untouched
- 📐 **Passkey settings section rescaled for mobile** — description and "Add a passkey" button now stack vertically (text gets the full container width, button stretches across the row on phones) instead of cramming the text into an 18ch column to the left of an inline button
- 🖥️ **Passkey list rows use full desktop width** — action buttons (Test / Rename / Delete) used to stack underneath the row info on desktop too, wasting a huge empty band on the right; rows now flip to a side-by-side layout at md:+ with actions aligned right
- 🔐 **Login screen surfaces passkey + QR buttons on the profile picker** — both shortcuts used to be hidden behind the "Manual login" link when the avatar grid was visible; they now sit right under the avatars, one tap away
- 🪟 **Themed dialogs are fully opaque** — passkey naming / confirmation modals drop the 95%-alpha + backdrop-blur in favour of solid `bg-white` / `bg-[#282828]` + a 1px card border, so the underlying settings panel stops bleeding through the dialog
- 🍔 **Kebab dropdown rescaled** — width follows the longest item (`w-max` capped at 95vw mobile / 360px desktop), each entry stays on one line (`whitespace-nowrap`), and items grow on mobile (`text-base`, `py-3.5`, `gap-3`) to give a fingertip-friendly tap target. Anchored over the kebab dots on mobile so opening the menu visually replaces the button
- 🌍 **Language picker promoted to its own section** — lives below "Checklist settings" instead of riding alongside the profile / password rows
  
### 🐛 Fixed
- 📐 **Edge-to-edge insets fixed on Android 15 WebView** — the stock Pixel WebView returns 0 for `env(safe-area-inset-*)` even in edge-to-edge mode, which left the FAB partially behind the navigation bar and the header floating under the status bar. The Activity now injects the real system-bar insets as CSS custom properties (`--android-inset-*`) read via a single `--safe-*` indirection across the whole app; the existing `env()` chain is kept as the fallback for browser / PWA contexts
- 📦 **`displayCutout` no longer overcounts the status bar** — punch-hole Pixel devices report a `displayCutout.top` a few dp taller than the visible status bar, so `maxOf(bars.top, cutout.top)` pushed the header below the actual bar bottom edge. Use `systemBars().top` directly to match Chromium's own `env()` math
- 🌍 **Untranslated "user cancelled the request" toast** — Credential Manager surfaces cancellation under several exception classes and in the user's system locale, so the prior regex (English-only `cancelled` / `aborted`) missed `canceled` (US), `annulé` (FR), `interrupted`, etc. The bridge now flags any CANCEL/INTERRUPT exception type as `NotAllowedError` and the JS fallback regex covers the remaining variants
- 🛠 **Restart / shutdown server errors localized** — `AdminPanel` now routes the server's English error text through `localizeServerError` so the admin sees a translated toast instead of the raw `data.error` string
- 🔗 **Changelog links open in the system browser** — clicking a markdown link inside the in-app changelog (e.g. the `PASSKEYS.md` reference) used to navigate the WebView to a path the SPA didn't know about and dump the user on the home screen. Relative paths now resolve against the GitHub repo and open externally via the new `AndroidTheme.openExternalUrl` bridge (with `window.open` as the browser fallback)
- 🪟 **External links open as Custom Tabs overlay** — instead of cold-launching the user's browser app (notes' external links, changelog references, …), the Android shell now uses `androidx.browser.customtabs.CustomTabsIntent`. The page appears as an overlay on top of GlassKeep with the user's default browser engine (Chrome / Brave / Firefox), back returns straight to the app, and session cookies follow them. Falls back to the legacy `ACTION_VIEW` intent on devices without a Custom Tabs provider
- 🪟 **Every dialog is fully opaque** — admin restart / shutdown progress, password change, generic confirm, delete confirm, remove-collaborator confirm, logo picker, and footer popovers now sit on solid `bg-white` / `bg-[#282828]` instead of 95–98 % alpha + backdrop blur, so the underlying panel never bleeds through
- 🌗 **Dark mode preserved across pull-to-refresh** — Android WebView's `matchMedia("(prefers-color-scheme: dark)")` always returns `false`, so refreshing while the system was in dark mode booted the app in light and stuck there. The Activity now plants `window.__isAndroidDarkMode` in `onPageStarted` (before React mounts) and the dark-mode init prefers that flag over `matchMedia`
- 📍 **Sync popover centred on mobile** — was positioned `absolute right-0` relative to a 40 px-wide icon wrapper, pushing 320 px of content off the left side of the screen. Switched to `fixed left-1/2 -translate-x-1/2` on mobile (anchored to the button on desktop)
- 📅 **Changelog modal renders full-screen on mobile + no horizontal scrollbar** — long code spans / URLs no longer push the page wider than the modal; `overflow-wrap: anywhere` + `white-space: pre-wrap` on the prose CSS contain everything, and `overflow-x: hidden` on the content container is the belt-and-braces guard
- 📋 **Changelog modal header respects the Android status bar** — on mobile fullscreen the modal sat edge-to-edge so the system status bar overlapped the title and clipped the close button. The header now applies `paddingTop: calc(var(--safe-top) + 0.75rem)`, leaving the desktop card untouched (`--safe-top` resolves to 0 there)
- ⬅️ **Android back button closes the changelog + the AI chat panel** — both overlays were missing from the central back-handling stack in `App.jsx`, so pressing back on Android while either was open backgrounded the entire app instead of dismissing the overlay. Lifted both states up and wired them through the existing `overlayOpenCount` + popstate machinery alongside the other 21 modals
- 🪪 **Login response shape now consistent across every sign-in method** — passkey login responses were missing the user's `language` preference, change-password was missing it too, and password + secret-key login flows returned `must_change_password` only when true while the other flows always returned a boolean. Aligned all five endpoints (`/api/login`, `/api/login/secret`, `/api/passkeys/login/verify`, `/api/passkeys/login/verify-and-unlock`, `/api/user/change-password`) so client-side auth state never silently loses fields after a sign-in
- 🛡️ **Admin settings persisted across server restarts** — `allowNewAccounts` and `loginSlogan` lived in a process-memory object seeded from the `ALLOW_REGISTRATION` env var at boot. Any value an admin set via the panel survived only until the next restart, after which the flag silently reverted and the login slogan went blank. Now stored in a new singleton `app_settings` table; the in-memory mirror stays for fast reads on the hot paths (every login-page hit reads the slogan) but writes also go to disk
- 🌐 **AI translation of the changelog stopped truncating on small models** — once `CHANGELOG.md` grew past ~3500 input tokens, small self-hosted LLMs (typical 7B/4B at 8K context) silently switched from translating line-by-line to *summarising* the file to fit the context. The changelog is now split on `## v...` headings and each section translated in its own prompt with `maxTokens=1500` — small models always have plenty of headroom. Per-section cache too: bumping a version only re-translates the new section, every older release stays an instant cache hit
- 🖼️ **Maskable PWA icon for Android** — `pwa-512-maskable.png` was a byte-for-byte copy of `pwa-512.png` with the squircle baked in, so Android composed its own adaptive mask on top and rendered the installed PWA as a violet logo on a white background instead of the proper full-bleed gradient. Regenerated as a true maskable: full-bleed gradient interpolated from the original's corner samples, with the white notepad foreground confined to the safe zone
- 🇫🇷 **Missing French translation on the secret-key login screen** — "Remember your credentials?" was hard-coded English; now routed through `t("rememberCredentials")` with the French string added

### 🛠️ Upgrade

**Native install:**
```bash
curl -fsSL https://raw.githubusercontent.com/Victor-root/glasskeep-enhanced/main/install.sh | sudo bash
```

## 🚀 v2.3.6 — 2026-05-16

### ➕ Added
- 🌍 **Language picker in settings** — themed dropdown to override the auto-detected language (Automatic / Français / English), saved server-side and synced via `PATCH /user/profile`
- 🔁 **Server restart button** in the admin panel — confirmation modal, in-progress spinner, post-restart countdown, automatic hard refresh
- ⛔ **Server shutdown button** in the admin panel — same UX, polls until the server is unreachable before confirming
- 📶 **Server-unreachable indicator** — the amber "offline" badge now also appears when the browser is online but the server can't be reached
- 💬 **Clearer AI test-connection errors** — surfaces the provider's actual error message, with human-readable hints for common HTTP status codes (401 invalid key, 405 wrong base URL, 429 rate limit, etc.)

### 🔄 Changed
- 🌐 **Smarter browser-language detection** — now reads the user's prioritized list (`navigator.languages`) instead of just the browser UI locale, so Firefox / Chromium users whose preferred content language differs from the UI get the right locale automatically
- 🗄️ **HTTP caching tuned for local-first** — `stale-if-error` lets the cached app shell survive a server outage so notes remain accessible offline

### 🐛 Fixed
- 🍎 **iOS checklist keyboard bug** — tapping a section title on iPhone / iPad no longer makes the keyboard pop up and immediately close
- 🔕 **Suppressed spurious "Request timed out" toasts** on page load when the server is unreachable (the offline indicator already covers it)

### 🛠️ Upgrade

**Native install:**
```bash
curl -fsSL https://raw.githubusercontent.com/Victor-root/glasskeep-enhanced/main/install.sh | sudo bash
```

## 🚀 v2.3.5 — 2026-05-15

### ➕ Added
- ⚡ One-click in-app update from the admin panel (native + Docker)
- 🔘 "Update manually" toggle for the raw curl / docker compose commands
- 📖 "View changelog" button in the admin panel
- 📊 Live RAM / Swap / CPU gauges during a native update
- 🛑 Cancel button with snapshot-based rollback
- 🎉 Auto-pop changelog modal after a successful update
- 🌍 AI translation of the changelog with live streaming
- 🛠️ Expert "Show details" panel with the raw update log
- 🧠 Smart Node heap sizing using RAM + swap so small hosts don't OOM
- 💡 Friendly failure hints (OOM, network, permissions, disk full)
- ⚙️ `UPDATE_BRANCH` / `UPDATE_BUILD_HEAP_MB` env vars for advanced setups

### 🔄 Changed
- 📦 `install.sh` now ships a dedicated `glass-keep-updater.service`
- 🐳 `docker-compose.yml` mounts the Docker socket out of the box
- 🔒 Update dismissal is now server-side, so the modal doesn't re-pop in private browsing or on another device

### 🐛 Fixed
- ✨ Various polish and minor bug fixes

## v2.3.0 — 2026-05-13

This release introduces **Android TV support** in the companion GlassKeep Enhanced Android app, along with a full branding refresh across the project.

### ✨ Added
- 📺 **Android TV support** — the existing APK now detects leanback hardware and automatically switches to a dedicated TV layout
- 🧭 **TV-optimized navigation** — Pinterest-style grid, D-pad spatial navigation, sidebar, detail viewer, and profile-picker login flow
- 🎨 **Refreshed master logo** — new branding applied consistently across the whole project
- 🌐 **Updated web assets** — refreshed favicon (`.ico` + 16/32 PNGs), PWA icons (192 / 512 / maskable), and Apple touch icon
- 📱 **Updated Android assets** — refreshed launcher icons (5 densities + adaptive foreground)
- 📺 **Updated Android TV banner** — new TV launcher banner matching the refreshed branding
- 🛠️ **Updated first-launch setup screen** — refreshed logo integrated into the Compose setup flow

### 🐛 Fixed
- ✅ Minor bug fixes

### 📦 Android APK
The companion Android app now includes **Android TV support** and refreshed branding across mobile, PWA, and TV surfaces. Download the APK below.

### 🛠️ Upgrade

**Native install:**
```bash
curl -fsSL https://raw.githubusercontent.com/Victor-root/glasskeep-enhanced/main/install.sh | sudo bash
```

## v2.2.0 — 2026-05-10

This release introduces **audio notes** as a first-class note type in GlassKeep Enhanced.

### ✨ Added
- 🎙️ **Audio notes** — record voice memos directly in the app
- 💾 **Multiple download formats** — MP3, WAV, or original raw recording
- 📊 **Storage gauge** — visual indicator for audio usage per note (100MB limit)
- ⏱️ **Scrubber bar** — seek control for audio playback
- 📱 **Responsive recording button** — icon-only on mobile, text pill on desktop
- 🤖 **Android microphone permission bridge** — proper WebView ↔ OS permission handoff

### 🐛 Fixed
- ✅ Checklist item text alignment when entering edit mode (no more visual jump)
- 🍎 iOS Safari search bar keyboard not opening on input focus
- 🔒 Android Auto Backup leaking session data after reinstall

### 📦 Android APK
The companion Android app is bumped to **v1.1.0** (versionCode 4) with proper microphone permission support for audio notes. Download the APK below.

### 🛠️ Upgrade

**Native install:**
```bash
curl -fsSL https://raw.githubusercontent.com/Victor-root/glasskeep-enhanced/main/install.sh | sudo bash
```

## v2.1.0 — 2026-05-09

### Added
- In-app version display.
- Admin-only update check against GitHub Releases.
- Update notification when a newer version is available.
- Update instructions in the admin panel.
- Direct Android APK download link in the README.

## v2.0.0 — 2026-05-08

First official stable release of **GlassKeep Enhanced**.

This release marks the fork as its own enhanced release line, based on the original Glass Keep project but with major additions and improvements.

### Added
- Local-first / offline support
- Trash / restore
- Native Android companion app
- Internationalization foundation
- Rich-text editor with live formatting
- Smarter Google Keep import
- Settings panel revamp
- Server-side encryption
- WebAuthn passkeys
- Easier self-hosting
- Drawing mode overhaul
- Provider-agnostic AI assistant
- Side-by-side note view
- Improved multi-select dock

### Improved
- Mobile and responsive usability
- Sync behavior and cross-device reliability
- Import / export and deduplication flows
- Note creation and editing flow
- Tags, filters, and note organization
- Checklists and content interactions
- Collaboration UX guardrails
- Authentication and account handling
- Repository structure and documentation

### Notes
This is the first official stable release line for **GlassKeep Enhanced**.

The original upstream project used the `1.x` version line. This fork starts its enhanced stable release line at `v2.0.0` to reflect the scale of changes introduced since the fork.
