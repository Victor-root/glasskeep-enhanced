# 📋 Changelog

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
