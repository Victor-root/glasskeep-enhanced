# Note Reminders

Google Keep–style reminders for Glass Keep: attach a date & time to any
note, see it in a dedicated **Reminders** sidebar view, and get notified
when it's due — both in-app and (optionally) as a real system push
notification on installed PWAs.

This document covers how the feature works, the (optional) Web Push
setup, how to test it, and the known limitations.

---

## What it does

- **Set / edit / clear a reminder** on a note from the note editor's
  footer (the bell button), with quick presets (*Later today*,
  *Tomorrow*, *Next week*) and a plain date + time picker.
- A note with a reminder shows a **bell pill** with the date/time on its
  card. Past-due reminders are shown muted (never auto-deleted).
- A **Reminders** entry in the sidebar lists every note that has a
  reminder. It is a *filtered view* over your normal notes — a reminded
  note still appears in the main list too.
- When a reminder comes due, the server delivers:
  - an **in-app notification** (the existing notification system / bell)
    to any open session, over SSE; and
  - a **Web Push** system notification to the user's installed PWAs
    (when push is configured and the user has opted in).
- On the **Android app (APK)** the notification is raised by an **on-device
  local alarm** (a WebView has no Web Push), so it works fully offline and
  with the app closed. **Tapping** the notification — or its **Open**
  action — opens the target note directly.
- A reminder fires **exactly once**. Editing a fired reminder to a new
  (future) time re-arms it.

---

## How it works (architecture)

### Data model
Two plain columns are added to the existing `notes` table (added
idempotently by the `ensureNoteColumns` migration — no data is recreated
or lost):

| column              | meaning                                              |
| ------------------- | ---------------------------------------------------- |
| `reminder_at`       | ISO-8601 UTC due instant, or `NULL` (no reminder)    |
| `reminder_fired_at` | ISO-8601 UTC when dispatched, or `NULL` (still due)  |

These are deliberately **not** encrypted at rest: they carry no note
content, and the scheduler must query them with plain SQL regardless of
the at-rest-encryption unlock state. A partial index
(`idx_notes_pending_reminders`) keeps the "what's due" sweep cheap.

### Setting a reminder
`POST /api/notes/:id/reminder` with `{ reminderAt, client_updated_at }`
(`reminderAt: null` clears it). Owner **or** collaborator may set it. It
follows the same last-write-wins + offline-queue model as archive/pin
(sync op type `reminder`), so it works offline and re-arms the reminder
(`reminder_fired_at → NULL`) on every change.

### Firing a reminder
A lightweight scheduler (`server/services/reminderScheduler.js`) sweeps
every 30s for rows where `reminder_at <= now AND reminder_fired_at IS
NULL`. Each due row is **claimed** with a conditional `UPDATE` that
stamps `reminder_fired_at`; only the writer that flipped it from `NULL`
dispatches — so a reminder can never fire twice, and one that fell due
while the server was down is caught on the next sweep after boot.

Dispatch (in `server/index.js`) reuses the **existing notification
pipeline**: it persists a `reminder` notification row (title *"Reminder"*,
body = the note's title or a content preview), pushes it over SSE, and
sends a Web Push to each of the recipient's devices.

### In-app vs. push (no duplicates)
- App **open & focused** on a device → the in-app card shows; the service
  worker **suppresses** the system notification on that device.
- App **closed / backgrounded** → the system push shows.

Other devices are independent: your phone (app closed) still gets the
push while your desktop (app open) shows the in-app card.

### Android app (APK): local alarms + tap-to-open
The Android wrapper is a WebView, which has **no Web Push API**. Instead the
web app mirrors every upcoming reminder to the native layer over the
`AndroidReminders` JS bridge, and `ReminderScheduler` arms an **exact
`AlarmManager` alarm** per reminder (re-armed after reboot by
`ReminderBootReceiver`). When it fires:

- app **closed / backgrounded** → `ReminderAlarmReceiver` posts the system
  notification via `ReminderNotifier`;
- app **foregrounded** → it's skipped, because the in-app SSE card already
  shows it (same no-duplicate rule as the PWA service worker).

**Tap-to-open:** the notification's content intent (and its **Open** action)
carries the note id to `WebViewActivity`, which—once the page is ready—calls
`window.__glasskeepOpenNote(noteId)` in the web app to pop that note's modal.
On a cold start the hook stashes the id and opens the note as soon as the
notes list has hydrated.

### Service worker
The Web Push `push` / `notificationclick` handlers live in
`public/push-sw.js` and are layered onto the Workbox-generated service
worker via `workbox.importScripts` in `vite.config.js`. This is Workbox's
supported extension point — all existing offline/precache behaviour is
preserved untouched.

---

## Web Push setup (optional)

Push is **opt-in and optional**. Without VAPID keys the server logs that
push is disabled and everything else (in-app reminders included) works
normally.

### 1. Generate VAPID keys (once)

```bash
npx web-push generate-vapid-keys
```

This prints a `Public Key` and a `Private Key`.

### 2. Configure the server environment

Add to your server `.env` (e.g. `/opt/glass-keep/.env`):

```ini
VAPID_PUBLIC_KEY=<public key from step 1>
VAPID_PRIVATE_KEY=<private key from step 1>
VAPID_SUBJECT=mailto:you@example.com
```

- The **public** key is sent to browsers (it must be — it's the
  `applicationServerKey`). The **private** key stays server-side and is
  **never** shipped to the client or committed to the repo.
- `VAPID_SUBJECT` is a contact URL required by the spec (a `mailto:` is
  fine).

Optional tuning:

```ini
# Reminder scheduler sweep cadence in ms (default 30000)
REMINDER_SWEEP_MS=30000
```

### 3. Restart the server

On boot you should see `[push] Web Push enabled (VAPID keys present)`.

### 4. Enable push on each device

In **Settings → Notifications → Push notifications (reminders)**, toggle
it on and accept the browser permission prompt. HTTPS is required.

---

## Environment variables (summary)

| variable             | required | default          | purpose                                   |
| -------------------- | -------- | ---------------- | ----------------------------------------- |
| `VAPID_PUBLIC_KEY`   | for push | —                | Web Push application server (public) key  |
| `VAPID_PRIVATE_KEY`  | for push | —                | Web Push private key (**secret**)         |
| `VAPID_SUBJECT`      | no       | `mailto:admin@…` | VAPID contact URL (`mailto:`/`https:`)    |
| `REMINDER_SWEEP_MS`  | no       | `30000`          | Scheduler sweep interval (ms)             |

---

## Manual testing

```bash
npm install      # picks up the new `web-push` dependency
npm run build    # production build (also regenerates the service worker)
npm run dev      # or run the API + Vite dev servers
```

1. Create a note without a reminder — it behaves exactly as before.
2. Open a note → footer bell → set a reminder → the bell turns accent.
3. Close the note: the card shows the reminder pill.
4. Open the **Reminders** sidebar entry → the note is listed.
5. The same note is still visible in the normal notes view.
6. Edit the reminder's date/time; then remove it.
7. After removal, the note disappears from **Reminders**.
8. Set a reminder ~1–2 minutes out, keep the app open → the in-app
   notification appears at the due time (and dings if sound is on).
9. (Push) Install the PWA on a phone, enable push in Settings, set a
   reminder a few minutes out, **close the app** → the system
   notification arrives. Confirm there's no duplicate when the app is
   open on the same device.
10. Confirm archive, trash, tags and existing notifications still work.

### Fire a reminder on demand (no waiting)

Two helpers trigger a reminder **instantly** so you don't have to set one
and wait for it.

**Server pipeline** (in-app card over SSE + Web Push) — run on the host/LXC:

```bash
# Admin JWT is derived from the server .env + DB, like test-notification.cjs.
node scripts/test-reminder.cjs <noteId>
# e.g.
node scripts/test-reminder.cjs 1777374322541-t1vpuv
```

This runs the real `dispatchReminder()`: the note's recipients get the in-app
card (with **Open**) on any open session, and installed PWAs get a Web Push.
It does **not** touch the note's own `reminder_at`, so a real reminder you've
set on it still fires later as scheduled.

**Native Android notification** (the on-device local alarm + tap-to-open) —
via adb to a **debug** APK:

```bash
# phone over USB, or `adb connect <phone-ip>:5555` for wireless first
scripts/test-reminder-native.sh <noteId> "Title" "Body"
```

It broadcasts to `ReminderDebugReceiver` — a **debug-only** receiver (absent
from release builds) that raises the real reminder notification immediately,
even with the app open. This is the only way to exercise the **closed-app
native path** on demand, since the server can't reach a closed WebView app.

---

## Known limitations

- **Native app vs. PWA push (and Brave)**: the **Android APK** delivers
  reminders through an **on-device local alarm** — no Google services, no
  VAPID, no browser push — which makes it the **most reliable** closed-app
  path. A **PWA** instead depends on **Web Push**, delivered on Android via
  the browser's push service (Chrome / Google Play Services). On **Brave for
  Android**, Web Push is **unreliable / often unavailable** because Brave
  strips that Google push component, so background reminders in a Brave PWA
  may never arrive. For closed-app reminders prefer the **APK**; if you want
  a PWA, use **Chrome** with VAPID keys configured. The in-app card (app
  open) works in **any** browser, Brave included.
- **iOS**: Web Push only works inside an **installed** PWA ("Add to Home
  Screen") on **iOS 16.4+** — never in a regular Safari tab. The Settings
  toggle detects this and shows a hint. Android (installed PWA or Chrome)
  works normally.
- **HTTPS required** for service workers + push (localhost is exempt for
  development).
- Push timing is best-effort: device power-saving (Doze, etc.) can delay
  delivery by seconds/minutes. This is inherent to Web Push.
- **Reminder language**: the localized text ("Reminder") uses the
  recipient's saved language (Settings → language); users left on
  automatic detection get English. The note body in the message is
  shown as-is.
- **Shared notes**: a note has one reminder; when it fires, every
  participant (owner + collaborators) is notified.
- **Location-based reminders are not supported** (web PWAs can't reliably
  geofence in the background) — time/date reminders only, by design.

---

## Files of interest

- `server/services/reminderScheduler.js` — the due-sweep loop.
- `server/services/pushNotifications.js` — VAPID + subscription storage + send.
- `public/push-sw.js` — service-worker push / click handlers.
- `src/components/notes/ReminderPicker.jsx` — the date/time picker.
- `src/components/notes/NoteReminderChip.jsx` — the card pill.
- `src/push/pushClient.js` — browser subscribe/unsubscribe helpers.
- `src/components/settings/PushNotificationToggle.jsx` — the Settings toggle.
