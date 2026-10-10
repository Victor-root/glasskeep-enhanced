// server/routes/reminderRoutes.js
//
// Note reminders: setting or clearing one, the admin-only test trigger,
// and the upcoming reminders the Android app arms locally. Delivery
// itself lives in services/reminderDispatch.js.

const { t: serverT } = require("../i18n");
const { nowISO, validateLwwTimestamp, isNewerOrEqual } = require("../utils/timestamps");
const { notePreviewText } = require("../utils/notePreview");

function attachReminderRoutes(app, deps) {
  const {
    db,
    auth,
    adminOnly,
    getNoteById,
    getNoteWithCollaboration,
    updateNoteWithEditor,
    serializeNote,
    broadcastNoteUpdated,
    getUserLanguage,
    getReminderScheduler,
  } = deps;

  // Set, update, or clear a note's reminder. Body:
  //   { reminderAt: ISO-8601 string | null, client_updated_at: ISO }
  // Passing a date sets/updates the reminder and re-arms it (clears
  // reminder_fired_at) so a previously-fired reminder moved to a future
  // time fires again. Passing null clears the reminder entirely.
  //
  // Reminder columns are plain (never encrypted), so this dedicated route
  // stays out of the sensitive-field write path (buildWriteRow / cipher).
  // Owner OR collaborator may set it: a reminder is a property of the
  // shared note, and when it fires every participant is notified.
  const updateReminderStmt = db.prepare(`
    UPDATE notes SET
      reminder_at = @reminder_at,
      reminder_fired_at = NULL,
      client_updated_at = @client_updated_at
    WHERE id = @id AND (user_id = @user_id OR EXISTS(
      SELECT 1 FROM note_collaborators nc
      WHERE nc.note_id = @id AND nc.user_id = @user_id
    ))
  `);
  app.post("/api/notes/:id/reminder", auth, (req, res) => {
    const id = req.params.id;
    const { reminderAt } = req.body || {};
    if (!req.body?.client_updated_at) {
      return res.status(400).json({ error: "client_updated_at is required" });
    }
    const tsResult = validateLwwTimestamp(req.body.client_updated_at);
    if (tsResult.error) {
      return res.status(400).json({ error: tsResult.error });
    }

    // Normalise the reminder instant to ISO-8601 UTC. null/"" clears it.
    let reminderIso = null;
    if (reminderAt != null && reminderAt !== "") {
      const d = new Date(reminderAt);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: "Invalid reminderAt" });
      }
      reminderIso = d.toISOString();
    }

    const existing = getNoteWithCollaboration.get(req.user.id, id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }

    // LWW: reject stale writes (compare milliseconds)
    if (!isNewerOrEqual(tsResult.ms, existing.client_updated_at)) {
      return res.json({ ok: true, stale: true, note: serializeNote(existing, req.user.id) });
    }

    const result = updateReminderStmt.run({
      reminder_at: reminderIso,
      client_updated_at: tsResult.iso,
      id,
      user_id: req.user.id,
    });
    if (result.changes === 0) {
      return res.status(404).json({ error: "Note not found or access denied" });
    }

    updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
    broadcastNoteUpdated(id);
    const fresh = getNoteById.get(id);
    res.json({ ok: true, note: serializeNote(fresh || existing, req.user.id) });
  });

  // Dev/test: SET a note's reminder programmatically, exactly what the UI
  // "set reminder" action does (writes reminder_at, clears reminder_fired_at,
  // bumps client_updated_at and broadcasts the note update so every device,
  // including the Android app, which then re-arms its local alarm, picks it
  // up). It's "as if you'd set it by hand", minus the typing and the wait.
  //
  //   - inSeconds <= 0 (default): the reminder is due NOW, and we run the real
  //     scheduler sweep immediately so it fires through the normal pipeline in
  //     ~1s instead of waiting up to REMINDER_SWEEP_MS. The atomic claim means
  //     the next scheduled sweep won't double-fire it.
  //   - inSeconds > 0: scheduled that far out and left to fire naturally on the
  //     next sweep: handy for "set it, background the app, get the native
  //     notification" tests.
  //
  // Admin-only, like /notifications/test; driven by scripts/test-reminder.cjs.
  const setReminderForTest = db.prepare(
    `UPDATE notes SET reminder_at = @at, reminder_fired_at = NULL,
       client_updated_at = @cua WHERE id = @id`,
  );
  app.post("/api/notes/:id/test-reminder", auth, adminOnly, async (req, res) => {
    const id = String(req.params.id);
    const note = getNoteById.get(id);
    if (!note) return res.status(404).json({ error: "Note not found" });

    const inSeconds = Number(req.body?.inSeconds) || 0;
    const when = new Date(Date.now() + inSeconds * 1000);
    try {
      setReminderForTest.run({ at: when.toISOString(), cua: nowISO(), id });
      // Mirror the real reminder route: stamp the editor + fan out the note
      // update so open sessions (and the APK's alarm scheduler) re-sync.
      updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
      broadcastNoteUpdated(id);
      const reminderScheduler = getReminderScheduler();
    if (inSeconds <= 0 && reminderScheduler?.sweepNow) {
        await reminderScheduler.sweepNow();
      }
    } catch (e) {
      console.warn("[reminders] test set/fire failed:", e?.message);
      return res.status(500).json({ error: "test reminder failed" });
    }
    res.json({ ok: true, noteId: id, reminderAt: when.toISOString(), inSeconds, fired: inSeconds <= 0 });
  });

  // Upcoming (future, not-yet-fired) reminders for the signed-in user, owned
  // or collaborated. The Android app's background sync (WorkManager) polls this
  // while the app is closed to (re)arm its on-device local alarms, so a reminder
  // created on another device still fires on the phone with the app shut, and
  // without any push service (no Google/FCM dependency). Returns exactly the
  // shape the native ReminderScheduler wants: { noteId, t (epoch ms), title, body }.
  const selectUpcomingReminders = db.prepare(`
    SELECT id, reminder_at FROM notes
     WHERE reminder_at IS NOT NULL
       AND reminder_fired_at IS NULL
       AND reminder_at > @now
       AND (user_id = @uid OR EXISTS(
         SELECT 1 FROM note_collaborators nc
          WHERE nc.note_id = notes.id AND nc.user_id = @uid))
     ORDER BY reminder_at ASC
     LIMIT 200
  `);
  app.get("/api/reminders/upcoming", auth, (req, res) => {
    const now = new Date().toISOString();
    const lang = getUserLanguage(req.user.id);
    const title = serverT(lang, "reminderNotificationTitle");
    let rows;
    try {
      rows = selectUpcomingReminders.all({ now, uid: req.user.id });
    } catch (e) {
      console.warn("[reminders] upcoming query failed:", e?.message);
      return res.status(500).json({ error: "query failed" });
    }
    const reminders = [];
    for (const r of rows) {
      const ts = Date.parse(r.reminder_at);
      if (Number.isNaN(ts)) continue;
      const note = getNoteById.get(r.id);
      const body = (note && notePreviewText(note)) || serverT(lang, "reminderNotificationUntitled");
      reminders.push({ noteId: String(r.id), t: ts, title, body });
    }
    res.json({ reminders });
  });
}

module.exports = { attachReminderRoutes };
