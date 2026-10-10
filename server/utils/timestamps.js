// server/utils/timestamps.js
//
// The current instant, and the strict ISO parsing and last-write-wins
// comparison every note write goes through.

const nowISO = () => new Date().toISOString();

// ── LWW timestamp validation & comparison ──
// All timestamps must be valid ISO 8601 UTC. We parse, validate, and normalize
// before storage so comparisons are always reliable (millisecond precision).
// Rejects: non-ISO strings, offsets other than Z (force canonical UTC),
// absurd future skew (>5 min ahead).
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Parse and validate an ISO timestamp string.
 * Returns { ms, iso } on success, null on failure.
 * Only accepts full ISO 8601 with Z suffix (canonical UTC).
 */
function parseIsoTimestamp(ts) {
  if (typeof ts !== "string" || !ts) return null;
  // Must be a valid ISO string ending in Z (UTC)
  // Accept: 2026-04-01T12:34:56.789Z or 2026-04-01T12:34:56Z
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(ts)) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return { ms: d.getTime(), iso: d.toISOString() };
}

/**
 * Validate a client timestamp for LWW.
 * Returns { ms, iso } on success.
 * Returns { error: string } if invalid or too far in the future.
 */
function validateLwwTimestamp(ts) {
  const parsed = parseIsoTimestamp(ts);
  if (!parsed) return { error: `Invalid timestamp format (expected ISO 8601 UTC ending in Z): ${ts}` };
  if (parsed.ms > Date.now() + MAX_FUTURE_SKEW_MS) {
    return { error: `Timestamp too far in the future: ${ts}` };
  }
  return parsed;
}

// La date d'affichage d'une note, à ne pas confondre avec l'horodatage de
// départage entre appareils juste au-dessus. Elle peut légitimement être
// ancienne (une note importée d'ailleurs), donc rien ne borne le passé,
// mais elle doit être une vraie date.
//
// Elle n'était vérifiée nulle part. Les archives et la corbeille étant
// triées dessus par comparaison de chaînes, une valeur fantaisiste se
// plaçait devant les notes réellement récentes. On la normalise au format
// ISO pour que toutes les dates stockées se comparent entre elles.
function normalizeDisplayTimestamp(value) {
  if (value === undefined || value === null || value === "") return { iso: null };
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return { error: `Invalid timestamp: ${value}` };
  return { iso: new Date(ms).toISOString() };
}

/**
 * LWW comparison on milliseconds.
 * Returns true if incoming should win (newer or equal).
 */
function isNewerOrEqual(incomingMs, storedTs) {
  if (!storedTs) return true;       // no stored timestamp → first write wins
  if (!incomingMs) return false;    // no incoming → reject
  const storedParsed = parseIsoTimestamp(storedTs);
  if (!storedParsed) return true;   // stored is corrupt → accept to fix it
  return incomingMs >= storedParsed.ms;
}

module.exports = {
  nowISO,
  parseIsoTimestamp,
  validateLwwTimestamp,
  normalizeDisplayTimestamp,
  isNewerOrEqual,
};
