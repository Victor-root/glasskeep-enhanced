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

**Background sync (so reminders created elsewhere still fire on the phone).**
Local alarms only cover reminders the phone already knows about — a reminder
created on the **desktop** (or another device) while the phone app is closed
wouldn't be armed. To close that gap **without any push service**, a
`ReminderSyncWorker` (WorkManager) runs **every ~15 min even when the app is
closed**, calls `GET /api/reminders/upcoming`, and re-arms the local alarms
(`ReminderScheduler.syncAll`). The web app hands the session token to native
(`AndroidReminders.setAuth`) so the worker can authenticate while the app is
shut. Net effect: a reminder created anywhere reaches the closed phone within
~15 min, then fires **exactly on time** (the alarm itself is Doze-proof).

- **Auth:** the JWT + `server_url` live in app-private SharedPreferences; the
  worker sends `Authorization: Bearer <token>`. If the app isn't opened for
  > 7 days the token expires and sync pauses until the next launch.
- **Battery:** the **first-launch onboarding** offers an *optional* card to
  **exempt the app from battery optimization** — aggressive OEMs
  (Xiaomi/Samsung/Huawei…) otherwise kill the worker and alarms. It never gates
  setup; declining just lowers reliability, and it can be set later in Android
  Settings → Apps → GlassKeep → Battery → Unrestricted.
- **TLS:** the worker uses the system trust store, so the server needs a
  **trusted certificate** (Let's Encrypt is fine). A **self-signed** cert
  fails the background fetch — in-app sync (while the app is open) still works.

### Why WorkManager, and not Google / FCM
Waking a fully-closed app instantly is normally FCM's job — i.e. **Google Play
Services**. We deliberately **don't** use it, to keep GlassKeep free of a
Google dependency. The realistic options and their trade-offs:

| Approach | Closed-app delivery | Google? | Extra to install | Cost |
| --- | --- | --- | --- | --- |
| **WorkManager + local alarm** (chosen) | ✅ | ❌ none | ❌ none | ~15 min to learn a *remotely-created* reminder; then exact |
| FCM (Firebase) | ✅ instant | ⚠️ yes | none | ties the app to Google |
| ntfy / UnifiedPush | ✅ instant | ❌ | an ntfy server **+** the ntfy app | extra moving parts |
| Persistent foreground service | instant-ish | ❌ | none | permanent notification + battery, and Doze can still delay it |

WorkManager is **AndroidX → JobScheduler (AOSP)**, *not* Google Play Services,
so it adds **no Google dependency**. The only price is the ~15 min worst-case
latency for a reminder **created on another device** while the phone is fully
closed; for the common cases (set on the phone, or set in advance on any
device) it fires exactly on time. "Instant **and** closed **and** no Google
**and** nothing to install" is not achievable on Android (OS limitation), so
we optimise for **no Google, nothing external** and accept that one trade-off.

> Apple/Google note: a PWA's closed-state push is bound to the **browser
> vendor's** push service (Chrome/Brave → Google FCM, Firefox → Mozilla,
> Safari/iOS → Apple). That's the browser's choice, the payload is encrypted
> end-to-end, and no Google account/Firebase project is involved. The **APK**
> path above avoids it entirely.

### Service worker
The Web Push `push` / `notificationclick` handlers live in
`public/push-sw.js` and are layered onto the Workbox-generated service
worker via `workbox.importScripts` in `vite.config.js`. This is Workbox's
supported extension point — all existing offline/precache behaviour is
preserved untouched.

---

## Web Push setup (auto-configured)

Push works **out of the box — no manual setup**. On first boot the server
**generates a VAPID key pair and persists it** next to the SQLite DB
(`.vapid.json`, mode `0600`), then reuses it across restarts. A fresh
install **or an upgrade** therefore enables push automatically. On boot
you'll see one of:

```
[push] Web Push enabled (VAPID keys auto-generated)        # first boot
[push] Web Push enabled (VAPID keys from persisted file)   # later boots
[push] Web Push enabled (VAPID keys from environment)      # you set your own
```

### Bring your own keys (optional)

To use a specific pair instead of the auto-generated one — an explicit pair
**always wins** — generate it:

```bash
npx web-push generate-vapid-keys
```

and set it in your server `.env` (e.g. `/opt/glass-keep/.env`):

```ini
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:you@example.com
```

- The **public** key is sent to browsers (it's the `applicationServerKey`).
  The **private** key stays server-side and is **never** shipped to the
  client or committed to the repo.
- ⚠️ The key must stay **stable**: push subscriptions are bound to it, so
  changing it invalidates every existing subscription (devices must
  re-enable push). That's exactly why it's persisted, not regenerated each
  boot.
- `VAPID_SUBJECT` is a contact URL required by the spec (a `mailto:` is fine).

Optional tuning:

```ini
# Reminder scheduler sweep cadence in ms (default 30000)
REMINDER_SWEEP_MS=30000
```

### Enable push on each device

In **Settings → Notifications → Push notifications (reminders)**, toggle
it on and accept the browser permission prompt. HTTPS is required.

---

## Environment variables (summary)

| variable             | required | default          | purpose                                   |
| -------------------- | -------- | ---------------- | ----------------------------------------- |
| `VAPID_PUBLIC_KEY`   | no¹      | auto-generated   | Web Push application server (public) key  |
| `VAPID_PRIVATE_KEY`  | no¹      | auto-generated   | Web Push private key (**secret**)         |
| `VAPID_SUBJECT`      | no       | `mailto:admin@…` | VAPID contact URL (`mailto:`/`https:`)    |
| `REMINDER_SWEEP_MS`  | no       | `30000`          | Scheduler sweep interval (ms)             |

¹ Auto-generated and persisted (`.vapid.json` next to the DB) on first boot,
so push works with no setup. Set **both** to pin your own pair (it wins).

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

**Set the reminder for you** — exactly like setting it by hand in the UI,
minus the typing and the wait. Run on the host/LXC:

```bash
# Admin JWT is derived from the server .env + DB, like test-notification.cjs.
node scripts/test-reminder.cjs <noteId>           # due now -> fires in ~1s
node scripts/test-reminder.cjs <noteId> --in 20   # due in 20 seconds
# e.g.
node scripts/test-reminder.cjs 1777374322541-t1vpuv
```

It writes `reminder_at` / clears `reminder_fired_at` / bumps
`client_updated_at` and broadcasts the note update — the **same state change
the UI makes** — then, for the default "now", runs the real scheduler sweep
so it fires immediately through the genuine pipeline: the in-app card (with
**Open**) on any open session, a persisted notification, and a Web Push for
PWAs. With `--in <sec>` it's left to fire naturally on the next sweep; on the
Android app the broadcast also re-arms the on-device alarm, so `--in 20` +
backgrounding the app reproduces the native "app closed" notification without
any manual setup.

**Instant native notification** (the on-device alarm + tap-to-open), via adb
to a **debug** APK:

```bash
# phone over USB, or `adb connect <phone-ip>:5555` for wireless first
scripts/test-reminder-native.sh <noteId> "Title" "Body"
```

It broadcasts to `ReminderDebugReceiver` — a **debug-only** receiver (absent
from release builds) that raises the real reminder notification immediately,
even with the app open. The fastest way to exercise the **closed-app native
path** on demand, since the server can't reach a closed WebView app.

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
- `server/services/pushNotifications.js` — VAPID (auto-generated) + subscription storage + send.
- `GET /api/reminders/upcoming` (`server/index.js`) — feed for the Android background sync.
- `public/push-sw.js` — service-worker push / click handlers.
- `src/components/notes/ReminderPicker.jsx` — the date/time picker.
- `src/components/notes/NoteReminderChip.jsx` — the card pill.
- `src/push/pushClient.js` — browser subscribe/unsubscribe helpers.
- `src/components/settings/PushNotificationToggle.jsx` — the Settings toggle.
- `src/utils/androidReminders.js` — JS bridge to the APK (sync alarms + hand over auth).
- `android/.../reminders/ReminderScheduler.kt` — arms exact local alarms on the device.
- `android/.../reminders/ReminderSyncWorker.kt` — WorkManager background sync (no Google).
