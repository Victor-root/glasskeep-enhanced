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
 */
class ReminderSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val serverUrl = prefs.getString("server_url", null)?.trimEnd('/')
        val token = prefs.getString(KEY_TOKEN, null)
        if (serverUrl.isNullOrBlank() || token.isNullOrBlank()) {
            return@withContext Result.success() // not signed in / not set up yet
        }

        val body = try {
            httpGet("$serverUrl/api/reminders/upcoming", token)
        } catch (e: Exception) {
            return@withContext Result.retry() // transient (offline) — back off and retry
        } ?: return@withContext Result.success() // 401/403 → wait for the app to refresh the token

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
        ReminderScheduler.syncAll(applicationContext, items)
        Result.success()
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
