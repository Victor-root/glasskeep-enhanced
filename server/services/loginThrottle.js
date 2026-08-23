// server/services/loginThrottle.js
//
// Slows down password guessing on the sign-in routes without getting in
// the way of the person who owns the account.
//
// The balance that shapes every number below: someone who genuinely
// forgot which of their passwords they used will try a handful, maybe a
// dozen, in a row. That must stay free of any penalty. A dictionary run
// is a different animal, thousands of tries in a row, and it is the only
// thing this module is meant to stop.
//
// So: the first ten failures cost nothing. After that each failure adds
// a short pause before the answer, and past a much higher count the
// address (or the account) is put on hold for a while. A success wipes
// the slate for both keys immediately.
//
// Two counters, because they catch different things:
//   - per account, so one account cannot be hammered from many places;
//   - per address, so one machine cannot sweep every account in turn.
// The address ceiling is higher: a whole household or office can sit
// behind a single address, and their failures add up.
//
// State lives in memory. GlassKeep is a single-process server, and a
// restart clearing the counters is acceptable: an attacker cannot
// trigger a restart, and the operator who can has better options.

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

// Failures that cost nothing at all. Ten is deliberately generous.
const FREE_ATTEMPTS = 10;

// Past the free ones, each failure waits a little longer before the
// answer comes back. Linear, capped: enough to make a scripted run
// crawl, short enough that a human retrying does not think it hung.
const DELAY_STEP_MS = 1000;
const MAX_DELAY_MS = 8000;

// Hard stop, per window.
const MAX_PER_ACCOUNT = 25;
const MAX_PER_ADDRESS = 60;

// Guard against a flood of distinct keys eating memory (an attacker can
// invent identifiers freely). Well above any real deployment.
const MAX_TRACKED_KEYS = 20000;

const buckets = new Map(); // key -> { count, firstAt, blockedUntil }

function prune(now) {
  for (const [key, entry] of buckets) {
    if (entry.blockedUntil > now) continue;
    if (now - entry.firstAt > WINDOW_MS) buckets.delete(key);
  }
}

function read(key, now) {
  const entry = buckets.get(key);
  if (!entry) return null;
  if (entry.blockedUntil > now) return entry;
  if (now - entry.firstAt > WINDOW_MS) {
    buckets.delete(key);
    return null;
  }
  return entry;
}

function bump(key, now, ceiling) {
  let entry = read(key, now);
  if (!entry) {
    if (buckets.size >= MAX_TRACKED_KEYS) prune(now);
    entry = { count: 0, firstAt: now, blockedUntil: 0 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count >= ceiling) entry.blockedUntil = now + BLOCK_MS;
  return entry;
}

function addressKey(ip) { return "ip:" + (ip || "0.0.0.0"); }
function accountKey(id) { return "acct:" + String(id); }

// How long the caller must wait before another try is even looked at.
// 0 means "go ahead". Returned in seconds because that is what the
// Retry-After header wants.
function blockedForSeconds({ ip, accountId }) {
  const now = Date.now();
  const address = read(addressKey(ip), now);
  let until = address?.blockedUntil || 0;

  // The account ceiling is deliberately NOT turned against a caller who
  // has not been guessing. Otherwise anyone who knows an email address
  // could lock its owner out of their own server at will, which trades
  // one problem for a worse one. An address that has already burned its
  // free attempts is a caller who has been guessing, and it is held to
  // the account's budget too.
  if (accountId != null && (address?.count || 0) >= FREE_ATTEMPTS) {
    const account = read(accountKey(accountId), now);
    if (account && account.blockedUntil > until) until = account.blockedUntil;
  }
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

// The pause to apply before answering a failure, derived from whichever
// counter is further along.
function penaltyMs({ ip, accountId }) {
  const now = Date.now();
  let worst = 0;
  for (const key of [addressKey(ip), accountId != null ? accountKey(accountId) : null]) {
    if (!key) continue;
    const entry = read(key, now);
    if (entry && entry.count > worst) worst = entry.count;
  }
  if (worst <= FREE_ATTEMPTS) return 0;
  return Math.min((worst - FREE_ATTEMPTS) * DELAY_STEP_MS, MAX_DELAY_MS);
}

// Call on every failed sign-in. accountId is optional: an unknown email
// has no account to charge, but the address still pays.
function recordFailure({ ip, accountId }) {
  const now = Date.now();
  bump(addressKey(ip), now, MAX_PER_ADDRESS);
  if (accountId != null) bump(accountKey(accountId), now, MAX_PER_ACCOUNT);
}

// Call on every successful sign-in: the person proved they belong, so
// neither counter has anything left to say.
function recordSuccess({ ip, accountId }) {
  buckets.delete(addressKey(ip));
  if (accountId != null) buckets.delete(accountKey(accountId));
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

// Test seam: the scenarios need a clean slate between phases.
function reset() { buckets.clear(); }

module.exports = {
  FREE_ATTEMPTS,
  MAX_PER_ACCOUNT,
  MAX_PER_ADDRESS,
  blockedForSeconds,
  penaltyMs,
  recordFailure,
  recordSuccess,
  sleep,
  reset,
};
