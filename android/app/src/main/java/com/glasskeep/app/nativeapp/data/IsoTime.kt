package com.glasskeep.app.nativeapp.data

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * `client_updated_at` for the LWW protocol (see server/index.js /
 * src/sync/syncEngine.js) needs an ISO-8601 UTC timestamp, same as JS's
 * `new Date().toISOString()`. Not `java.time.Instant`: minSdk is 24, and
 * java.time needs API 26+ without core library desugaring, which this
 * project doesn't have configured.
 */
fun nowIso(): String {
    val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    format.timeZone = TimeZone.getTimeZone("UTC")
    return format.format(Date())
}
