// server/services/reminderScheduler.js
//
// Server-side reminder scheduler for the note-reminders feature.
//
// A lightweight polling loop (default every 30s) sweeps the notes table
// for reminders that have come due and dispatches them. It is:
//
//   - Reliable across restarts: "due" is derived purely from the DB
//     (reminder_at <= now AND reminder_fired_at IS NULL), so a reminder
//     that fell due while the server was down is caught on the next
//     sweep after boot.
//   - Exactly-once: each due row is claimed with a conditional UPDATE
//     that stamps reminder_fired_at; only the writer that actually
//     flipped it from NULL (changes === 1) goes on to dispatch. No
//     reminder can fire twice, even if a sweep were to overlap.
//   - Cheap: the WHERE clause is backed by a partial index
//     (idx_notes_pending_reminders), so an instance with thousands of
//     notes but few pending reminders still does a tiny index scan.
//
// The scheduler knows nothing about HOW a reminder is delivered — it
// calls the injected async `dispatch(noteId)` for each claimed reminder.
// index.js wires that to "persist an in-app notification + push over SSE
// + send Web Push" so this module stays free of i18n, SSE and push deps.

const DEFAULT_INTERVAL_MS = 30 * 1000;

function startReminderScheduler({ db, dispatch, log = console, intervalMs = DEFAULT_INTERVAL_MS }) {
  if (typeof dispatch !== "function") {
    throw new Error("reminderScheduler: dispatch callback is required");
  }

  const selectDue = db.prepare(
    `SELECT id FROM notes
       WHERE reminder_at IS NOT NULL
         AND reminder_fired_at IS NULL
         AND reminder_at <= @now`,
  );
  // Conditional claim: only the sweep that flips fired_at from NULL wins.
  const claimReminder = db.prepare(
    `UPDATE notes SET reminder_fired_at = @firedAt
       WHERE id = @id AND reminder_fired_at IS NULL`,
  );

  let running = false; // guard against overlapping async sweeps
  let timer = null;

  async function sweep() {
    if (running) return;
    running = true;
    try {
      const now = new Date().toISOString();
      const due = selectDue.all({ now });
      for (const { id } of due) {
        let claimed = false;
        try {
          const res = claimReminder.run({ id, firedAt: now });
          claimed = res.changes === 1;
        } catch (e) {
          log.warn?.("[reminders] claim failed for", id, e?.message);
          continue;
        }
        if (!claimed) continue; // someone else already fired it
        try {
          await dispatch(id);
        } catch (e) {
          // A delivery failure must not crash the loop or block other
          // reminders. The row stays marked fired (we don't un-claim) so
          // it won't spam on the next sweep; the failure is just logged.
          log.warn?.("[reminders] dispatch failed for", id, e?.message);
        }
      }
    } catch (e) {
      log.warn?.("[reminders] sweep error:", e?.message);
    } finally {
      running = false;
    }
  }

  // Kick off shortly after boot (lets the server finish wiring up first),
  // then on a steady interval. unref() so the timer never keeps the
  // process alive on its own during shutdown.
  const startTimer = setTimeout(() => {
    sweep();
    timer = setInterval(sweep, intervalMs);
    if (timer.unref) timer.unref();
  }, 2000);
  if (startTimer.unref) startTimer.unref();

  log.log?.(`[reminders] scheduler started (every ${Math.round(intervalMs / 1000)}s)`);

  return {
    stop() {
      clearTimeout(startTimer);
      if (timer) clearInterval(timer);
      timer = null;
    },
    // Exposed for tests / manual triggering.
    sweepNow: sweep,
  };
}

module.exports = { startReminderScheduler };
