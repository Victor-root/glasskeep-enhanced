// server/services/pushNotifications.js
//
// Web Push (PWA push notifications) for the note-reminders feature.
// Thin wrapper around the `web-push` library plus the persistence of
// per-device push subscriptions in the `push_subscriptions` table.
//
// Push is OPT-IN and OPTIONAL: if the VAPID keys aren't configured in
// the environment the whole module degrades to a no-op (logged once at
// startup) and the rest of the app — including in-app reminder
// notifications over SSE — keeps working untouched.
//
// VAPID keys identify this server to the browser push services
// (FCM / Apple / Mozilla). Generate a pair once with:
//
//   npx web-push generate-vapid-keys
//
// then set them in the server environment (.env):
//
//   VAPID_PUBLIC_KEY=...
//   VAPID_PRIVATE_KEY=...
//   VAPID_SUBJECT=mailto:you@example.com   # optional, defaults to a mailto
//
// The PUBLIC key is exposed to the browser (it has to be — it's the
// applicationServerKey passed to pushManager.subscribe). The PRIVATE
// key MUST stay server-side and is never sent to the client.

const webpush = require("web-push");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
// `subject` must be a mailto: or https: URL per the VAPID spec.
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@glasskeep.local";

let configured = false;

function init(log = console) {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      configured = true;
      log.log?.("[push] Web Push enabled (VAPID keys present)");
    } catch (e) {
      configured = false;
      log.warn?.("[push] Invalid VAPID keys — Web Push disabled:", e?.message);
    }
  } else {
    configured = false;
    log.log?.(
      "[push] Web Push disabled — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to enable push reminders (in-app notifications still work).",
    );
  }
  return configured;
}

function isConfigured() {
  return configured;
}

function getPublicKey() {
  return configured ? VAPID_PUBLIC_KEY : null;
}

// Upsert a subscription keyed by its endpoint. Re-subscribing the same
// device (e.g. after the SW updates its keys) replaces the old row and
// re-points it at the current user, rather than piling up duplicates.
function saveSubscription(db, userId, subscription, userAgent, lang) {
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw new Error("Invalid subscription");
  }
  const { endpoint } = subscription;
  const { p256dh, auth } = subscription.keys;
  if (!p256dh || !auth) throw new Error("Invalid subscription keys");
  // Only keep a known UI language; anything else is left NULL so the
  // server falls back to the user's profile language.
  const normalizedLang = lang === "fr" || lang === "en" ? lang : null;
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, lang, created_at)
     VALUES (@user_id, @endpoint, @p256dh, @auth, @user_agent, @lang, @created_at)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent,
       lang = excluded.lang`,
  ).run({
    user_id: userId,
    endpoint,
    p256dh,
    auth,
    user_agent: userAgent || null,
    lang: normalizedLang,
    created_at: new Date().toISOString(),
  });
}

function removeSubscription(db, endpoint) {
  if (!endpoint) return;
  try {
    db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  } catch {
    /* ignore */
  }
}

function listSubscriptions(db, userId) {
  return db
    .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
    .all(userId);
}

// Send a push payload to every device a user has registered. Returns
// the number of pushes accepted by the push service. Dead endpoints
// (404 Not Found / 410 Gone) are pruned so we don't keep retrying them.
// Any send error is swallowed per-subscription so one bad endpoint can
// never crash the scheduler or take down a reminder for other devices.
async function sendToUser(db, userId, payload, log = console) {
  if (!configured) return 0;
  const subs = listSubscriptions(db, userId);
  if (subs.length === 0) return 0;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(subscription, body, { TTL: 60 * 60 });
        sent += 1;
      } catch (err) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          // Subscription is permanently gone — drop it.
          removeSubscription(db, s.endpoint);
          log.log?.("[push] pruned expired subscription", code);
        } else {
          log.warn?.("[push] send failed:", code || err?.message);
        }
      }
    }),
  );
  return sent;
}

module.exports = {
  init,
  isConfigured,
  getPublicKey,
  saveSubscription,
  removeSubscription,
  sendToUser,
};
