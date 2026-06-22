# 📋 Changelog

## 🚀 v2.6.0 — 2026-06-10

Headline feature: **cross-server collaboration** — pair two independent, self-hosted GlassKeep servers and let their users share notes across instances, in real time. Each note's owning server stays the source of truth while the other keeps a synced mirror, with clear handling for when a peer is offline, locked or out of date. The release also fixes cross-device profile sync and removes a redundant lock notification.

### ➕ Added
- 🌐 **Cross-server collaboration (federation)** — from Admin → *Cross-server collaboration*, pair this server with another GlassKeep instance you trust (HTTPS with a valid certificate required). The other admin receives a **durable pairing request** — delivered even if their server was offline at the time — and accepts it once. After that, **any user can share a note with any user on the peer**: the share box lists the **real people on the other server** with a server badge (no URL to type), and edits sync **both ways, instantly**. Unsharing/deletes propagate across the link, and avatars carry over.
- 🛡️ **Built to stay reliable** — the feature has its **own protocol version**, independent of the app version, so a normal GlassKeep update never breaks an existing link. Each link's state is always explicit — **online / offline / locked / out of date** — shown both on the note and in the admin panel, and a peer can change domain/port without losing the link (or its notes). When a peer can't be reached, its shared notes stay fully visible but go **read-only with a clear banner** until it's back, so the two copies never diverge.

### 🐛 Fixed
- 🖼️ **Your profile (avatar / name) now syncs across your devices** — the user profile was cached at login and never re-read, so an avatar set on one device never appeared on another — not even after Ctrl+F5 (which doesn't clear `localStorage`); only a fresh/incognito session showed it. The app now refreshes your profile from the server on boot and on window focus.
- 🔒 **No more redundant "instance locked" toast** — when an instance is at-rest-locked, the dedicated unlock banner already says so, so the extra error toast(s) that any in-flight request could raise are now suppressed.
- 🔑 **Passkey list display fixed** : in Settings → *Passkeys*, a key able to unlock the encrypted instance rendered with its badges and "last used" text overlapping the action buttons (an unreadable mess on desktop and mobile). Each passkey row now lays out cleanly: the action buttons are left-aligned and wrap to their own line when space is tight, with the long unlock button last.

### 🛠️ Upgrade

Cross-server collaboration needs **both servers on HTTPS with a valid certificate and a stable domain**, plus an admin on each side to accept the one-time pairing. Set this server's display name in Admin → *Cross-server collaboration* before pairing. No new dependencies; the database migrates automatically on restart.

## v2.5.0 — 2026-06-08

### ➕ Added
- 🎨 **Login page theme (admin)** — from Admin → *Login page settings*, choose the colour theme applied to the login screen for all visitors (**GlassKeep**, **Emerald**, **Amber**, **Ruby**, **Graphite**, **Blush**). Completely independent of each user's own workspace theme — logged-in users keep their personal choice untouched.
- ⏰ **Note reminders** — set a date/time on any note via quick presets or a date picker. Fires once; changing the time to a future value re-arms it. Reminded notes show a bell pill on their card. Shared notes notify both owner and all collaborators.
- 📋 **Reminders sidebar view** — dedicated "Reminders" section in the sidebar listing all upcoming reminders ordered by date.
- 🔔 **In-app reminder delivery (SSE)** — reminder card delivered in real time over the existing SSE connection when the app is open.
- 🌐 **Web Push reminders** — browser/PWA push notification when the app is backgrounded or closed. VAPID keys are auto-generated and persisted on first boot (`~/.vapid.json` next to the DB, mode 0600); set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` env vars to override.
- 🤖 **Android native reminders (no FCM)** — exact on-device alarms (`AlarmManager.setExactAndAllowWhileIdle`, re-armed after reboot via `ReminderBootReceiver`). A `WorkManager` periodic job (~15 min, `NetworkType.CONNECTED`) polls `GET /api/reminders/upcoming` and re-arms alarms for reminders created on other devices. No Firebase / Google Play Services dependency.
- 🔋 **Battery optimization onboarding card** (Android) — optional `WelcomeScreen` card requesting `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; never blocks setup.
- 👥 **`shared_note_deleted_with_copy` notification** — collaborators receive a notification (with an "Open" action targeting the copy) when an owner deletes a shared note but leaves them a personal copy.

### 🐛 Fixed
- **Login-screen flash on cold load** — background renders a placeholder (mean colour + BlurHash) before first paint, dark mode applied early, decorative cards no longer stack at the top on load.
- **Checklist section collapsed state now syncs across devices** — collapsed/expanded state was kept in `localStorage` (device-local). It's now persisted on the section entry (`collapsed: true`) in the note's items, so it follows the note across devices and survives refresh. Old checklists default to expanded.

### 🛠️ Upgrade

VAPID keys are generated on first boot — no manual setup needed. To enable browser/PWA push: Settings → Notifications (requires HTTPS with domain name). For Android native reminders, install APK **1.4.6** (build it or download the release). See [`REMINDERS.md`](./REMINDERS.md) for architecture and test tooling.

## 🚀 v2.4.5 — 2026-05-31

Two headline features: fully **customisable branding** (each instance can theme its login page from the UI, nothing hard-coded) and **interface colour themes** — pick a workspace theme and the whole app chrome (header, sidebar, notes background, scrollbars, panels, icons, buttons and editor highlights) recolours coherently in light **and** dark mode, while your notes stay exactly as they are. The release also lands a big **desktop performance pass**, a **seamless desktop-PWA title bar**, a round of **mobile chrome polish**, and fixes one-click in-app updates on **Synology Container Manager / DSM**.

### ➕ Added
- 🎨 **Interface themes (workspace theme picker)** — from Settings → *UI Preferences* → *Workspace theme*, choose between **GlassKeep** (the validated default), **Emerald**, **Amber**, **Ruby**, **Graphite** and **Blush**. Each theme is a coherent recolour of the same design system — it retints the **header, sidebar, notes-area background, global scrollbars, Settings/Admin panels, section icons, active/hover states, primary buttons (and their glow), the read/edit toggle, the rich-text toolbar highlights and the search/field focus rings** — without ever touching your notes, note colours or the note cards. Fully **light + dark aware**, and the choice is **saved on the server** so it follows you across devices and reloads (with a clean fall-back to GlassKeep). The mobile PWA status bar and, where the platform allows it, the bottom navigation bar follow the active theme too.
- 🏷️ **Login page branding (admin)** — from Admin → *Login page settings*, set a custom **app name** (≤ 10 chars), **logo** and **login background image** with an adjustable **blur**. The name + logo also drive the in-app header, the browser tab title and the favicon (kept square so it isn't flattened). Everything is optional and light/dark-aware; unset values fall back to the defaults, and the content panels stay legible over any image.
- 📲 **Installable PWA adapts to your branding** — the PWA install name and icon now use the instance's custom app name and logo instead of the bundled defaults.
- ⚡ **Desktop performance pass** — the header and sidebar now use a static, **blur-free "fake-glass"** recipe (token-driven, no per-frame GPU re-raster), the floating background cards pause while you scroll and while an overlay is open, note-card callbacks are stabilised so the masonry grid no longer re-renders on unrelated state changes, and note previews/images are lighter. Scrolling, opening and closing notes feel noticeably smoother on laptops, with the glass aesthetic preserved.
- 🪟 **"Reduce transparency effects"** — a flattened, no-`backdrop-filter` rendering path (on by default) for weaker GPUs, keeping only the modal scrim blur.
- 🖥️ **Seamless desktop PWA title bar** — the installed desktop app's header and sidebar blend into the Windows title bar with no visible seam line, and the sidebar's edge no longer crosses the header.
- 📱 **Mobile chrome polish** — the header sits flush with the status bar in a single flat colour, the sidebar and the Settings/Admin/sync panels match the chrome, the **sync status opens as a full-width top sheet** (like the notifications), and a **Scan QR** entry was added to the header kebab menu.

### 🐛 Fixed
- 🐳 **One-click update on Synology (and any `root:root` docker.sock)** — the container entrypoint discovered the Docker socket's owning group at runtime but **skipped** granting access when that group was GID 0 (root) — exactly how Synology DSM / Container Manager exposes it (`root:root`, no `docker` group). The unprivileged `node` user could never open the socket, so the admin panel kept showing **"Update manually"** and suggested adding a mount that was already present. The entrypoint now adds `node` to the root group when the socket is `root:root`, so one-click updates work after recreating the container once. (Hosts with a normal non-zero `docker` group, e.g. most Debian/Ubuntu setups, are unaffected.)
- 🔎 **Accurate self-update diagnostics** — the backend now distinguishes *socket missing* vs *mounted but permission denied* vs *daemon unreachable*, and the admin panel shows the matching remedy instead of always telling you to add a mount you may already have.
- 🌐 **Android app no longer escapes to the external browser** — same-host links now stay inside the in-app WebView instead of opening Brave/Chrome.
- 📶 **No more "stuck offline"** — an SSE hello/ping is now treated as proof the server is reachable, clearing a false offline state.
- 🎚️ **Multi-select button toggles correctly** — tapping it again closes the selection bar instead of scrolling the page down.
- 🌗 **Android status bar colour restored** after closing a note, instead of keeping the note's colour.
- 📱 **Header stays flush with the status bar when flinging to the top** — the native WebView overscroll bounce no longer creates a brief gap between the header and the status bar.
- 🔄 **QR scanner disables pull-to-refresh** (and the device back button closes it) so scanning isn't interrupted.

### 🛠️ Upgrade

> **Synology / Docker users:** pull the new image and recreate the container **once** — stop then start the project in Container Manager, or run `docker compose up -d --force-recreate`. After that first recreate, the **"Update now"** button appears and every future update is one-click.

## 🚀 v2.4.0 — 2026-05-24

Headline change: a **completely rewritten in-app notification system**. Every toast, error, share alert and admin event now flows through a single provider, renders as a premium LED-neon card in the floating viewport, and shows up in a new **Notification Center** panel (bell icon in the header) with full cross-device history sync over SSE. The release also lands actionable admin notifications (approve / refuse pending registrations, deletion confirmations), live cross-session sync of user settings, a mobile Notification Center with swipe-to-dismiss, a collaboration-notification pass (owners get told when collaborators walk away), an editor paste/copy polish pass, a **"Read mode for notes"** opt-out, and a major Android app maturity pass (in-app APK self-updater, first-launch welcome screen, F-Droid-aware build).

### ➕ Added
- 🔔 **Centralised notification system** — a new context provider replaces the legacy toast layer. One `notify({ variant, title, message, icon, action, persistent })` call surfaces a floating card with a 2.5 px LED-style border in the variant colour (info=blue / success=green / warning=amber / error=red), a tinted background, the right Tabler icon, and an optional inline action button
- 🪟 **Notification Center panel** — bell icon in the header shows an unread badge and opens a neutral glass panel listing the full history with per-row actions, per-row delete, and a single **"Clear all"** button. Closing the bell hides the floating stack so the panel becomes the single source of truth
- ⏳ **Countdown bar on temporary notifications** — auto-dismissing cards now show a full-width bottom-edge progress bar in the notification's variant colour, synced with the remaining display time
- 📱 **Mobile Notification Center with swipe-to-dismiss** — the panel goes full-screen on mobile, the device back button closes it, and individual cards can be swiped away
- 📡 **Cross-device history sync over SSE** — the notification history is stored server-side and replayed on every device. Opening the bell, deleting a row or clicking "Clear all" syncs across all open sessions; history also survives sign-out / sign-in cycles without duplicating cards
- ⚙️ **Notifications settings section** — dedicated panel for position (top-left / center / right + bottom variants), default duration (5 s / 10 s / 20 s / 30 s / persistent), master sound toggle and **per-category sound opt-outs** (share / access / success / warning / error / info) with a distinct icon per category
- 🔁 **Live cross-session sync of user settings** — preferences changed in one tab or device propagate over SSE to every other open session in real time, no reload required
- 🛂 **Approve / Refuse from admin pending-registration notifications** — when a new user signs up, admins get a notification with inline **Approve** and **Refuse** actions so the decision can be made without opening the admin panel
- 🗑️ **Real confirmation when deleting a user (admin)** — admin user deletion now goes through a proper confirmation flow instead of a single click
- 📣 **Admin notification when a user is deleted** — admins receive a notification whenever an account is removed, so the action is visible across the team
- 🔓 **"Open" action on retained copies after access removal** — when a note owner revokes your access but lets you keep a personal copy, the notification now exposes a direct **Open** button to jump to that copy
- 🤝 **Collaboration notifications** — the four-state revoke message (with / without copy, ex-collaborator side / owner side) plus a brand-new **"X left this note"** toast for the owner when a collaborator walks away (either by removing themselves in the collaboration modal or by deleting their copy from their own list)
- 📋 **Paste-mode preference** — Settings toggle to make Ctrl+V always paste as plain text, with the Plain / Formatted choice stacked under the relevant description
- 👁 **"Read mode for notes" toggle** — when off, text and drawing notes open directly in edit mode and the read/edit button is hidden from the modal footer; ideal for users who edit far more often than they re-read. Default stays on so existing users keep the read-by-default behaviour. Saved server-side, applied across all your devices
- 🪟 **Collapsible categories** in the Settings and Admin panels — open/closed state per category persisted in `localStorage` and synced via `PATCH /user/settings`
- 📐 **Configurable sidebar breakpoint** — the "Always show sidebar on wide screens" threshold is now a 5-preset dropdown (Tablet → Desktop, default 1280 px) instead of the hard-coded 700 px
- 🔄 **In-app APK self-updater** (APK 1.4.0+) — background check against GitHub Releases on cold start, throttled to one network call every 12 h. When a newer APK is published a heads-up notification fires; tapping downloads the file silently into the app's cache and hands it to Android's native install dialog
- ⚙️ **Manual "Check for updates" in Settings → Application** — bypasses the throttle, shows the installed APK version, and surfaces a themed in-app card with Download / Later actions when an update is detected
- 👋 **First-launch welcome screen** — explains why the Android app asks for each OS permission (microphone, camera, notifications, install unknown apps) with a per-card Grant / Granted ✓ / Refused ✗ status. Sits in a 2-step swipeable pager next to the existing server-URL setup screen
- 🌐 **F-Droid-aware single APK** — runtime detection disables the in-app updater on F-Droid installs and replaces the Settings Application section with a one-tap "Open F-Droid" shortcut that lands the user on the GlassKeep page. The welcome screen also hides the install-unknown-apps and notifications cards F-Droid users don't need
- 📦 **APK filename auto-versioned** — Android Studio's Build → Build APK(s) now produces `GlassKeep-v<versionName>.apk` directly, matching the asset name the in-app updater scans for on GitHub Releases

### 🔄 Changed
- 📲 **Mobile single-tap arms code-block / inline-code copy** — touch devices used to need a long-press or two taps; one tap now arms the copy button, which auto-hides after 5 s if not used

### 🐛 Fixed
- 🔢 **Ordered-list counter resets correctly** — a numbered list that follows a real paragraph break restarts at 1 instead of continuing the previous list's numbering
- ☑️ **Checklist placeholder no longer italic** — the empty-row placeholder in checklists renders in the regular note style instead of italics
- 📝 **Cleaner rich-text → plain-text copy** — copying from the editor no longer injects large blank gaps in the plain-text output: HTML is stripped for code-block selections, bare `<li>` items are re-wrapped, and line breaks survive paste-back
- 🧰 **Rich-text toolbar stays on one line for long notes** — the toolbar no longer wraps just because a long note adds a vertical scrollbar; its width is stabilised so layout doesn't shift between short and long notes
- 🤫 **No more autofocus on existing untitled notes** — opening a saved note with no title used to drop the cursor into the body editor as if it were a new note. Cursor placement now matches saved notes regardless of title
- 🔗 **Tapping a link in a note no longer pops the mobile keyboard** — iOS / Android Chrome were focusing the underlying ProseMirror surface on the same touch event that fired the link. Capture-phase guards now block the focus while letting the link navigate through
- 🎨 **Empty drawing drafts and accidental taps ignored** — stray single taps on the drawing canvas no longer create empty drawing notes
- 🧷 **Hidden accordion content marked `aria-hidden` + `inert`** so screen readers and Tab navigation skip it
- ↩️ **Redo restores edits after autosave** — once a note had been autosaved (green check in the modal header), pressing Redo right after an Undo silently kept the undone content on screen. The rich-text editor's echo-prevention ref was left pointing at the user's last typed doc after an external `setContent`, so the redone value was treated as a self-echo and skipped. The ref now tracks what's actually installed in the editor, so redo applies the snapshot every time
- 📱 **Mobile scroll FPS lift on the notes list** — dropped the per-card backdrop blur on touch devices, memoised the masonry card render, and added `loading="lazy"` to inline note images. The desktop glass aesthetic stays unchanged

### 🛠️ Upgrade

> **If you're on v2.3.5 or above**, the update can be triggered directly from the app (Settings → Application → Check for updates).

> **If you're below v2.3.5**, use the command matching your install:

**Native install:**
```bash
curl -fsSL https://raw.githubusercontent.com/Victor-root/glasskeep-enhanced/main/install.sh | sudo bash
```

**Docker:**
```bash
docker compose pull && docker compose up -d
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
