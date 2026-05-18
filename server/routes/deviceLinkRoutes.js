// server/routes/deviceLinkRoutes.js
//
// Cross-device sign-in via QR code (a.k.a. "Web QR login", the same
// pattern WhatsApp Web / Discord / Steam use). Lets a user sign in on
// a foreign PC without typing the password into it:
//
//   1. PC hits POST /api/device-link/create → server returns a short
//      one-time token + expiry. The PC encodes the token into a QR
//      code and shows it on the login screen.
//   2. PC polls GET /api/device-link/poll?token=… every couple of
//      seconds. As long as the phone hasn't approved, the server
//      returns { status: "pending" }.
//   3. User opens the GlassKeep app on a phone where they're already
//      signed in, points the camera at the QR, sees a confirmation
//      ("Sign in <browser> from <ip>?"), and taps Approve.
//   4. Phone POST /api/device-link/approve with the token + its
//      Bearer JWT. Server records `user_id` against the challenge.
//   5. PC's next poll returns { status: "approved", token: <jwt>,
//      user: {…} } and the challenge is marked "consumed" so the
//      same QR can't be replayed.
//
// Security notes:
//
//   - Token: 32 random bytes (base64url) → 256 bits of entropy. Single
//     use, expires after DEFAULT_TTL_MS (2 min by default).
//   - Approval requires the phone to be ALREADY authenticated (the
//     server cross-checks the bearer JWT) — i.e. a stolen QR alone
//     can't grant access; the attacker also needs the user's phone.
//   - The phone is shown the PC's User-Agent + a masked IP so the
//     user can sanity-check that the QR on screen really belongs to
//     the machine in front of them.
//   - The challenge stores the user_id that approved it. The poll
//     response materialises a JWT for THAT user — never the polling
//     PC's claimed identity (the PC didn't claim one).
//   - Locked-instance behaviour: the lock middleware only allow-lists
//     /api/instance/* + a few public routes. /api/device-link/* go
//     through the regular gate, so the phone can't approve when the
//     instance is locked (it would need to be unlocked first to
//     authenticate anyway). The PC's poll keeps returning "pending"
//     and naturally expires.

const crypto = require("crypto");

const TOKEN_BYTES = 32;
const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes — generous enough for
//                                       a user to pick up their phone,
//                                       unlock it, open the app and
//                                       scan, without being so long that
//                                       a forgotten QR stays valid for
//                                       hours.

function nowIso() {
  return new Date().toISOString();
}
function futureIso(ms) {
  return new Date(Date.now() + ms).toISOString();
}
function isExpired(challenge) {
  if (!challenge?.expires_at) return true;
  return new Date(challenge.expires_at).getTime() < Date.now();
}

// Mask the IP we show to the phone so the confirmation screen doesn't
// expose the PC's full public address — enough information for "yes
// that looks like my home network", not enough to plot the user on a
// map.
function maskIp(ip) {
  if (!ip) return null;
  const cleaned = String(ip).replace(/^::ffff:/, "");
  if (
    cleaned === "127.0.0.1" ||
    cleaned === "::1" ||
    cleaned === "localhost"
  ) {
    return "localhost";
  }
  if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  }
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    const head = parts.slice(0, 3).filter(Boolean).join(":");
    return head ? `${head}::` : "ipv6";
  }
  return "***";
}

function attachDeviceLinkRoutes(
  app,
  { db, auth, signToken, getUserById, log = console } = {},
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_link_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      user_id INTEGER,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      pc_user_agent TEXT,
      pc_ip TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_dlc_token ON device_link_challenges(token);
    CREATE INDEX IF NOT EXISTS idx_dlc_status ON device_link_challenges(status);
  `);

  // Best-effort housekeeping — fires whenever a new challenge is
  // created, which is more than often enough to keep the table small.
  // We don't schedule a setInterval (the dataset is tiny and the
  // server doesn't want phantom timers keeping the event loop alive).
  function cleanupExpiredAndConsumed() {
    try {
      // Expired pending → mark expired (not deleted yet, so a slow
      // poll still gets a clean answer instead of a 404).
      db.prepare(
        `UPDATE device_link_challenges
           SET status = 'expired'
         WHERE status = 'pending' AND expires_at < ?`,
      ).run(nowIso());
      // Old terminal rows → drop. Keeping consumed/rejected rows for
      // 15 min gives the PC enough time to read its final poll.
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      db.prepare(
        `DELETE FROM device_link_challenges
         WHERE status IN ('consumed','rejected','expired')
           AND COALESCE(consumed_at, expires_at) < ?`,
      ).run(fifteenMinAgo);
    } catch (e) {
      if (log && typeof log.warn === "function") {
        log.warn("[device-link] cleanup failed:", e.message);
      }
    }
  }

  // ── 1. PC: create a challenge ────────────────────────────────────
  app.post("/api/device-link/create", (req, res) => {
    cleanupExpiredAndConsumed();
    const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
    const created = nowIso();
    const expires = futureIso(DEFAULT_TTL_MS);
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 200);
    const ip = req.ip || req.socket?.remoteAddress || null;
    try {
      db.prepare(
        `INSERT INTO device_link_challenges
           (token, status, created_at, expires_at, pc_user_agent, pc_ip)
         VALUES (?, 'pending', ?, ?, ?, ?)`,
      ).run(token, created, expires, userAgent, ip);
    } catch (e) {
      log.error("[device-link] create failed:", e.message);
      return res.status(500).json({ error: "Could not create challenge" });
    }
    res.json({
      token,
      expiresIn: DEFAULT_TTL_MS,
      expiresAt: expires,
      pollIntervalMs: 2000,
    });
  });

  // ── 2. PC: poll for status ───────────────────────────────────────
  //
  // This endpoint is intentionally unauthenticated — the PC is the
  // one creating sessions, not consuming an existing one. The only
  // gate is "you must possess the token", which it does because it
  // created it. On approval the response carries a freshly minted
  // JWT for the user the phone approved as.
  app.get("/api/device-link/poll", (req, res) => {
    const token = String(req.query.token || "");
    if (!token) return res.status(400).json({ error: "Token required" });
    const c = db
      .prepare(`SELECT * FROM device_link_challenges WHERE token = ?`)
      .get(token);
    if (!c) return res.status(404).json({ error: "Unknown token" });

    // Expire on-the-fly so a long-polling PC sees the right state
    // even if the cleanup pass hasn't fired since.
    if (c.status === "pending" && isExpired(c)) {
      db.prepare(
        `UPDATE device_link_challenges SET status='expired' WHERE id=?`,
      ).run(c.id);
      return res.json({ status: "expired" });
    }
    if (c.status === "consumed") {
      return res.status(410).json({ status: "consumed" });
    }
    if (c.status === "rejected" || c.status === "expired") {
      return res.json({ status: c.status });
    }
    if (c.status === "approved") {
      // Mint the JWT and consume the challenge atomically — we don't
      // want two parallel polls to both walk away with a valid token.
      const user = c.user_id ? getUserById.get(c.user_id) : null;
      if (!user) {
        db.prepare(
          `UPDATE device_link_challenges SET status='rejected' WHERE id=?`,
        ).run(c.id);
        return res.json({ status: "rejected" });
      }
      const updated = db
        .prepare(
          `UPDATE device_link_challenges
             SET status='consumed', consumed_at=?
           WHERE id=? AND status='approved'`,
        )
        .run(nowIso(), c.id);
      if (updated.changes !== 1) {
        // Lost the race with another poller — treat as consumed.
        return res.status(410).json({ status: "consumed" });
      }
      const jwt = signToken(user);
      return res.json({
        status: "approved",
        token: jwt,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          is_admin: !!user.is_admin,
        },
      });
    }
    res.json({ status: c.status });
  });

  // ── 3. Phone: look up info about a scanned challenge ─────────────
  //
  // Returns what the phone needs to show its confirmation screen:
  // the PC's User-Agent string and a masked IP. Requires the phone
  // to be authenticated (we never want an unauthenticated client
  // enumerating outstanding device-link challenges).
  app.get("/api/device-link/info", auth, (req, res) => {
    const token = String(req.query.token || "");
    if (!token) return res.status(400).json({ error: "Token required" });
    const c = db
      .prepare(`SELECT * FROM device_link_challenges WHERE token = ?`)
      .get(token);
    if (!c) return res.status(404).json({ error: "Unknown token" });
    if (c.status !== "pending") {
      return res
        .status(409)
        .json({ error: "Already processed", status: c.status });
    }
    if (isExpired(c)) {
      db.prepare(
        `UPDATE device_link_challenges SET status='expired' WHERE id=?`,
      ).run(c.id);
      return res.status(410).json({ error: "Expired", status: "expired" });
    }
    res.json({
      status: c.status,
      createdAt: c.created_at,
      expiresAt: c.expires_at,
      userAgent: c.pc_user_agent || null,
      ip: maskIp(c.pc_ip),
    });
  });

  // ── 4. Phone: approve ────────────────────────────────────────────
  app.post("/api/device-link/approve", auth, (req, res) => {
    const token = String(req.body?.token || "");
    if (!token) return res.status(400).json({ error: "Token required" });
    const c = db
      .prepare(`SELECT * FROM device_link_challenges WHERE token = ?`)
      .get(token);
    if (!c) return res.status(404).json({ error: "Unknown token" });
    if (c.status !== "pending") {
      return res
        .status(409)
        .json({ error: "Already processed", status: c.status });
    }
    if (isExpired(c)) {
      db.prepare(
        `UPDATE device_link_challenges SET status='expired' WHERE id=?`,
      ).run(c.id);
      return res.status(410).json({ error: "Expired" });
    }
    const updated = db
      .prepare(
        `UPDATE device_link_challenges
           SET status='approved', user_id=?
         WHERE id=? AND status='pending'`,
      )
      .run(req.user.id, c.id);
    if (updated.changes !== 1) {
      // Status changed under our feet between the SELECT and UPDATE.
      return res.status(409).json({ error: "Already processed" });
    }
    res.json({ ok: true });
  });

  // ── 5. Phone: reject (optional, lets the user cancel an
  //    accidental scan without waiting for the QR to expire) ───────
  app.post("/api/device-link/reject", auth, (req, res) => {
    const token = String(req.body?.token || "");
    if (!token) return res.status(400).json({ error: "Token required" });
    db.prepare(
      `UPDATE device_link_challenges
         SET status='rejected'
       WHERE token=? AND status='pending'`,
    ).run(token);
    res.json({ ok: true });
  });

  if (log && typeof log.log === "function") {
    log.log("[device-link] routes ready");
  }
}

module.exports = {
  attachDeviceLinkRoutes,
  _internals: { maskIp, DEFAULT_TTL_MS, TOKEN_BYTES },
};
