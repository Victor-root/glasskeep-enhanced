// server/routes/usersRoutes.js
//
// Accounts: the admin's user list, pending registrations, creating,
// editing and deleting users, and the user search behind sharing.

const bcrypt = require("bcryptjs");
const { MIN_PASSWORD_LENGTH } = require("../services/signIn");
const { promoteToAdminIfNeeded } = require("../services/adminEmails");
const { nowISO } = require("../utils/timestamps");

function attachUsersRoutes(app, deps) {
  const {
    db,
    auth,
    adminOnly,
    insertUser,
    getUserById,
    getUserByEmail,
    insertNotification,
    sendEventToUser,
    broadcastToAdmins,
    closeSseClientsFor,
    pushProfileToPeers,
    noteFederation,
  } = deps;

  // Include a rough storage usage estimate (bytes) for each user
  // This sums the LENGTH() of relevant TEXT columns across a user's notes.
  // It’s an approximation (UTF-8 chars ≈ bytes, and data-URL images are strings).
  const listAllUsers = db.prepare(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.created_at,
      u.is_admin,
      u.avatar_url,
      COUNT(n.id) AS notes,
      COALESCE(SUM(
        COALESCE(LENGTH(n.title),0) +
        COALESCE(LENGTH(n.content),0) +
        COALESCE(LENGTH(n.items_json),0) +
        COALESCE(LENGTH(n.tags_json),0) +
        COALESCE(LENGTH(n.images_json),0) +
        COALESCE(LENGTH(n.enc_payload),0)
      ), 0) AS storage_bytes
    FROM users u
    LEFT JOIN notes n ON n.user_id = u.id
    -- Federated collaborators are mirrored locally as shadow rows
    -- (federated_origin set, email "<origin>@federated.invalid"). They
    -- belong to the remote server, which manages its own accounts, so
    -- they must never surface in this server's admin user list.
    WHERE u.federated_origin IS NULL
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);

  app.get("/api/admin/users", auth, adminOnly, (_req, res) => {
    const rows = listAllUsers.all();
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        is_admin: !!r.is_admin,
        notes: Number(r.notes || 0),
        storage_bytes: Number(r.storage_bytes || 0),
        created_at: r.created_at,
        avatar_url: r.avatar_url || null,
      }))
    );
  });

  // ---------- Pending Registrations (admin) ----------
  const listPendingUsers = db.prepare(
    "SELECT id, name, email, created_at FROM pending_users ORDER BY created_at ASC"
  );
  const getPendingById = db.prepare("SELECT * FROM pending_users WHERE id = ?");
  const deletePendingById = db.prepare("DELETE FROM pending_users WHERE id = ?");

  app.get("/api/admin/pending-users", auth, adminOnly, (_req, res) => {
    res.json(listPendingUsers.all());
  });

  // Wipe the pending_user_registered notification rows attached to this
  // pending id and tell every recipient admin (live SSE) so their
  // history panel drops the entry. Run on both approve AND reject so
  // whichever admin acts first clears the action surfaces everywhere.
  function cleanupPendingUserNotifications(pendingId) {
    try {
      // pendingId is stored in the `message` column (note_id is NULL
      // because of the FK to notes); stringify so the BLOB-affinity
      // match works the same way both at insert and at query.
      const key = String(pendingId);
      const rows = db.prepare(`
        SELECT id, recipient_user_id FROM notifications
        WHERE type = 'pending_user_registered' AND message = ?
      `).all(key);
      if (rows.length === 0) return;
      db.prepare(`
        DELETE FROM notifications
        WHERE type = 'pending_user_registered' AND message = ?
      `).run(key);
      const byRecipient = new Map();
      for (const r of rows) {
        if (!byRecipient.has(r.recipient_user_id))
          byRecipient.set(r.recipient_user_id, []);
        byRecipient.get(r.recipient_user_id).push(r.id);
      }
      for (const [uid, ids] of byRecipient) {
        sendEventToUser(uid, { type: "notification_removed", ids });
      }
    } catch (e) {
      console.warn("[notifications] pending_user cleanup failed:", e?.message);
    }
  }

  app.post("/api/admin/pending-users/:id/approve", auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    const pending = getPendingById.get(id);
    if (!pending) return res.status(404).json({ error: "Pending registration not found." });

    // Guard against collision with a concurrently-created user
    if (getUserByEmail.get(pending.email)) {
      deletePendingById.run(id);
      cleanupPendingUserNotifications(id);
      return res.status(409).json({ error: "A user with this email already exists." });
    }

    // Move to users table, preserving the user-chosen password_hash (no forced change)
    const info = insertUser.run(pending.name, pending.email, pending.password_hash, nowISO());
    deletePendingById.run(id);
    cleanupPendingUserNotifications(id);

    // Check if this user should be auto-promoted to admin via env var
    try { promoteToAdminIfNeeded(db, pending.email); } catch { /* approval proceeds without the auto-promotion */ }

    const user = getUserById.get(info.lastInsertRowid);
    // Live-sync to every other admin session so their AdminPanel
    // pending / users lists refresh without waiting for a manual
    // reload. The acting admin's tab gets it too: its useEffect
    // dedup keeps it cheap, and there's no source-tab skip logic
    // needed because reload is idempotent.
    broadcastToAdmins({
      type: "pending_user_resolved",
      action: "approved",
      pendingId: id,
      newUserId: user.id,
    });
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: !!user.is_admin,
      created_at: user.created_at,
    });
  });

  app.post("/api/admin/pending-users/:id/reject", auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    const pending = getPendingById.get(id);
    if (!pending) return res.status(404).json({ error: "Pending registration not found." });
    deletePendingById.run(id);
    cleanupPendingUserNotifications(id);
    broadcastToAdmins({
      type: "pending_user_resolved",
      action: "rejected",
      pendingId: id,
    });
    res.json({ ok: true });
  });

  // Search users endpoint for collaboration
  const searchUsersStmt = db.prepare(`
    SELECT id, name, email, avatar_url
    FROM users
    WHERE (name LIKE ? OR email LIKE ?)
      AND federated_origin IS NULL
    ORDER BY name ASC
    LIMIT 500
  `);
  app.get("/api/users/search", auth, (req, res) => {
    const query = req.query.q || "";
    const searchTerm = `%${query}%`;
    const rows = searchUsersStmt.all(searchTerm, searchTerm);
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        avatar_url: r.avatar_url || null,
      }))
    );
  });

  const deleteUserStmt = db.prepare("DELETE FROM users WHERE id = ?");
  // Federated notes a user collaborates on: queried BEFORE the DELETE so we
  // still see the rows that CASCADE will wipe. Both roles matter: on a HOME
  // note we re-push the roster without them, and on a MIRROR we must tell the
  // owning peer they are gone (nothing else would ever say so).
  const fedCollabsForUser = (() => {
    try {
      return db.prepare(`
        SELECT DISTINCT fn.note_id, fn.role
        FROM note_collaborators nc
        JOIN federated_notes fn ON nc.note_id = fn.note_id
        WHERE nc.user_id = ?
      `);
    } catch { return null; }
  })();

  app.delete("/api/admin/users/:id", auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ error: "You cannot delete yourself." });
    }
    const target = getUserById.get(id);
    if (!target) return res.status(404).json({ error: "User not found" });

    const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_admin=1").get().c;
    if (target.is_admin && adminCount <= 1) {
      return res.status(400).json({ error: "Cannot delete the last admin." });
    }

    // Capture BEFORE the DELETE cascades away the collaborator rows.
    let federatedNotes = [];
    try {
      if (fedCollabsForUser) federatedNotes = fedCollabsForUser.all(id);
    } catch { /* best-effort */ }
    const deletedRef = target.email || target.name;

    deleteUserStmt.run(id);

    for (const { note_id: noteId, role } of federatedNotes) {
      try {
        if (role === "home") {
          // Push updated rosters (without the deleted user) to peer mirrors so
          // their view of the note stops showing the now-gone collaborator.
          noteFederation?.onParticipantsChangedLocally?.(noteId);
        } else {
          // A mirror: the owner is on a peer and only they can drop the
          // stand-in that represented this account.
          noteFederation?.onLocalParticipantLeft?.(noteId, deletedRef);
        }
      } catch { /* best-effort */ }
    }

    // Notify every OTHER admin. The acting admin already sees the
    // operation succeed locally, so they get a plain success toast in
    // the panel instead: sending them the row too would feel like
    // self-reflection. Persisted + SSE'd so offline admins also see it
    // when they next reconnect.
    try {
      const otherAdmins = db
        .prepare("SELECT id FROM users WHERE is_admin = 1 AND id != ?")
        .all(req.user.id);
      if (otherAdmins.length > 0) {
        const createdAt = nowISO();
        const targetName = target.name || target.email || "";
        const adminName = req.user.name || req.user.email || "";
        for (const a of otherAdmins) {
          const row = insertNotification.run(
            a.id,
            req.user.id,
            "user_deleted",
            null,
            targetName,
            adminName,
            "warning",
            null,
            0,
            "user-x",
            createdAt,
          );
          sendEventToUser(a.id, {
            type: "user_deleted_notification",
            notificationId: row.lastInsertRowid,
            deletedName: targetName,
            adminName,
            createdAt,
          });
        }
      }
    } catch (e) {
      console.warn("[notifications] user_deleted notification failed:", e?.message);
    }

    res.json({
      ok: true,
      deletedUser: { id: target.id, name: target.name, email: target.email },
    });
  });

  // Create user from admin panel
  app.post("/api/admin/users", auth, adminOnly, (req, res) => {
    const { name, email, password, is_admin } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }

    if (getUserByEmail.get(email)) {
      return res.status(409).json({ error: "Email already registered." });
    }

    const hash = bcrypt.hashSync(password, 10);
    const info = insertUser.run(name.trim(), email.trim(), hash, nowISO());

    // Set admin status if specified + always mark password as temporary
    const updateParts = ["must_change_password = 1"];
    if (is_admin) updateParts.push("is_admin = 1");
    db.prepare(`UPDATE users SET ${updateParts.join(", ")} WHERE id = ?`).run(info.lastInsertRowid);

    const user = getUserById.get(info.lastInsertRowid);
    // Live-sync to every other admin so their users list shows the
    // new row without a manual reload.
    broadcastToAdmins({
      type: "user_list_changed",
      reason: "created",
      userId: user.id,
    });
    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: !!user.is_admin,
      created_at: user.created_at,
    });
  });

  // Update user from admin panel
  app.patch("/api/admin/users/:id", auth, adminOnly, (req, res) => {
    const id = Number(req.params.id);
    const { name, email, password, is_admin } = req.body || {};

    // Cannot update yourself to non-admin if you're the only admin.
    //
    // Le test doit porter sur la même règle que l'écriture plus bas, qui
    // fait `is_admin ? 1 : 0`. Comparé strictement à false, le garde-fou
    // laissait passer un 0 ou une chaîne vide: le dernier administrateur
    // se retrogradait pour de bon et l'instance se retrouvait sans personne
    // pour en refaire un.
    if (id === req.user.id && is_admin !== undefined && !is_admin) {
      const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_admin=1").get().c;
      if (adminCount <= 1) {
        return res.status(400).json({ error: "Cannot remove admin status from the last admin." });
      }
    }

    // Check if user exists
    const existing = getUserById.get(id);
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if email is already taken by another user
    if (email && email !== existing.email) {
      const emailCheck = getUserByEmail.get(email);
      if (emailCheck && emailCheck.id !== id) {
        return res.status(409).json({ error: "Email already in use by another user." });
      }
    }

    // Prepare update query
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name.trim());
    }

    if (email !== undefined) {
      updates.push("email = ?");
      params.push(email.trim());
    }

    if (password) {
      if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      }
      updates.push("password_hash = ?");
      params.push(bcrypt.hashSync(password, 10));
      // When admin resets a password, force the user to change it on next login
      updates.push("must_change_password = ?");
      params.push(1);
      // An administrator resetting a password is the same event as the user
      // doing it: the old password no longer opens anything, so neither
      // should the sessions opened with it. The account signs in again
      // everywhere, which is the point when the reason for the reset is
      // that someone else got in.
      updates.push("token_version = token_version + 1");
    }

    if (is_admin !== undefined) {
      updates.push("is_admin = ?");
      params.push(is_admin ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    // Execute update
    const updateStmt = db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`);
    params.push(id);
    const result = updateStmt.run(...params);

    if (result.changes === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // The password reset above bumped the account's token version; the open
    // event streams were accepted with the tokens it just revoked.
    if (password) closeSseClientsFor(id);

    // Return updated user data
    const updatedUser = getUserById.get(id);
    // A rename has to reach the paired servers too, or their stand-in for this
    // user keeps the old name on every note already shared with them. An
    // ADDRESS change matters far more: peers key their stand-in by it, so
    // without the old value they cannot tell "same person, new address" from
    // "a stranger" and everything they later send about that user misses.
    // Only on an actual change: the other edits here (password, role) mean
    // nothing to a peer and would just be needless traffic.
    const refChanged = (updatedUser.email || updatedUser.name) !== (existing.email || existing.name);
    if (refChanged || updatedUser.name !== existing.name) {
      pushProfileToPeers(
        id,
        updatedUser.avatar_url ?? null,
        refChanged ? existing.email || existing.name : null,
      );
    }
    // Live-sync to every other admin so name / email / role / temp-
    // password-flag changes show up without a manual reload.
    broadcastToAdmins({
      type: "user_list_changed",
      reason: "updated",
      userId: updatedUser.id,
    });
    res.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      is_admin: !!updatedUser.is_admin,
      created_at: updatedUser.created_at,
    });
  });
}

module.exports = { attachUsersRoutes };
