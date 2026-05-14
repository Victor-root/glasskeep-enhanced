# Changelog

## v2.3.5 — 2026-05-14

### Added
- One-click in-app update from the admin panel (native + Docker)
- "Update manually" toggle for the raw curl / docker compose commands
- "View changelog" button in the admin panel
- Live RAM / Swap / CPU gauges during a native update
- Cancel button with snapshot-based rollback
- Auto-pop changelog modal after a successful update
- AI translation of the changelog with live streaming
- Expert "Show details" panel with the raw update log
- Smart Node heap sizing using RAM + swap so small hosts don't OOM
- Friendly failure hints (OOM, network, permissions, disk full)
- `UPDATE_BRANCH` / `UPDATE_BUILD_HEAP_MB` env vars for advanced setups

### Changed
- `install.sh` now ships a dedicated `glass-keep-updater.service`
- `docker-compose.yml` mounts the Docker socket out of the box
- Update dismissal is now server-side, so the modal doesn't re-pop in private browsing or on another device

### Fixed
- Various polish and minor bug fixes

## v2.3.0 — 2026-05-13

### Added
- Android TV support: the existing APK detects leanback hardware and switches to a dedicated TV layout (Pinterest-style grid, D-pad spatial navigation, sidebar + detail viewer, profile picker login).
- Refreshed master logo applied across the favicon (`.ico` + 16/32 PNGs), the PWA icons (192 / 512 / maskable), the Apple touch icon, the Android launcher (5 densities + adaptive foreground), the Android TV banner, and the Compose first-launch setup screen.

### Fixed
- Minor bug fixes

## v2.2.0 — 2026-05-10

### Added
- Audio notes with MP3, WAV, and original format download options
- Visual storage gauge for audio tracks
- Scrubber bar with seek control for audio playback
- Icon-only "Add Recording" button on mobile, text pill on desktop

### Fixed
- Checklist item text alignment when entering edit mode
- iOS Safari search bar keyboard not opening on input focus

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
