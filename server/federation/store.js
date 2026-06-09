// server/federation/store.js
//
// Data layer for cross-server collaboration. One row in
// `federation_links` represents the relationship with ONE peer server,
// carrying it through its whole lifecycle (invited → accepted → active)
// and holding the latest health the periodic tick learned about the
// peer (reachable / locked / protocol).
//
// KEY DESIGN — the link id is stable. The peer's address
// (`peer_base_url`, the "phone number") can change: a self-hoster may
// move domain or port. We therefore identify the link by an immutable
// random `id` agreed once at pairing time, NOT by the URL. When a peer
// moves, only `peer_base_url` is rewritten; the link — and every shared
// note hanging off it — stays intact and simply resumes syncing at the
// new address. Nothing is ever lost to an address change.

const crypto = require("crypto");

function nowIso() {
  return new Date().toISOString();
}

function createFederationStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS federation_links (
      id TEXT PRIMARY KEY,                 -- stable link id (survives peer address changes)
      role TEXT NOT NULL,                  -- 'initiator' | 'acceptor'
      status TEXT NOT NULL,                -- see protocol.STATUS
      peer_base_url TEXT NOT NULL,         -- normalized https origin (the updatable address)
      peer_label TEXT,                     -- friendly name for the peer
      local_base_url TEXT,                 -- the origin we advertised to the peer
      shared_secret TEXT,                  -- base64 HMAC secret; NULL until active
      nonce TEXT,                          -- random value binding invite <-> accept
      invite_delivered INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      -- live health, refreshed by the federation tick on active links
      last_attempt_at TEXT,
      last_seen_at TEXT,
      peer_reachable INTEGER,              -- 0 | 1 | NULL(unknown)
      peer_locked INTEGER,                 -- 0 | 1 | NULL
      peer_app_version TEXT,
      peer_protocol INTEGER,
      protocol_compatible INTEGER,         -- 0 | 1 | NULL
      agreed_protocol INTEGER,
      last_error TEXT,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_federation_links_status ON federation_links(status);
    CREATE INDEX IF NOT EXISTS idx_federation_links_peer   ON federation_links(peer_base_url);
  `);

  const stmts = {
    insert: db.prepare(`
      INSERT INTO federation_links
        (id, role, status, peer_base_url, peer_label, local_base_url,
         shared_secret, nonce, invite_delivered, created_by, created_at, updated_at)
      VALUES
        (@id, @role, @status, @peer_base_url, @peer_label, @local_base_url,
         @shared_secret, @nonce, @invite_delivered, @created_by, @created_at, @updated_at)
    `),
    getById: db.prepare(`SELECT * FROM federation_links WHERE id = ?`),
    getByPeerUrl: db.prepare(`SELECT * FROM federation_links WHERE peer_base_url = ? ORDER BY created_at DESC LIMIT 1`),
    listAll: db.prepare(`SELECT * FROM federation_links ORDER BY created_at DESC`),
    listByStatus: db.prepare(`SELECT * FROM federation_links WHERE status = ? ORDER BY created_at DESC`),
    listActive: db.prepare(`SELECT * FROM federation_links WHERE status = 'active' ORDER BY created_at DESC`),
    // Links whose handshake still has outbound work (deliver the invite,
    // or deliver our acceptance) — driven by the tick until they settle.
    listHandshakePending: db.prepare(`
      SELECT * FROM federation_links
      WHERE status IN ('outgoing_pending','accepting')
      ORDER BY created_at ASC
    `),
    setStatus: db.prepare(`UPDATE federation_links SET status=?, updated_at=? WHERE id=?`),
    markInviteDelivered: db.prepare(`UPDATE federation_links SET invite_delivered=1, updated_at=? WHERE id=?`),
    // Acceptor side: the local admin accepted an incoming invitation.
    // We generate the shared secret here and record the address we want
    // the initiator to reach us at; the tick then delivers both back to
    // the initiator and flips us to 'active' once it confirms.
    setAccepting: db.prepare(`
      UPDATE federation_links
      SET status='accepting', shared_secret=?, local_base_url=?,
          peer_label=COALESCE(?, peer_label), updated_at=?
      WHERE id=?
    `),
    activate: db.prepare(`
      UPDATE federation_links
      SET status='active', shared_secret=@shared_secret, peer_base_url=@peer_base_url,
          peer_label=COALESCE(@peer_label, peer_label), updated_at=@updated_at
      WHERE id=@id
    `),
    updateHealth: db.prepare(`
      UPDATE federation_links SET
        last_attempt_at=@last_attempt_at,
        last_seen_at=COALESCE(@last_seen_at, last_seen_at),
        peer_reachable=@peer_reachable,
        peer_locked=@peer_locked,
        peer_app_version=COALESCE(@peer_app_version, peer_app_version),
        peer_protocol=COALESCE(@peer_protocol, peer_protocol),
        protocol_compatible=@protocol_compatible,
        agreed_protocol=@agreed_protocol,
        last_error=@last_error,
        updated_at=@updated_at
      WHERE id=@id
    `),
    updatePeerUrl: db.prepare(`UPDATE federation_links SET peer_base_url=?, updated_at=? WHERE id=?`),
    updatePeerLabel: db.prepare(`UPDATE federation_links SET peer_label=?, updated_at=? WHERE id=?`),
    remove: db.prepare(`DELETE FROM federation_links WHERE id=?`),
  };

  return {
    nowIso,
    newId: () => crypto.randomUUID(),
    newSecret: () => crypto.randomBytes(32).toString("base64"),
    newNonce: () => crypto.randomBytes(16).toString("base64url"),

    insert(row) {
      stmts.insert.run({
        peer_label: null,
        local_base_url: null,
        shared_secret: null,
        nonce: null,
        invite_delivered: 0,
        created_by: null,
        updated_at: row.created_at,
        ...row,
      });
      return stmts.getById.get(row.id);
    },
    getById: (id) => stmts.getById.get(id),
    getByPeerUrl: (url) => stmts.getByPeerUrl.get(url),
    listAll: () => stmts.listAll.all(),
    listByStatus: (status) => stmts.listByStatus.all(status),
    listActive: () => stmts.listActive.all(),
    listHandshakePending: () => stmts.listHandshakePending.all(),
    setStatus: (id, status) => stmts.setStatus.run(status, nowIso(), id),
    setAccepting: ({ id, shared_secret, local_base_url, peer_label }) =>
      stmts.setAccepting.run(shared_secret, local_base_url, peer_label ?? null, nowIso(), id),
    markInviteDelivered: (id) => stmts.markInviteDelivered.run(nowIso(), id),
    activate: ({ id, shared_secret, peer_base_url, peer_label }) =>
      stmts.activate.run({ id, shared_secret, peer_base_url, peer_label: peer_label ?? null, updated_at: nowIso() }),
    updateHealth: (id, h) =>
      stmts.updateHealth.run({
        id,
        last_attempt_at: h.last_attempt_at ?? nowIso(),
        last_seen_at: h.last_seen_at ?? null,
        peer_reachable: h.peer_reachable ?? null,
        peer_locked: h.peer_locked ?? null,
        peer_app_version: h.peer_app_version ?? null,
        peer_protocol: h.peer_protocol ?? null,
        protocol_compatible: h.protocol_compatible ?? null,
        agreed_protocol: h.agreed_protocol ?? null,
        last_error: h.last_error ?? null,
        updated_at: nowIso(),
      }),
    updatePeerUrl: (id, url) => stmts.updatePeerUrl.run(url, nowIso(), id),
    updatePeerLabel: (id, label) => stmts.updatePeerLabel.run(label, nowIso(), id),
    remove: (id) => stmts.remove.run(id),
  };
}

module.exports = { createFederationStore };
