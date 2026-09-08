package com.glasskeep.app.nativeapp.data

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// Not java.time.Instant: minSdk is 24, and java.time needs API 26+ without
// core library desugaring, which this project doesn't have configured.
private fun isoFormat(): SimpleDateFormat =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }

/**
 * `client_updated_at` for the LWW protocol (see server/index.js /
 * src/sync/syncEngine.js) needs an ISO-8601 UTC timestamp, same as JS's
 * `new Date().toISOString()`.
 */
fun nowIso(): String = formatIso(Date())

/** Same ISO-8601 UTC shape as [nowIso], for a [Date] other than now, e.g.
 *  a reminder instant just picked in a date/time dialog. */
fun formatIso(date: Date): String = isoFormat().format(date)

/** Parses a server ISO-8601 UTC instant (same shape [nowIso] produces, e.g.
 *  a note's `reminderAt`) back to epoch milliseconds. Null on anything
 *  malformed, same never-guess convention as this app's other parsers. */
fun parseIsoToEpochMillis(iso: String): Long? =
    try {
        isoFormat().parse(iso)?.time
    } catch (t: Throwable) {
        null
    }

/** True when a reminder instant has already passed. Mirrors
 *  src/utils/reminder.js's isReminderPast: past reminders are kept and
 *  shown muted, never treated as an error. */
fun isReminderPast(iso: String): Boolean {
    val ms = parseIsoToEpochMillis(iso) ?: return false
    return ms < System.currentTimeMillis()
}
