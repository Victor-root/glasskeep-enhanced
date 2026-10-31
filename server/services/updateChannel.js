// server/services/updateChannel.js
//
// Which version an admin is offered, on the channel they chose.
//
//   stable  the latest GitHub release, as always.
//   beta    the latest stable release or the latest validated beta,
//           whichever is newer. Betas are pushed to the `beta` branch;
//           a workflow runs the rollback test on each push and only then
//           moves `beta-validated` to it and publishes its Docker image
//           (ghcr.io/...:beta-<commit>). The update check reads that
//           branch, never `beta` itself, so nothing untested reaches an
//           instance.
//
// A beta keeps one version across many pushes (2.8.0-beta): a beta of the
// same version is newer when its commit differs. Each candidate's own
// package.json is read too, for its database format level (dbCompat):
// leaving the beta for a release that cannot read the beta's data has to
// say so first (see routes/updateChannelRoutes.js).
//
// UPDATE_GITHUB_REPO lets a fork offer its own releases and betas;
// UPDATE_GITHUB_API / UPDATE_GITHUB_RAW point the check at other hosts.

const { compareVersions } = require("./semver");
const { buildLabel, dbCompatOf } = require("./buildInfo");

const CHANNELS = new Set(["stable", "beta"]);
const VALIDATED_BETA_BRANCH = "beta-validated";
const DEFAULT_REPO = "Victor-root/glasskeep-enhanced";
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
// "Check now" from the panel. GitHub answers 60 unauthenticated requests
// an hour per address and a check makes up to three: this floor keeps a
// clicking admin far from that limit.
const MANUAL_CHECK_MIN_AGE_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

function ttlMs() {
  const raw = parseInt(process.env.UPDATE_CHECK_TTL_MS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

function source() {
  return {
    repo: process.env.UPDATE_GITHUB_REPO || DEFAULT_REPO,
    api: (process.env.UPDATE_GITHUB_API || "https://api.github.com").replace(/\/+$/, ""),
    raw: (process.env.UPDATE_GITHUB_RAW || "https://raw.githubusercontent.com").replace(/\/+$/, ""),
  };
}

async function getJson(url, { allow404 = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "glasskeep-enhanced-update-check",
        Accept: "application/vnd.github+json",
      },
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error(`${url}: status ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function manifestAt(ref) {
  const { repo, raw } = source();
  return getJson(`${raw}/${repo}/${encodeURIComponent(ref)}/package.json`);
}

async function fetchLatestStable() {
  const { repo, api } = source();
  const release = await getJson(`${api}/repos/${repo}/releases/latest`);
  const tag = release?.tag_name;
  if (!tag) return null;
  const manifest = await manifestAt(tag);
  const version = String(tag).replace(/^v/i, "");
  return {
    kind: "release",
    version,
    label: version,
    commit: null,
    dbCompat: dbCompatOf(manifest),
    url: release.html_url || null,
    publishedAt: release.published_at || null,
  };
}

async function fetchLatestBeta() {
  const { repo, api } = source();
  const head = await getJson(`${api}/repos/${repo}/commits/${VALIDATED_BETA_BRANCH}`, { allow404: true });
  if (!head?.sha) return null;
  const manifest = await manifestAt(head.sha);
  if (!manifest?.version) return null;
  return {
    kind: "beta",
    version: manifest.version,
    label: buildLabel(manifest.version, head.sha),
    commit: head.sha,
    dbCompat: dbCompatOf(manifest),
    url: null,
    publishedAt: head.commit?.committer?.date || null,
  };
}

// Whether `candidate` would replace the running `build`.
function isNewerThanBuild(candidate, build) {
  if (!candidate) return false;
  const order = compareVersions(candidate.version, build.version);
  if (order === 1) return true;
  return order === 0 && candidate.kind === "beta" && build.beta && candidate.commit !== build.commit;
}

// What to offer: the newest of the candidates the channel allows that
// would replace the running build, or null.
function chooseTarget({ channel, build, stable, beta }) {
  const offers = [stable, channel === "beta" ? beta : null].filter((c) => isNewerThanBuild(c, build));
  if (offers.length < 2) return offers[0] || null;
  return compareVersions(beta.version, stable.version) === 1 ? beta : stable;
}

function createUpdateChannel({ db, build, log = console }) {
  const readChannel = db.prepare("SELECT value FROM app_meta WHERE key = 'update_channel'");
  const writeChannel = db.prepare(
    "INSERT INTO app_meta (key, value) VALUES ('update_channel', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  let cache = null; // { channel, data, fetchedAt }

  function getChannel() {
    const value = readChannel.get()?.value;
    return CHANNELS.has(value) ? value : "stable";
  }

  function setChannel(channel) {
    if (!CHANNELS.has(channel)) throw new Error(`unknown update channel: ${channel}`);
    writeChannel.run(channel);
    cache = null;
  }

  // The latest stable release and, on the beta channel, the latest
  // validated beta, with what to offer. Cached; a failed check answers
  // the last good one, marked stale, or throws when there is none.
  // `manual` asks GitHub again unless the last answer is under a minute
  // old; `force` always does.
  async function check({ force = false, manual = false } = {}) {
    const channel = getChannel();
    const now = Date.now();
    const maxAge = manual ? MANUAL_CHECK_MIN_AGE_MS : ttlMs();
    if (!force && cache && cache.channel === channel && now - cache.fetchedAt < maxAge) {
      return { ...cache.data, checkedAt: cache.fetchedAt, stale: false };
    }
    try {
      const [stable, beta] = await Promise.all([
        fetchLatestStable(),
        channel === "beta"
          ? fetchLatestBeta().catch((e) => {
            log.warn?.(`update-check: beta lookup failed: ${e.message}`);
            return null;
          })
          : null,
      ]);
      const data = { channel, stable, beta, target: chooseTarget({ channel, build, stable, beta }) };
      cache = { channel, data, fetchedAt: now };
      return { ...data, checkedAt: now, stale: false };
    } catch (e) {
      log.warn?.(`update-check failed: ${e.message}`);
      if (cache && cache.channel === channel) return { ...cache.data, checkedAt: cache.fetchedAt, stale: true };
      throw e;
    }
  }

  return { getChannel, setChannel, check };
}

module.exports = { CHANNELS, VALIDATED_BETA_BRANCH, chooseTarget, isNewerThanBuild, createUpdateChannel };
