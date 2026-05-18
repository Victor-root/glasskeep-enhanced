# 📋 Changelog

## 🚀 v2.3.7 — 2026-05-17

This release brings **passkey support to the native Android app** — fingerprint, face unlock, hardware security keys and password managers (Google Password Manager, 1Password, Bitwarden…) now work from inside the APK the same way they do in a browser. Full setup guide and the reverse-proxy edge cases live in [`PASSKEYS.md`](./PASSKEYS.md).

### ➕ Added
- 🔑 **Native Android passkey support** — `androidx.credentials` bridge wired into the WebView so `navigator.credentials.create / get` routes through Android's Credential Manager instead of the (gimped) in-WebView WebAuthn stack
- 📄 **Dynamic Digital Asset Links** — server publishes `/.well-known/assetlinks.json` on the fly, pre-authorising the official APK + F-Droid fingerprints; no static file to maintain per install
- 🛠️ **`ANDROID_EXTRA_FINGERPRINTS` env var** — single declaration that unlocks both the OS-level asset-links handshake AND the server-side `expectedOrigin` check for custom-built APKs
- 📖 **[`PASSKEYS.md`](./PASSKEYS.md) guide** — full walkthrough covering Madame-Michu setup, the non-standard-port reverse-proxy trap (with apache/nginx/caddy snippets), custom-build path, and an error-to-cause troubleshooting matrix
- 🧪 **Local-debug release signing** — `android/keystore.properties` (gitignored) lets the green ▶ button in Android Studio produce passkey-capable APKs without the "Generate Signed APK" wizard each time
- 💬 **Themed in-app dialogs** — passkey naming / confirmation now uses the app's own modal styling instead of the WebView's "La page indique :" system prompt

### 🔄 Changed
- 📱 **Mobile toasts now span the viewport** — long messages no longer crammed into a 384px column with empty gutters on each side; desktop layout untouched
- 📐 **Passkey settings section rescaled for mobile** — description and "Add a passkey" button now stack vertically (text gets the full container width, button stretches across the row on phones) instead of cramming the text into an 18ch column to the left of an inline button
- 🪟 **Themed dialogs are fully opaque** — passkey naming / confirmation modals drop the 95%-alpha + backdrop-blur in favour of solid `bg-white` / `bg-[#282828]` + a 1px card border, so the underlying settings panel stops bleeding through the dialog
- 📦 **APK bumped to `1.3.0`** — minimum required to use passkeys in the app (asset-links validation needs the new signing pipeline + bridge)
- 📚 **README passkey section trimmed** — one-line summary + link to the dedicated guide

### 🐛 Fixed
- 🔐 **Passkey verification accepts native-app origins** — `expectedOrigin` now allows the `android:apk-key-hash:<URL-safe base64(SHA-256(cert))>` form Credential Manager produces, in addition to the regular HTTPS origin (browser ceremonies)
- 📐 **Edge-to-edge insets fixed on Android 15 WebView** — the stock Pixel WebView returns 0 for `env(safe-area-inset-*)` even in edge-to-edge mode, which left the FAB partially behind the navigation bar and the header floating under the status bar. The Activity now injects the real system-bar insets as CSS custom properties (`--android-inset-*`) read via a single `--safe-*` indirection across the whole app; the existing `env()` chain is kept as the fallback for browser / PWA contexts
- 🌍 **Untranslated "user cancelled the request" toast** — Credential Manager surfaces cancellation under several exception classes and in the user's system locale, so the prior regex (English-only `cancelled` / `aborted`) missed `canceled` (US), `annulé` (FR), `interrupted`, etc. The bridge now flags any CANCEL/INTERRUPT exception type as `NotAllowedError` and the JS fallback regex covers the remaining variants
- 🛠 **Restart / shutdown server errors localized** — `AdminPanel` now routes the server's English error text through `localizeServerError` so the admin sees a translated toast instead of the raw `data.error` string
- 🔗 **Changelog links open in the system browser** — clicking a markdown link inside the in-app changelog (e.g. the `PASSKEYS.md` reference) used to navigate the WebView to a path the SPA didn't know about and dump the user on the home screen. Relative paths now resolve against the GitHub repo and open externally via the new `AndroidTheme.openExternalUrl` bridge (with `window.open` as the browser fallback)
- 🪟 **Every dialog is fully opaque** — admin restart / shutdown progress, password change, generic confirm, delete confirm, remove-collaborator confirm, logo picker, and footer popovers now sit on solid `bg-white` / `bg-[#282828]` instead of 95–98 % alpha + backdrop blur, so the underlying panel never bleeds through

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
