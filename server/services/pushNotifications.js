// server/services/pushNotifications.js
//
// Web Push (PWA push notifications) for the note-reminders feature.
// Thin wrapper around the `web-push` library plus the persistence of
// per-device push subscriptions in the `push_subscriptions` table.
//
// Push works OUT OF THE BOX: the VAPID key pair is resolved at startup
// with the precedence env -> persisted file -> freshly generated (and
// persisted). So a fresh install or an upgrade enables push with ZERO
// manual setup, and the key stays STABLE across restarts (subscriptions
// are bound to it). If keys truly can't be resolved (e.g. a read-only data
// dir) the module degrades to a no-op and in-app reminders over SSE keep
// working untouched. See init()/resolveKeys() below.
//
// VAPID keys identify this server to the browser push services
// (FCM / Apple / Mozilla). To bring your OWN pair (optional — otherwise
// one is generated automatically), generate it with:
//
//   npx web-push generate-vapid-keys
//
// then set it in the server environment (.env) — an explicit pair always
// wins over the auto-generated one:
//
//   VAPID_PUBLIC_KEY=...
//   VAPID_PRIVATE_KEY=...
//   VAPID_SUBJECT=mailto:you@example.com   # optional, defaults to a mailto
//
// The PUBLIC key is exposed to the browser (it has to be — it's the
// applicationServerKey passed to pushManager.subscribe). The PRIVATE
// key MUST stay server-side and is never sent to the client.

const webpush = require("web-push");
const fs = require("fs");

// `subject` must be a mailto: or https: URL per the VAPID spec.
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@glasskeep.local";

let configured = false;
let publicKey = "";
let privateKey = "";

// Resolve the VAPID key pair at startup, with precedence:
//   1. environment   (operator-provided / install.sh / a manual .env)
//   2. persisted file (auto-generated on an earlier boot)
//   3. freshly generated — and persisted for next time
// This makes push work with ZERO manual setup on a fresh install or after
// an upgrade, while keeping the key STABLE across restarts (subscriptions
// are bound to it — it must never change once devices have subscribed).
// An explicit env pair always wins. `persistFile` is a plain JSON file in
// the data dir (mirrors the Docker .jwt_secret pattern); the private key
// is no more sensitive than JWT_SECRET, which also lives in plain config.
function resolveKeys(persistFile, log) {
  const envPub = (process.env.VAPID_PUBLIC_KEY || "").trim();
  const envPriv = (process.env.VAPID_PRIVATE_KEY || "").trim();
  if (envPub && envPriv) return { publicKey: envPub, privateKey: envPriv, source: "env" };

  if (!persistFile) return { publicKey: "", privateKey: "", source: "none" };

  // Reuse keys generated on a previous boot.
  try {
    if (fs.existsSync(persistFile)) {
      const o = JSON.parse(fs.readFileSync(persistFile, "utf8"));
      if (o && o.publicKey && o.privateKey) {
        return { publicKey: o.publicKey, privateKey: o.privateKey, source: "file" };
      }
    }
  } catch (e) {
    log.warn?.("[push] couldn't read persisted VAPID keys:", e?.message);
  }

  // First boot without keys → generate a pair and persist it (0600).
  try {
    const keys = webpush.generateVAPIDKeys();
    fs.writeFileSync(
      persistFile,
      JSON.stringify({ publicKey: keys.publicKey, privateKey: keys.privateKey }, null, 2),
      { mode: 0o600 },
    );
    try { fs.chmodSync(persistFile, 0o600); } catch { /* FS may not support chmod */ }
    return { publicKey: keys.publicKey, privateKey: keys.privateKey, source: "generated" };
  } catch (e) {
    log.warn?.("[push] couldn't generate/persist VAPID keys:", e?.message);
    return { publicKey: "", privateKey: "", source: "none" };
  }
}

// `opts.persistFile`: where to store auto-generated keys (index.js passes a
// path next to the SQLite DB). Omit it to disable auto-generation.
function init(log = console, opts = {}) {
  const resolved = resolveKeys(opts.persistFile || null, log);
  publicKey = resolved.publicKey;
  privateKey = resolved.privateKey;
  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
      configured = true;
      const how =
        resolved.source === "env" ? "from environment" :
        resolved.source === "file" ? "from persisted file" :
        "auto-generated";
      log.log?.(`[push] Web Push enabled (VAPID keys ${how})`);
    } catch (e) {
      configured = false;
      log.warn?.("[push] Invalid VAPID keys — Web Push disabled:", e?.message);
    }
  } else {
    configured = false;
    log.warn?.(
      "[push] Web Push disabled — couldn't resolve VAPID keys (in-app notifications still work).",
    );
  }
  return configured;
}

function isConfigured() {
  return configured;
}

function getPublicKey() {
  return configured ? publicKey : null;
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
