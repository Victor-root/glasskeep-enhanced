# 🛠️ GlassKeep Enhanced — Improvements Since the Fork

> This document provides a structured overview of the main changes introduced in this fork since its starting point based on [Glass Keep](https://github.com/nikunjsingh93/react-glass-keep).

Before anything else: this fork was never intended as a replacement for the original project. It grew out of a codebase and a product direction I genuinely liked.  
If this fork became much larger over time, it is precisely because the original Glass Keep foundation made me want to invest a lot of time in improving it.

---

## 📌 Overview

Since the fork, the project has gradually evolved far beyond a simple translation effort or a handful of isolated fixes.

The work mainly covers:

- **local-first / offline-first behavior**
- **synchronization reliability in real-world conditions**
- a broad **UI/UX polish pass**
- many **mobile / responsive improvements**
- a cleaner, more extensible **i18n** base
- a proper **Trash / restore** flow
- a more **modular frontend structure**
- a much simpler **self-hosting experience**
- a native **Android companion app**
- improvements around **security**, **installation**, **deployment**, and **maintenance**

---

## 🔄 1) Local-first / offline-first

One of the biggest areas of work in this fork was adding behavior that remains genuinely usable without network access.

### What was added
- create, edit, reorder, pin, archive, trash, and restore notes **offline**
- local IndexedDB queue for write operations
- automatic synchronization when the server becomes reachable again
- retry and recovery logic after connection loss
- improved behavior on mobile when dealing with stale sockets or unstable reconnection
- visible sync status in the UI

### Goal
Make the app more reliable in everyday use, even when the connection is unstable or temporarily unavailable, instead of depending entirely on immediate server availability.

---

## 📡 2) Sync behavior and cross-device reliability

The fork also pushes the sync layer further.

### Main evolutions
- real-time synchronization via **SSE**
- more coherent cross-device refresh behavior
- better conflict handling
- clearer sync status semantics
- queue collapsing / smarter merging of rapid edits
- stricter logic before displaying a fully “synced” state

### Result
The project behaves much more consistently in real multi-device usage, with fewer ambiguous or fragile cases.

---

## 🗑️ 3) Trash / note lifecycle

Note deletion was redesigned to be safer and less destructive.

### Additions
- soft delete: notes go to **Trash** first
- dedicated Trash view
- restore from Trash
- permanent deletion only from Trash
- support for both single-note actions and bulk actions
- preservation of the note’s logical state when restoring (active / archived depending on the case)

### Why it matters
This reduces accidental data loss and makes the deletion flow much closer to what users expect from a daily-use notes app.

---

## 📱 4) Mobile and responsive rework

A large part of the effort focused on real-world phone usage.

### Main improvements
- reworked mobile grid
- better display density
- cleaner checklist previews
- improved handling of text overflow
- reduced padding and typography adjustments
- more coherent breakpoints
- cleaner full-screen modal behavior on mobile
- improved touch interactions
- clickable phone numbers in the full note view
- lower friction on small screens overall

### Result
The app feels much more credible as a daily mobile tool, where many small details previously made the experience rougher.

### 📺 Android TV layout

The responsive work was then extended all the way to the living room. The **same Android APK** now detects leanback hardware at boot (or the `?tv=1` URL override) and swaps the React frontend for a dedicated TV layout designed for the couch and the D-pad — no separate build, no separate install, no separate codebase to maintain.

#### Detection & routing
- `useTvMode()` hook combined with a `setTvModeOverride()` localStorage flag — TV mode is picked once at boot, can be forced via `?tv=1` for testing on a regular browser, and can be exited from the user chip popover on non-leanback devices
- `AppRoot.jsx` picks `TvApp` vs the regular `App` based on that single flag — none of the existing phone / desktop code paths are touched on Android TV, the TV tree is a strict consumer that re-fetches `/api/notes` on mount and on window focus
- the Android wrapper exposes `window.__isAndroidTV` from `WebViewActivity.kt` so the React side can hide the "Use phone layout" button when it would be a dead end (a TV stick has no touchscreen to fall back to)

#### Dedicated TV tree (`src/components/tv/`)
- `TvApp.jsx` — TV-mode entry point. Owns its own minimal session + notes-loading state (no sync engine, no IndexedDB queue, no SSE listener — the TV is a strict read-mostly viewer that polls `/api/notes` every 30 seconds and on focus)
- `TvNotesViewer.jsx` — home screen with a Pinterest-style masonry grid (`react-masonry-css`), an auto-hiding sidebar rail and a header with the user chip
- `TvNoteCard.jsx` — closed card with a notepad-style background mask, two variants (grid / carousel) sharing one render path
- `TvNoteDetail.jsx` — fullscreen viewer with a capture-phase keydown handler so D-pad scroll never fights with the global spatial navigator
- `TvLogin.jsx` — three-mode login: Jellyfin-style **profile grid** (avatar + name, populated from `/login/profiles`), **password prompt** once a profile is picked, and a **manual** identifier + password fallback for accounts that don't show up in the public profile list. Mirrors the phone's `email`-field contract so username-only accounts (no `@`) still sign in
- `TvSidebar.jsx` — filter rail (All / Tags / Trash / Archive) with lucide icons sized for 10-foot reading
- `tvStyles.js` — the entire TV stylesheet, injected at runtime once `<html data-tv="1">` is set, so the regular phone / desktop CSS is never affected

#### D-pad spatial navigation (`useSpatialFocus.js`)
- 2D geometric scoring (the way Android TV's framework does it) instead of tab order — picks the closest focusable in the requested direction by computing `primary + lateral * 2` against every candidate's rect
- **zone containment** so D-pad navigation stays where it makes sense: up/down stays inside the sidebar / detail viewer, left/right stays inside the header — pressing Right on the rightmost header button no longer teleports focus into a card down in the grid
- **fallback escape**: if the zone-restricted pool yields nothing (e.g. user is at the top of the sidebar pressing Up), the scan falls back to the global focusable list so the focus can leave the zone vertically instead of being stuck
- **130 ms throttle on auto-repeat** (`REPEAT_LOCK_MS = 110`) because the CSS focus transition takes longer than the Shield WebView can repaint at native key-repeat speed — taps still go through instantly, only holds are clamped to ~9 moves/sec
- capture-phase listener so the throttle hits before React's synthetic events
- `data-tv-focused` attribute swap on previous + next only (never the whole tree) to avoid a CSS recalc storm on every move
- `scrollIntoView({ block: "nearest" })` without `behavior: "smooth"` — smooth scroll on the Shield's WebView stalls 200-300 ms per row
- ignores viewport bounds when scanning for candidates, otherwise the user gets stuck on the last visible row (no row below is "visible")
- emits `tv-focus` events so individual screens can park focus on a sensible element after a mode change (login → password, password → first profile, …)

#### Back-key plumbing
- the Android `KEYCODE_BACK` is forwarded to `window.history.back()` from `WebViewActivity.kt`, and overlays like the user chip popover push a marker entry onto the history stack so the Back key closes them before unwinding the React tree
- a `keydown` handler in `useSpatialFocus` also catches `Escape` / `GoBack` / `Backspace` so a hardware keyboard plugged into a TV stick works without any extra wiring
- `KEYCODE_MENU` dispatches a custom `tv-menu-key` DOM event so the React side can hook into the remote's menu button without needing to peek at native key codes

#### Performance tuning for older hardware (Nvidia Shield, etc.)
- cheap signature poll (id + updated_at per note) before `setState`, so a no-op `/api/notes` tick doesn't re-render 100+ cards on every cycle (~150 ms saved per tick on older Shields)
- masonry column count made **independent of sidebar state** — toggling the sidebar no longer forces a full re-bucket of the grid, which previously caused a 3-4 second freeze on Shield
- `display: none` for the hidden sidebar rather than a CSS `transition` on `grid-template-columns`, which the Shield WebView couldn't keep up with
- `flex-shrink: 0 !important` on `.tv-card__title` after several iterations chasing a clipped-to-8.4px-height title bug caused by `-webkit-box` collapsing
- pager mode reserves `overflow: visible` only on the focused page so the focus ring isn't clipped by the carousel's outer overflow clip

#### Android wrapper changes (`android/`)
- `AndroidManifest.xml` — leanback `<uses-feature>` flags, `LEANBACK_LAUNCHER` intent filter, banner reference
- `tv_banner.xml` / `drawable-xxxhdpi/tv_banner.png` — the rectangular Android TV banner shown in the leanback launcher
- `WebViewActivity.kt` — `isTelevision()` helper, KEYCODE_BACK → `history.back()`, KEYCODE_MENU → `tv-menu-key` DOM event
- `SetupScreen.kt` — a dedicated `TvSetupScreen` Compose variant with leanback-safe spacing and gradient brand text via `TextStyle.brush`, picked at runtime by an `isTelevision()` Compose helper

### Why it matters
The TV layout reuses the same React engine, the same auth flow, the same notes endpoint and the same Android wrapper — so a user who installs GlassKeep on their TV stick gets the same notes, the same accounts and the same sync behaviour as on their phone, just rendered for the couch. There is no separate "GlassKeep TV" app to maintain.

---

## 🤖 5) Native Android companion app

The fork also adds a true Android companion app.

### What was added
- dedicated Android project in `android/`
- first-launch server URL setup
- native wrapper around a self-hosted instance
- better Android integration
- landscape support
- UI choices more consistent with Android usage

### Goal
Offer a more app-like mobile experience alongside the web version.

---

## 🌍 6) Internationalization (i18n)

The fork started with French, but the real work was building a cleaner translation foundation.

### What was done
- creation of a dedicated i18n infrastructure
- automatic locale detection
- English fallback if a key is missing
- translation of a large part of the interface
- locale-aware date formatting
- cleaner text separation into dedicated locale files

### Languages currently implemented
- English
- French

### Philosophy
French was the first real implementation, but the actual goal is to make further language additions easier, not to restrict the project to two languages.

---

## ✨ 7) UI / UX polish and overall product feel

The fork also includes a broad layer of visual and ergonomic polish.

### Visible changes
- replacement of rougher visual elements with more coherent icons
- more consistent iconography
- more compact layout
- better use of space on wide screens
- richer note previews
- improved modal presentation
- stronger overall visual consistency
- many adjustments across spacing, alignment, buttons, previews, and UI states
- settings panel rebuilt with a Tabler icon on every section / option, a single-column icon alignment, a wider drawer on tablet / desktop, and stacked right-controls on mobile so longer translations no longer crush the description (see also section **23**)

### Goal
Keep the spirit of the original project while making it feel cleaner, more readable, and more finished.

---

## 🎨 8) Drawing mode overhaul

The drawing mode was heavily reworked and deserves to be called out explicitly.

### What changed
- major rework of the drawing mode both in structure and in usage
- better separation of drawing-specific components
- cleaner integration with the editor, previews, and modal flows
- stronger technical base for future drawing-related improvements
- more coherent overall experience than in the original state of the project

### Why it matters
Drawing is not the most frequently used feature in everyday note-taking, but it was still an important part of the original app. This fork gives it a much cleaner foundation and a more maintainable implementation.

---

## 🧱 9) Frontend refactor and modularization

The project was also restructured significantly internally.

### What evolved
- extraction of many dedicated components
- clearer separation between auth / notes / modals / panels / shared components
- creation of dedicated hooks
- reduction of overly centralized logic
- dedicated modules for:
  - i18n
  - sync
  - import/export
  - modal state
  - checklist dragging
  - draft creation
  - drawing history
  - helpers / constants / global styles

### Benefit
The codebase is more readable, more maintainable, and easier to evolve.

---

## 📝 10) Note creation and editing flow

The fork also reworked how note creation behaves.

### Evolutions
- more direct opening into the edit modal
- deferred **draft note** lifecycle
- empty notes are no longer materialized too early
- closing without any meaningful action no longer pollutes the app with blank notes
- cleaner behavior between draft state, actual save, and sync
- a note that ends up **100% empty** on close (no title, no body / items / drawing strokes — but images keep it alive) is now auto-trashed instead of leaving a blank shell on disk and on the server (see section **21** for details on the per-type body check)

### Why it matters
This is exactly the kind of product detail that has a large impact on how polished the app feels in daily use.

---

## 🏷️ 11) Tags, filters, and note organization

Tag handling became richer and more practical.

### Improvements
- tag suggestions while creating a note
- tag suggestions while editing a note
- multiple convenient ways to add tags
- cleaner removal / correction behavior
- more practical multi-tag filtering
- OR logic for multi-select filtering
- richer tag sidebar behavior

---

## ✅ 12) Checklists and content interactions

Checklist notes received a lot of attention too.

### Changes
- better checklist rendering in previews
- better interactions on mobile
- fixes for overflow issues
- cleaner checkbox alignment
- better drag / reorder behavior
- improved readability overall

---

## 👥 13) Collaboration and UX guardrails

The fork keeps the real-time collaboration capability inherited from the original project, with additional work around real-world usage.

### Notable elements
- dedicated collaboration components
- better frontend separation of collaboration logic
- UI guardrails when certain situations are incompatible with offline usage
- improved clarity around some collaborative flows

---

## 🔐 14) Authentication, account handling, and security

The project also improved around security and account management.

### Additions / improvements
- dedicated password change flow
- improved auth screens
- healthier multi-user base
- cleaner admin initialization logic
- less reliance on default credentials in the native install flow
- automatic generation of a real `JWT_SECRET` during installation
- server-side refusal to start with weak or placeholder secrets

### Result
A healthier base for real self-hosted usage.

---

## 👑 15) Easier native installation

One of the biggest strengths of the fork is the simpler installation path.

### New `install.sh`
- install
- update
- uninstall
- Debian / Ubuntu / Proxmox LXC support
- FR / EN language detection
- `.env` generation
- systemd service creation
- guided HTTPS configuration
- admin account creation during installation

### HTTPS options
The script can handle three common cases:
- let a **reverse proxy** handle HTTPS
- generate a **self-signed certificate**
- use an existing **custom SSL certificate**

### Why it matters
This significantly reduces deployment friction for people who want a self-hosted instance that is easy to install and maintain.

---

## 🐳 16) Docker and distribution

The Docker side was also improved.

### Evolutions
- new `docker-compose.yml`
- first-run admin bootstrap
- dedicated entrypoint
- image published on **GHCR**
- **multi-architecture** publishing for amd64 / arm64
- better support for NAS / appliance / small-server use cases

---

## 🧠 17) Local AI behavior made saner

The fork does not remove the local AI part of the project, but it makes it more predictable and more respectful of self-hosted realities.

### Changes
- no automatic model download on startup
- explicit user opt-in
- better transparency about model size and server impact
- dedicated status / initialization endpoints
- more coherent behavior for personal hosting

---

## 📦 18) Import / export and recovery flows

Migration and recovery tooling was also consolidated.

### Present in the fork
- JSON export
- JSON import
- Google Keep import (raw Takeout `.zip`, see section **22**)
- Markdown import
- downloadable recovery secret key
- dedicated logic in hooks / utilities
- server-side **deduplication** on every import path so re-importing the same export doesn't multiply notes (see section **22**)

---

## 🧹 19) Repository hygiene and cleanup

The fork also benefited from structural cleanup.

### Notable points
- removal of unnecessary files
- cleaner repository layout
- removal of runtime files that should not remain in the tracked tree
- better separation between app source, runtime, Docker, and Android
- clearer documentation around recommended usage

---

## 📚 20) Documentation

Documentation was reworked significantly.

### What exists today
- README focused on installation / usage
- dedicated improvements document
- dedicated AI behavior changes document
- clearer presentation of the fork’s philosophy
- desktop / mobile screenshots
- Android documentation presence
- clearer explanation of installation paths

---

## ✏️ 21) Rich-text editor (live formatting)

The biggest single change of this branch — text notes are now edited through a real WYSIWYG editor instead of a Markdown `<textarea>`.

### Engine
- Tiptap / ProseMirror under the hood
- versioned JSON envelope `{ "v": 1, "format": "tiptap", "doc": { … } }` stored in the existing `notes.content` column — opaque to the server, IDB and sync layers, so no schema change was required
- legacy Markdown notes are detected on load and migrated to the rich envelope on first save

### Marks and blocks
- bold / italic / strike / sub / sup / inline code
- underline with **four variants** (simple, double, dotted, dashed, wavy) plus an optional underline colour
- text colour and highlight via 8-slot themed palettes (CSS variables that auto-resolve to the dark / light variant on theme switch)
- bullet & ordered lists with **per-item indent** (the `<li>` carries the indent attribute, so bumping puce 2 never moves puce 1)
- code blocks (with smart selection-carve), blockquote (otro-style with a curly quote glyph in the gutter), horizontal separator, links
- alignment, paragraph + H1..H5

### Typography presets
- 3 switchable profiles per user
- per-block (Paragraph + H1..H5) size / weight / colour / italic / underline
- exposed as CSS variables on `:root`, so the editor + read view + card previews all share the same rendering rules
- synced cross-device through `/user/settings`
- on read, sizes snap to the closest preset entry — auto-migrates older non-preset defaults (e.g. `1.35rem`) so the dropdown never "lies" with stale values

### Fonts
- 28 self-hosted webfonts via `@fontsource` (Inter, Roboto, Open Sans, Lato, Source Sans, Noto Sans, Nunito, Poppins, Montserrat, Raleway, Work Sans, Ubuntu, Merriweather, Lora, PT Serif, Playfair Display, EB Garamond, Source Serif, JetBrains Mono, Fira Code, Source Code Pro, IBM Plex Mono, Roboto Mono, Bebas Neue, Oswald, Pacifico, Dancing Script, Caveat) — no CDN, lazy `woff2` fetch only when the user actually picks a family

### Mobile UX
- the desktop ribbon was unusable on phones; replaced by a **"Formatting" footer toggle** that opens a bottom sheet hosting the same toolbar
- drag-handle pill, swipe-down gesture dismisses the sheet
- virtual keyboard suppressed (`inputmode="none"`) while the sheet is open so the user can long-press text to select without the keyboard taking over
- chrome (background tinted to the modal's note colour, subtle top gradient) follows the same visual language as the modal it lives in

### Edit ↔ read parity
- the read view preserves blank lines authored in the editor — empty `<p></p>` get a `:empty::before` non-breaking space so the line stays visible
- `<hr>` and `<pre>` margins synced between modes so visible spacing matches in both

### Empty notes auto-trash on close
- a note that ends up 100% empty (no title, no per-type body, no images) is **hard-deleted** when the modal closes (queued `trash` → `permanentDelete` to respect the server's must-be-trashed-first contract)
- toast confirms the deletion
- guarded so durable user gestures (pin, archive, explicit save) clear the freshly-created marker

### Keyboard
- Tab from the title focuses the body (`commands.focus("end", { scrollIntoView: false })`)
- Shift+Tab from the body returns to the title
- standard Tiptap shortcuts (Ctrl/⌘+B/I/U, headings, lists, undo / redo) work everywhere

---

## 📥 22) Smarter import flows

Building on the existing import / export hooks, the fork now handles real-world export bundles much more gracefully.

### How to export your Google Keep notes

Google doesn't offer a download button from the Keep web app — Keep notes ship through **Google Takeout**, the central data-export portal of every Google account. Here's the exact path:

1. Go to **<https://takeout.google.com/>** and sign in with the Google account you use for Keep
2. At the top of the product list, click **"Deselect all"** — by default Takeout ticks every single Google product, you only want Keep
3. Scroll down to **"Keep"** and check its box
4. Click **"Next step"** at the bottom of the page
5. Configure the export:
   - **Destination**: "Send download link via email" is fine in most cases (also available: Drive / Dropbox / OneDrive / Box)
   - **Frequency**: "Export once"
   - **File type**: `.zip` (recommended)
   - **File size**: leave the default unless your Keep data is huge — Takeout only splits the archive past the chosen threshold
6. Click **"Create export"** and wait for Google to package it (usually a few minutes; you'll get an email when it's ready)
7. Download the `.zip` from the link in the email (or directly from the Takeout page)
8. In GlassKeep, open **Settings → "Import Google Keep notes (Takeout .zip)"** and drop the `.zip` straight in — no need to extract it first; the importer reads the archive natively

> The "How to export?" inline link in the settings panel points to Google's own Takeout documentation if you want to see Google's screenshots while you go through the wizard.

### Google Keep / Takeout (engine)
- accepts the **raw `.zip`** straight out of Google Takeout — no need to hand-pick the `.json` files
- JSZip-based extraction, with non-Keep JSONs (Drive, Calendar, …) silently filtered out
- imports the original colour (mapped to the closest GlassKeep swatch — RED → red, ORANGE → peach, TEAL → mint, …), the **image attachments** (data-URL embedded), labels, items and titles
- single line breaks (`\n`) and blank lines (`\n\n`) from the original `textContent` are preserved by going through a dedicated plain-text → Tiptap converter (no `marked()` detour, which would have collapsed both)
- inline help link in the settings to Google Takeout's documentation so the user knows where to grab the archive

### Cross-device deduplication
- the server-side `/api/notes/import` endpoint computes a fingerprint of the importing user's existing notes (`type | trimmed-title | body | images-hash`) and skips any incoming note that already matches
- checklist items are normalised (id-stripped) before hashing, so re-imports of an export don't multiply their content because of fresh per-item ids
- image-only Keep notes (no title, no body — typical Takeout case) hash uniquely thanks to a SHA-1 short digest of `(name, src)` per image
- the response now reports `imported / skipped`, surfaced in the success toast: *"X note(s) imported, Y duplicate(s) skipped"* / *"No notes imported — Y duplicates already present"*
- applies to GlassKeep `.json`, Markdown imports and Takeout `.zip` alike — single endpoint, single fingerprint logic

### ID-collision robustness
- the import endpoint now checks **every** note id in the `notes` table, not just the importing user's, so a `.zip` exported by user A and re-imported into user B's account no longer hits the global PRIMARY KEY constraint

---

## 🎨 23) Settings panel revamp + duplicate note + safe-area polish

### Settings drawer
- every section header and every option carries a Tabler icon for at-a-glance navigation; all icons line up in a single vertical column
- desktop drawer widened (`sm:w-[28rem]` / `lg:w-[32rem]`) so longer descriptions and right-side controls breathe
- on mobile, segmented choices and CTA buttons stack right-aligned **under** their label so future i18n with longer button text never crushes the description; toggles stay inline (small enough to keep on a single line)
- explicit horizontal separators between sections (gradient hairline) so the visual grouping holds at a glance
- each setting label answers "what does this do" with a short description directly in the row instead of relying on tooltips

### Modal kebab — Duplicate note
- new "Duplicate note" entry that clones the open note from its in-memory state (so unsaved edits are also captured)
- fresh ids on every checklist item / image so a future autosave on either copy never collides
- " (copy)" suffix on the title; the duplicate appears at the top of the grid

### Typography modal
- safe-area-aware on Android edge-to-edge (`max(32px, env(safe-area-inset-top) + 12px)` on the header, `max(16px, env(safe-area-inset-bottom))` on the body, `100dvh`-based panel height)
- the Android back gesture closes the typography sub-modal — state lifted into the centralised overlay back-button stack in App.jsx
- mobile header layout stacks the title + description + profile tabs above a dedicated row for the reset CTA, with the close `×` pinned to the top-right at the same y as the title

---

## 🔐 24) Server-side encryption & WebAuthn passkeys

A major security addition focused on protecting notes at rest and providing modern passwordless authentication.

### End-to-end encryption
- **server-side encryption**: all user notes, settings, and metadata are encrypted at rest using AES-256-GCM
- **instance-level passphrase**: encryption keys are derived from a dedicated passphrase set by the admin (completely separate from user login passwords) — PBKDF2 key derivation protects against brute force
- **shared encryption key**: all users' data on the instance is encrypted under the same master key derived from the admin's passphrase
- **transparent operation**: encryption/decryption happens automatically on the server; the browser sends and receives encrypted payloads
- **admin configuration**: admins can enable or disable encryption globally from the admin panel, set the passphrase during initialization
- **recovery**: if encryption is enabled, the "Recovery Secret Key" serves as a backup access method (shown once during setup, never stored or re-fetchable)

### WebAuthn passkeys
- **passwordless registration & login**: users can register passkeys (biometrics, security keys, synced credentials) directly from the settings panel
- **passkey management**: view all registered passkeys, rename them, delete ones no longer in use, and test them
- **real-time sync**: passkey properties (name, creation date, synced status) are visible at a glance
- **instance unlock via passkey**: admins on encryption-enabled, unlocked instances can promote a passkey to unlock the instance using PRF (Platform Resident Function) — the authenticator generates a PRF output used to wrap the instance encryption key
- **platform compatibility**: works across modern browsers (Chrome, Firefox, Safari, Edge) and Android via WebAuthn API

### Implementation details

#### Encryption layer (`server/encryption/`)
- **key derivation**: PBKDF2 with 310,000 iterations (OWASP current recommendation) derives the master encryption key from the admin's instance passphrase
- **encryption**: AES-256-GCM with per-operation IVs (initialization vectors) ensures even identical plaintext produces different ciphertexts — each note/setting gets a fresh random IV
- **metadata**: encrypted payloads include a version number and are stored as base64url so they play nicely with JSON APIs and databases
- **unlocking**: server-side decryption requires the admin passphrase; the server derives the key and unwraps the Data Encryption Key (DEK) stored in the vault
- **recovery path**: the DEK is also wrapped under a recovery key that the admin generates during setup (shown once, never stored) — admins can always unlock the instance via the recovery key even if the passphrase is forgotten

#### Passkey routes (`server/routes/passkeyRoutes.js`)
- **registration**: user initiates passkey setup → server generates WebAuthn challenge options → browser collects credential → server verifies and stores
- **login**: user initiates passkey login → server generates authentication options → browser performs assertion → server verifies counter and stores result
- **testing**: users can test a passkey to ensure it still works (counter is incremented, timestamp updated)
- **instance unlock**: special 3-way ceremony where the server requests PRF eval, captures the output, and uses it to wrap the live DEK
- **counter verification**: prevents cloned authenticators by checking that the counter increases monotonically

#### Frontend components
- **settings**: `PasskeySettingsSection` displays registered passkeys with badges (Login, Unlock, Synced) and controls to add, rename, delete, or test each one
- **login views**: `PasskeyLoginView` and `SecretLoginView` provide passwordless sign-in options; if the instance is locked, passkeys are the unlock path
- **UX messaging**: clear error messages guide users when WebAuthn is unavailable (non-HTTPS context, browser unsupport, Android WebView) — HTTP shows "HTTPS required", WebView shows "use your browser"
- **toast durations**: passkey success messages remain visible for 5 seconds; "no PRF support" warnings stay for 10 seconds so users understand limitations

### Security considerations
- **HTTPS requirement**: WebAuthn only works over HTTPS (or localhost), enforced by the browser — Docker deployments must use a reverse proxy with HTTPS
- **RP ID / origin validation**: the server validates that the passkey origin matches the configured domain (`WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` env vars or auto-detected from headers with trust-proxy enabled)
- **counter attacks**: authenticator counter is checked on each assertion to detect cloned authenticators
- **passphrase strength**: the encryption passphrase is separate from user login passwords and should be treated as a critical secret — it protects all data on the instance
- **recovery key**: the recovery key generated during encryption setup is the backup to unlock the vault if the passphrase is lost — it must be stored securely (offline recommended)
- **password-based login**: user passwords (for login) are independent of encryption — they are still hashed (bcrypt) and authentication remains passwordless-optional via passkeys

### Configuration for deployments

#### Native installation (`install.sh`)
- encryption and passkeys are available automatically; no special setup needed
- HTTPS is configured by the installer (reverse proxy, self-signed cert, or custom cert)

#### Docker
- passkeys work out-of-the-box on HTTPS deployments (behind a reverse proxy like Caddy, Nginx, Traefik)
- encryption keys are stored in the SQLite database (`/data/notes.db`), which is persisted in a Docker volume
- if the reverse proxy doesn't pass `X-Forwarded-Host` and `X-Forwarded-Proto` correctly, set `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` manually in the `docker-compose.yml`
- certificate options: Let's Encrypt (automatic via Caddy), self-signed (works with browsers once accepted), or your own

---

## 🤖 25) AI Assistant

GlassKeep removed its small embedded local AI and replaced it with a flexible, provider-agnostic architecture.

### What changed
- **Removed**: the old embedded local model (too weak to be genuinely useful)
- **Added**: OpenAI-compatible chat endpoint support — Ollama, Open WebUI, LiteLLM, OpenAI, OpenRouter, or any provider exposing `/v1/chat/completions`
- **Architecture**: thin HTTP client on the server; API keys are never sent to the browser; admin configures the provider once, optionally shares it with users or lets each user bring their own

### Two AI features
1. **Global AI search**: ask questions across notes from the search bar; backend pre-selects relevant notes before calling the model to avoid context bloat and ensure cited sources actually exist in the context
2. **Per-note assistant**: discuss the current note with AI; conversations are temporary by default with an optional save button to persist them per note (stored locally on the device until explicitly deleted)

### Admin & user configuration
- **Admin level**: can disable AI entirely, configure a server-side provider (optionally shared with users), or require users to bring their own endpoint
- **User level**: can enable the feature, choose between server AI (if admin allows) or custom endpoint, set temperature/max tokens, and manage passkeys for authentication

### Implementation
- `server/ai/` — OpenAI-compatible HTTP client, request/response handling, prompt engineering for source attribution
- `src/components/notes/NoteAiChatPanel.jsx` — per-note chat UI with message history, save/delete controls, error handling
- `src/components/modal/ModalHeader.jsx` — AI toggle button in note header
- Admin & user settings panels — configurable endpoint, API key management, model selection
- `src/i18n/locales/{en,fr}.js` — full i18n coverage for all AI UI strings

### Why this approach
The embedded model was a source of bloat and poor UX — shipping dozens of MB of model weights that could never match real-world AI use. By switching to provider-agnostic OpenAI-compatible endpoints, GlassKeep:
- stays lightweight (the app itself)
- lets each user/instance choose what fits their hardware and privacy requirements
- works with local private models (Ollama on LAN) or remote providers (your choice)
- keeps API keys server-side and secure
- scales: as better models emerge, users just switch without updating the app
  
---

## 🪟 26) Side-by-side note view

GlassKeep now supports opening two notes at the same time in a dedicated side-by-side mode.

### What was added
- open exactly two selected notes together from the multi-select toolbar
- dedicated SBS modal layout with a left pane and a right pane
- responsive pane sizing so the layout remains usable on narrower desktop / laptop screens
- mobile SBS mode with stacked notes instead of forcing a cramped horizontal layout
- smooth open / close transitions for both panes
- closing one note promotes the remaining note back to a normal single-note modal
- backdrop close still closes both notes together
- the opposite pane stays mounted when temporarily hidden, preserving its internal state

### Desktop behavior
- the two notes open as independent panes inside the same modal experience
- pane width is computed from the available viewport instead of assuming a large 4K screen
- if one pane is closed, the remaining note recenters and returns to the normal single-note layout
- closing both panes via backdrop uses a separate path so no centering animation fights the dual-close animation

### Mobile behavior
- SBS switches to a vertical stacked layout on small screens
- Android WebView safe-area handling was adjusted so the internal boundary between the two panes stays clean
- the top pane only keeps top safe-area padding
- the bottom pane only keeps bottom safe-area padding
- the remaining note expands cleanly when one pane is closed

### AI assistant integration
- the per-note AI assistant works inside SBS
- when AI is opened from the left note, the AI panel uses the right-side slot temporarily
- when AI is opened from the right note, the AI panel uses the left-side slot temporarily
- the other note is hidden, not unmounted, so its state is preserved
- closing the AI panel restores the hidden note after the panel close transition
- the AI chat behavior itself remains unchanged compared to single-note mode

### Multi-select integration
- the multi-select toolbar now exposes the side-by-side action when exactly two notes are selected
- the toolbar was polished into a floating dock-style action bar
- on mobile, the dock follows the auto-hiding header and preserves scroll position when leaving selection mode

### Why it matters
This makes GlassKeep more practical for comparison, migration, note cleanup, technical references, and workflows where two notes need to be visible at the same time. It also turns multi-select into something more useful than bulk actions only.

---

## 🔔 27) In-app update notifications

GlassKeep Enhanced now surfaces new releases directly in the app instead of leaving self-hosted instances silently behind upstream.

### What was added
- in-app display of the running app version, baked into the build
- a dedicated backend route that polls the GitHub Releases API for the latest published release of the project
- module-scope server-side cache (default TTL: 6 hours) to avoid hitting the GitHub API on every request and to stay well within rate limits
- semver comparison between the running version and the latest release tag
- an admin-only frontend hook that calls the backend route once per session
- a discreet visual notification in the desktop header (small green dot on the admin shield + a centered text callout below the button) when a newer release is detected
- a matching mobile indicator on the kebab menu and inside the admin entry of the dropdown
- a dedicated update section at the top of the admin panel, including:
  - the current version and the latest available version
  - a direct link to the GitHub release
  - copy-ready install commands for both the native install script and the Docker setup

### Design choices
- **admin-only**: regular users are not exposed to update prompts and the network call is never made on their behalf
- **fail-silent**: any error (network down, GitHub unreachable, parsing failure, timeout) results in a clean "no update" state — never an error toast, never a console error visible to the user
- **no auto-update**: the system only notifies; upgrading remains an explicit action by the operator
- **no Android-specific path**: the Android app is a WebView wrapper, so the same notification surfaces inside it without any extra logic
- **no spam**: the server cache plus per-session frontend deduplication means GitHub is hit at most a few times per day per instance

### Goal
Make self-hosted GlassKeep instances aware of new releases without forcing operators to manually check the repository, while keeping the system silent, safe, and non-intrusive for non-admin users.

---

## 🎙️ 28) Audio notes

GlassKeep now supports recording audio directly within the app, turning voice memos into a first-class note type.

### What was added
- **audio recording**: record audio directly from the browser using the device microphone
- **embedded playback**: play back audio with a visual waveform scrubber bar and seek control
- **multiple download formats**: export audio as MP3, WAV, or the original raw recording
- **storage management**: visual gauge shows audio storage usage per note (100MB limit per note)
- **cross-device availability**: audio is synced across devices like any other note type
- **responsive design**: icon-only recording button on mobile, full text pill button on desktop
- **platform support**: works on desktop, tablet, and Android WebView; iOS WebKit limitations apply

### Technical implementation
- audio recording via `MediaRecorder` API with `audio/webm` codec
- MP3 encoding via `@breezystack/lamejs` for compatibility
- WebM to MP3 conversion happens client-side before upload
- Android WebView microphone access via `onPermissionRequest` bridge
- audio stored as base64 in notes alongside other content
- per-note 100MB limit (raw audio bytes) enforced on both client and server

### Mobile UX
- recording button consolidates with other controls to avoid screen clutter
- mobile layout switches to icon-only styling to preserve space
- desktop retains a full text button for better discoverability

### Why it matters
Audio notes provide a faster, more natural way to capture thoughts, especially on mobile or when hands are busy. Unlike external voice memo apps, everything stays in GlassKeep with full sync and encryption support.

---

## 📌 Global summary

In practice, this fork mainly moves Glass Keep further in seven big directions:

1. **local-first / offline / sync reliability**
2. **mobile quality and UI/UX polish**
3. **safer note lifecycle with Trash and better account handling**
4. **cleaner and more extensible i18n**
5. **a real WYSIWYG / live-formatting editor** with cross-device typography presets and a phone-friendly bottom sheet
6. **much easier self-hosting**
7. **ecosystem expansion with better Docker support and a native Android companion app**

So this is not really a "new separate project", but rather a substantial evolution built on top of a base I genuinely liked from the beginning.
