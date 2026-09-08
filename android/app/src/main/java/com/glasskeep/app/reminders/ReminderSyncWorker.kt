package com.glasskeep.app.reminders

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.glasskeep.app.MainActivity
import com.glasskeep.app.net.CleartextPolicy
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Background reminder sync — the "no Google, nothing external" path.
 *
 * While the app is closed, this periodically asks the GlassKeep server for the
 * user's upcoming reminders and (re)arms the on-device AlarmManager alarms via
 * ReminderScheduler. That's what lets a reminder created on ANOTHER device
 * (e.g. the desktop) still fire on the phone with the app shut — without any
 * push service. The alarms themselves are exact + Doze-proof, so firing is on
 * time; the only cost is up to one sync interval (~15 min — WorkManager's
 * floor) before a brand-new remote reminder is known to this device.
 *
 * Runs on WorkManager (AndroidX → JobScheduler, part of AOSP — NOT Google Play
 * Services), so it survives reboots and cooperates with Doze on its own, with
 * zero Google dependency.
 *
 * Session comes from the WebView-era shared prefs (server_url/auth_token,
 * see setAuthToken) when present, else read-only from the native rewrite's
 * own encrypted store (see nativeFallback): that's what lets this same
 * worker also cover a native-only sign-in, which never populates those
 * legacy prefs at all.
 */
class ReminderSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val session = resolveSession(prefs)
        android.util.Log.i("GKReminders", "sync: start (session resolved=${session != null})")
        if (session == null) {
            android.util.Log.w("GKReminders", "sync: skipped — not signed in (no server_url/token yet)")
            return@withContext Result.success()
        }
        val (serverUrl, token, urlVetted) = session
        // This request carries the session token. It runs on its own
        // schedule, with nobody watching, so it does not inherit the
        // check the app start performs: it makes it again. An address
        // sending the token in the clear across the internet is dropped
        // here rather than retried.
        if (!CleartextPolicy.isUsableAtStartup(serverUrl, urlVetted)) {
            android.util.Log.w("GKReminders", "sync: skipped, stored server address is not usable in cleartext")
            return@withContext Result.success()
        }

        val body = try {
            httpGet("$serverUrl/api/reminders/upcoming", token)
        } catch (e: Exception) {
            android.util.Log.w("GKReminders", "sync: network error, will retry — ${e.message}")
            return@withContext Result.retry()
        } ?: run {
            android.util.Log.w("GKReminders", "sync: auth rejected (401/403) — token stale? reopen the app")
            return@withContext Result.success()
        }

        val items = ArrayList<ReminderScheduler.ReminderItem>()
        try {
            val arr = JSONObject(body).optJSONArray("reminders")
                ?: return@withContext Result.success()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val id = o.optString("noteId")
                val at = o.optLong("t")
                if (id.isBlank() || at <= 0L) continue
                items.add(
                    ReminderScheduler.ReminderItem(id, at, o.optString("title"), o.optString("body")),
                )
            }
        } catch (e: Exception) {
            return@withContext Result.success() // malformed response — don't spin on it
        }

        // Reconcile the full set: arms new alarms, cancels ones no longer due.
        android.util.Log.i("GKReminders", "sync: server returned ${items.size} upcoming reminder(s) -> arming")
        ReminderScheduler.syncAll(applicationContext, items)
        Result.success()
    }

    /** (serverUrl, token, urlVetted), from the WebView-era shared prefs
     *  when they hold a session, else read-only from native's own
     *  encrypted store (see nativeFallback) for a native-only sign-in that
     *  never populates those legacy prefs at all. urlVetted is the legacy
     *  prefs' own vetted flag for those, or true for a native one (see
     *  nativeFallback's doc comment for why that's not a guess). Null
     *  when neither has a usable session. */
    private fun resolveSession(prefs: android.content.SharedPreferences): Triple<String, String, Boolean>? {
        val legacyUrl = prefs.getString("server_url", null)?.trimEnd('/')
        val legacyToken = prefs.getString(KEY_TOKEN, null)
        if (!legacyUrl.isNullOrBlank() && !legacyToken.isNullOrBlank()) {
            return Triple(legacyUrl, legacyToken, prefs.getBoolean(MainActivity.KEY_URL_VETTED, false))
        }
        val native = nativeFallback(applicationContext) ?: return null
        return Triple(native.first, native.second, true)
    }

    /** Reads (serverUrl, token) from the native rewrite's own encrypted
     *  session store, read only: this worker never writes to it. Any URL
     *  found there already passed CleartextPolicy's vetting once, in
     *  MainActivity, before native ever stored it (see NativeLoginScreen
     *  -> NativeAppActivity.EXTRA_SERVER_URL): a debug build only ever
     *  reaches native's login screen through that same gate MainActivity
     *  already runs for the WebView flow, so re-vetting it here would just
     *  repeat a check already made, not skip one. Null on anything
     *  missing or unreadable (e.g. Keystore briefly unavailable): this
     *  runs unattended, so a worse-case outcome is skipping this sync
     *  rather than crashing it. */
    private fun nativeFallback(context: Context): Pair<String, String>? {
        return try {
            val native = com.glasskeep.app.nativeapp.data.TokenStore(context)
            val url = native.serverUrl?.trimEnd('/')
            val token = native.token
            if (url.isNullOrBlank() || token.isNullOrBlank()) null else url to token
        } catch (t: Throwable) {
            android.util.Log.w("GKReminders", "sync: native session fallback failed", t)
            null
        }
    }

    /** GET with bearer auth. Returns the body; null on 401/403; throws on network error. */
    private fun httpGet(urlStr: String, token: String): String? {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Accept", "application/json")
            connectTimeout = 15_000
            readTimeout = 15_000
        }
        try {
            val code = conn.responseCode
            android.util.Log.i("GKReminders", "sync: GET upcoming -> HTTP $code")
            if (code == 401 || code == 403) return null
            if (code !in 200..299) throw RuntimeException("HTTP $code")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        // SharedPreferences shared with the WebView shell: holds server_url
        // (written at setup) and the auth token (written by the JS bridge).
        private const val PREFS = "glasskeep"
        const val KEY_TOKEN = "auth_token"
        private const val UNIQUE_WORK = "glasskeep_reminder_sync"
        private const val SYNC_MINUTES = 15L // WorkManager's minimum periodic interval

        /** Persist the auth token, then (re)arm the periodic sync + a one-off now. */
        fun setAuthToken(ctx: Context, token: String) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY_TOKEN, token).apply()
            android.util.Log.i(
                "GKReminders",
                "setAuthToken: token ${if (token.isBlank()) "cleared" else "stored"}; scheduling periodic + immediate sync",
            )
            if (token.isNotBlank()) {
                schedulePeriodic(ctx)
                syncNow(ctx)
            }
        }

        /** Idempotent: keep the existing schedule if one is already enqueued. */
        fun schedulePeriodic(ctx: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val req = PeriodicWorkRequestBuilder<ReminderSyncWorker>(SYNC_MINUTES, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                UNIQUE_WORK, ExistingPeriodicWorkPolicy.KEEP, req,
            )
        }

        /** One-off immediate sync (e.g. right after login / token refresh). */
        fun syncNow(ctx: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val req = OneTimeWorkRequestBuilder<ReminderSyncWorker>()
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(ctx).enqueue(req)
        }
    }
}
