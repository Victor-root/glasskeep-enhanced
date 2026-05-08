const pkg = require("../../package.json");

const GITHUB_URL =
  "https://api.github.com/repos/Victor-root/glasskeep-enhanced/releases/latest";
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

function getTtlMs() {
  const raw = parseInt(process.env.UPDATE_CHECK_TTL_MS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

let cache = null; // { data, fetchedAt }

function parseSemver(v) {
  if (!v) return null;
  const m = String(v).trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isNewer(latest, current) {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

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

function attachUpdateRoutes(app, { auth, adminOnly, log = console } = {}) {
  app.get("/api/update-check", auth, adminOnly, async (req, res) => {
    const currentVersion = pkg.version;
    const now = Date.now();
    const ttl = getTtlMs();

    if (cache && now - cache.fetchedAt < ttl) {
      return res.json({
        ...cache.data,
        currentVersion,
        checkedAt: new Date(cache.fetchedAt).toISOString(),
        stale: false,
      });
    }

    try {
      const r = await fetchLatest();
      const latestVersion = r.tag ? r.tag.replace(/^v/i, "") : null;
      const data = {
        currentVersion,
        latestVersion,
        updateAvailable: latestVersion
          ? isNewer(latestVersion, currentVersion)
          : false,
        releaseUrl: r.url || null,
        publishedAt: r.publishedAt || null,
      };
      cache = { data, fetchedAt: now };
      return res.json({
        ...data,
        checkedAt: new Date(now).toISOString(),
        stale: false,
      });
    } catch (err) {
      if (log && typeof log.warn === "function") {
        log.warn("update-check failed:", err.message);
      }
      if (cache) {
        return res.json({
          ...cache.data,
          currentVersion,
          checkedAt: new Date(cache.fetchedAt).toISOString(),
          stale: true,
        });
      }
      return res.json({
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        publishedAt: null,
        checkedAt: new Date(now).toISOString(),
        stale: true,
      });
    }
  });
}

module.exports = { attachUpdateRoutes };
