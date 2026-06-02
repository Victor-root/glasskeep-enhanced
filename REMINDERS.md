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

A quick server-side firing test (in-app path) without a browser:

```bash
# with the dev API running and a user that owns a note:
# POST /api/notes/:id/reminder { reminderAt: <a few seconds ago>, client_updated_at: <now> }
# then GET /api/notifications/pending → a { type: "reminder" } row appears.
```

---

## Known limitations

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
