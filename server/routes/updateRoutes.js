// server/routes/updateRoutes.js
//
// The "a new version is available" check for admins: the latest GitHub
// release, cached for a few hours, and how many times each admin has
// been shown the notification for it.

const pkg = require("../../package.json");
const { isStrictlyNewer } = require("../services/semver");

const GITHUB_URL =
  "https://api.github.com/repos/Victor-root/glasskeep-enhanced/releases/latest";
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

function getTtlMs() {
  const raw = parseInt(process.env.UPDATE_CHECK_TTL_MS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

let cache = null; // { data, fetchedAt }

async function fetchLatest() {
  if (typeof fetch !== "function") {
    throw new Error("global fetch unavailable (Node 18+ required)");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GITHUB_URL, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "glasskeep-enhanced-update-check",
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) throw new Error("github status " + res.status);
    const j = await res.json();
    return {
      tag: j.tag_name || null,
      url: j.html_url || null,
      publishedAt: j.published_at || null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function attachUpdateRoutes(app, { db, auth, adminOnly, log = console } = {}) {
  // Per-admin view counter for the "new version available" notification.
  // Keyed by (user_id, version) so a freshly published version starts
  // every admin's counter back at zero. Stored server-side so the cap
  // (3 displays) holds across every device the admin signs in on, not
  // just the browser that incremented the counter.
  if (db) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS update_notification_views (
          user_id INTEGER NOT NULL,
          version TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, version)
        );
      `);
    } catch (err) {
      if (log && typeof log.warn === "function") {
        log.warn("update-notification-views table init failed:", err.message);
      }
    }
  }

  const getViewCount = (userId, version) => {
    if (!db || !userId || !version) return 0;
    try {
      const row = db
        .prepare(
          `SELECT count FROM update_notification_views WHERE user_id = ? AND version = ?`,
        )
        .get(userId, version);
      return row ? Number(row.count) || 0 : 0;
    } catch {
      return 0;
    }
  };

  app.get("/api/update-check", auth, adminOnly, async (req, res) => {
    const currentVersion = pkg.version;
    const now = Date.now();
    const ttl = getTtlMs();

    const buildPayload = (data, fetchedAt, stale) => {
      const latestVersion = data.latestVersion;
      const userId = req.user && req.user.id;
      const notificationShownCount =
        latestVersion && data.updateAvailable
          ? getViewCount(userId, latestVersion)
          : 0;
      return {
        ...data,
        currentVersion,
        notificationShownCount,
        checkedAt: new Date(fetchedAt).toISOString(),
        stale,
      };
    };

    if (cache && now - cache.fetchedAt < ttl) {
      return res.json(buildPayload(cache.data, cache.fetchedAt, false));
    }

    try {
      const r = await fetchLatest();
      const latestVersion = r.tag ? r.tag.replace(/^v/i, "") : null;
      const data = {
        currentVersion,
        latestVersion,
        updateAvailable: latestVersion
          ? isStrictlyNewer(latestVersion, currentVersion)
          : false,
        releaseUrl: r.url || null,
        publishedAt: r.publishedAt || null,
      };
      cache = { data, fetchedAt: now };
      return res.json(buildPayload(data, now, false));
    } catch (err) {
      if (log && typeof log.warn === "function") {
        log.warn("update-check failed:", err.message);
      }
      if (cache) {
        return res.json(buildPayload(cache.data, cache.fetchedAt, true));
      }
      return res.json(
        buildPayload(
          {
            currentVersion,
            latestVersion: null,
            updateAvailable: false,
            releaseUrl: null,
            publishedAt: null,
          },
          now,
          true,
        ),
      );
    }
  });

  // Increment the per-admin "I have shown the update notification for
  // version X" counter. The client calls this every time it renders the
  // card; the cap (3 displays) is enforced client-side by reading
  // notificationShownCount from /update-check and skipping notify() at
  // or above the threshold. Storing the raw counter (rather than a
  // boolean "dismissed") lets future tuning of the cap reuse the same
  // table without a migration.
  app.post("/api/update-check/mark-shown", auth, adminOnly, (req, res) => {
    const userId = req.user && req.user.id;
    const version = req.body && req.body.version;
    if (!db || !userId || !version || typeof version !== "string") {
      return res.status(400).json({ error: "missing version" });
    }
    try {
      db.prepare(
        `INSERT INTO update_notification_views (user_id, version, count)
         VALUES (?, ?, 1)
         ON CONFLICT(user_id, version)
         DO UPDATE SET count = count + 1`,
      ).run(userId, version);
      const count = getViewCount(userId, version);
      return res.json({ count });
    } catch (err) {
      if (log && typeof log.warn === "function") {
        log.warn("update-check mark-shown failed:", err.message);
      }
      return res.status(500).json({ error: "internal error" });
    }
  });
}

module.exports = { attachUpdateRoutes };
