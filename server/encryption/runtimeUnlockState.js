// server/encryption/runtimeUnlockState.js
// Holds the data-encryption key (DEK) in RAM only when the instance is
// unlocked. The DEK never touches disk in clear form: on lock/restart it
// is wiped from memory, and only the wrapped copies (under the
// passphrase and the recovery key) survive in SQLite.
//
// This module also tracks failed unlock attempts in-process to provide a
// minimal rate-limit. It is intentionally simple: the threat model is
// not "thousands of bots hammering the endpoint", but "an admin/attacker
// trying a handful of guesses on a stolen-then-resurrected instance".

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_BASE_DELAY_MS = 500;
const ATTEMPT_MAX_DELAY_MS = 30 * 1000;
const ATTEMPT_MAX_PER_WINDOW = 20;

let state = {
  enabled: false,
  locked: true,
  dek: null,         // Buffer | null
  unlockedAt: null,  // ISO string
};

const attemptsByIp = new Map(); // ip -> { count, firstAt, lastAt }

function setEnabled(enabled) {
  state.enabled = !!enabled;
  if (!state.enabled) {
    // Disabling clears any DEK in memory.
    wipe(state.dek);
    state.dek = null;
    state.locked = false;
    state.unlockedAt = null;
  } else if (!state.dek) {
    state.locked = true;
  }
}

function wipe(buf) {
  if (Buffer.isBuffer(buf)) {
    try { buf.fill(0); } catch { /* best effort */ }
  }
}

function unlockWithDek(dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== 32) {
    throw new Error("Invalid DEK");
  }
  // Replace any previous DEK and zero it out.
  wipe(state.dek);
  state.dek = Buffer.from(dek); // own copy
  state.locked = false;
  state.unlockedAt = new Date().toISOString();
}

function lock() {
  wipe(state.dek);
  state.dek = null;
  state.locked = true;
  state.unlockedAt = null;
}

function getDek() {
  if (!state.enabled) return null;
  if (state.locked) return null;
  return state.dek;
}

function isEnabled() { return state.enabled; }
function isLocked()  { return state.enabled && state.locked; }
function isUnlocked() { return state.enabled && !state.locked && !!state.dek; }
function isUnlockedOrDisabled() { return !state.enabled || (!state.locked && !!state.dek); }

function snapshot() {
  return {
    enabled: state.enabled,
    locked: state.locked,
    unlockedAt: state.unlockedAt,
  };
}

// ── Attempt rate limiting ─────────────────────────────────────────────
function recordAttempt(ip, success) {
  const now = Date.now();
  let entry = attemptsByIp.get(ip);
  if (!entry || now - entry.firstAt > ATTEMPT_WINDOW_MS) {
    entry = { count: 0, firstAt: now, lastAt: 0 };
    attemptsByIp.set(ip, entry);
  }
  if (success) {
    attemptsByIp.delete(ip);
    return;
  }
  entry.count += 1;
  entry.lastAt = now;
}

function attemptDelayMs(ip) {
  const entry = attemptsByIp.get(ip);
  if (!entry) return 0;
  if (entry.count <= 1) return 0;
  const delay = ATTEMPT_BASE_DELAY_MS * Math.pow(2, entry.count - 1);
  return Math.min(delay, ATTEMPT_MAX_DELAY_MS);
}

function attemptOverLimit(ip) {
  const entry = attemptsByIp.get(ip);
  if (!entry) return false;
  return entry.count >= ATTEMPT_MAX_PER_WINDOW;
}

module.exports = {
  setEnabled,
  unlockWithDek,
  lock,
  getDek,
  isEnabled,
  isLocked,
  isUnlocked,
  isUnlockedOrDisabled,
  snapshot,
  recordAttempt,
  attemptDelayMs,
  attemptOverLimit,
};
