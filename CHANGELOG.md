# Changelog

## v2.3.0 — 2026-05-13

### Added
- Android TV support: the existing APK detects leanback hardware and switches to a dedicated TV layout (Pinterest-style grid, D-pad spatial navigation, sidebar + detail viewer, profile picker login).
- TV-only HeaderUserChip with sign-out / exit-TV-mode popover, dismissable via the remote's Back key.
- `?tv=1` URL override to force the TV layout from any device.
- Android TV banner, leanback feature flags and `LEANBACK_LAUNCHER` intent in the manifest.
- Refreshed master logo applied across the favicon (`.ico` + 16/32 PNGs), the PWA icons (192 / 512 / maskable), the Apple touch icon, the Android launcher (5 densities + adaptive foreground), the Android TV banner, and the Compose first-launch setup screen.

### Fixed
- Login flow rejecting valid username-only accounts on TV (TV manual login now mirrors the phone's `email`-field contract).
- D-pad navigation getting stuck at the top of the sidebar (zone containment now falls back to the global pool when no candidate exists).
- Long card titles being clipped to a single line height on the TV grid.

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
