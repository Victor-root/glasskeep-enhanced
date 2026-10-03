package com.glasskeep.app.nativeapp.data

import android.content.Context
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import androidx.work.WorkerParameters
import com.glasskeep.app.BuildConfig
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.local.AppDatabase
import com.glasskeep.app.nativeapp.data.local.SyncQueueDatabase
import com.glasskeep.app.nativeapp.data.local.SyncQueueEntity
import com.glasskeep.app.nativeapp.data.local.SyncQueueType
import com.glasskeep.app.nativeapp.data.network.ApiClientFactory
import com.glasskeep.app.nativeapp.data.network.ArchiveNoteRequest
import com.glasskeep.app.nativeapp.data.network.ClientUpdatedAtRequest
import com.glasskeep.app.nativeapp.data.network.ConvertNoteTypeRequest
import com.glasskeep.app.nativeapp.data.network.CreateNoteRequest
import com.glasskeep.app.nativeapp.data.network.NoteDto
import com.glasskeep.app.nativeapp.data.network.NotesHttpCache
import com.glasskeep.app.nativeapp.data.network.PatchNoteRequest
import com.glasskeep.app.nativeapp.data.network.ReorderNotesRequest
import com.glasskeep.app.nativeapp.data.network.SetChecklistItemsRequest
import com.glasskeep.app.nativeapp.data.network.SetColorRequest
import com.glasskeep.app.nativeapp.data.network.SetImagesRequest
import com.glasskeep.app.nativeapp.data.network.SetNoteIconRequest
import com.glasskeep.app.nativeapp.data.network.SetPinnedRequest
import com.glasskeep.app.nativeapp.data.network.SetReminderRequest
import com.glasskeep.app.nativeapp.data.network.SetTagsRequest
import com.glasskeep.app.nativeapp.data.network.TrashNoteRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit

/**
 * Drains NotesRepository's sync_queue table (see SyncQueueEntity/Dao):
 * one item at a time, oldest first, same 200ms pacing between items as
 * syncEngine.js's own QUEUE_ITEM_DELAY (so a burst of queued edits doesn't
 * hammer the server). A per-item failure is recorded on that item alone
 * (attempts + lastError) rather than aborting the whole run, mirroring
 * syncEngine.js's own per-item retry bookkeeping; the worker itself asks
 * WorkManager to retry the whole run (Result.retry(), exponential backoff,
 * see triggerNow's setBackoffCriteria) only when at least one item is
 * still outstanding afterwards.
 *
 * Stale/read-only outcomes (the server rejected the write because someone
 * else changed the note first) are treated as done, not failed: the web
 * app handles the same {stale:true} response by silently accepting the
 * server's copy, never by retrying a write that will never stop being
 * stale (see App.jsx's onSyncComplete). Retrying is reserved for the
 * genuinely transient case (a thrown exception: network error, 5xx, ...).
 * A note the server no longer knows (404) or no longer opens to this user
 * (403) is abandoned with everything queued for it, and a session the
 * server refuses (401) stops the drain with the queue untouched: it waits
 * for the app to sign in again, rather than being failed for good while
 * nobody is there to see it (syncEngine.js:213-263).
 */
class SyncQueueWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (BuildConfig.DEBUG) Log.d("GKSync", "doWork() started, runAttemptCount=$runAttemptCount")
        val anyOutstanding = drainQueue(applicationContext, countFailures = true)
        if (BuildConfig.DEBUG) Log.d("GKSync", "doWork() finished: anyOutstanding=$anyOutstanding -> ${if (anyOutstanding) "Result.retry()" else "Result.success()"}")
        return if (anyOutstanding) Result.retry() else Result.success()
    }

    companion object {
        private const val UNIQUE_ONE_TIME_WORK = "glasskeep_sync_queue_drain"
        private const val UNIQUE_PERIODIC_WORK = "glasskeep_sync_queue_periodic"
        private const val MAX_ATTEMPTS = 5
        private const val QUEUE_ITEM_DELAY_MS = 200L

        /** Replays [item]; the server's copy when it refused the write as older
         *  than itself, else null. */
        private suspend fun applyItem(repository: NotesRepository, item: SyncQueueEntity): NoteDto? {
            return when (SyncQueueType.valueOf(item.type)) {
                SyncQueueType.CREATE -> {
                    val body = Json.decodeFromString<CreateNoteRequest>(item.payloadJson)
                    repository.createNoteOnline(body)
                    null
                }
                SyncQueueType.TITLE_CONTENT -> {
                    val body = Json.decodeFromString<PatchNoteRequest>(item.payloadJson)
                    repository.patchNote(item.noteId, body.title, body.content, body.clientUpdatedAt).staleCopy()
                }
                SyncQueueType.COLOR -> {
                    val body = Json.decodeFromString<SetColorRequest>(item.payloadJson)
                    repository.setColor(item.noteId, body.color, body.clientUpdatedAt).staleCopy()
                }
                SyncQueueType.TAGS -> {
                    val body = Json.decodeFromString<SetTagsRequest>(item.payloadJson)
                    repository.setTags(item.noteId, body.tags, body.clientUpdatedAt).staleCopy()
                }
                SyncQueueType.CHECKLIST_ITEMS -> {
                    val body = Json.decodeFromString<SetChecklistItemsRequest>(item.payloadJson)
                    repository.setChecklistItems(item.noteId, body.items, body.clientUpdatedAt).staleCopy()
                }
                SyncQueueType.CONVERT_TYPE -> {
                    val body = Json.decodeFromString<ConvertNoteTypeRequest>(item.payloadJson)
                    repository.convertNoteType(item.noteId, body.type, body.content, body.items, body.clientUpdatedAt).staleCopy()
                }
                SyncQueueType.IMAGES -> {
                    val body = Json.decodeFromString<SetImagesRequest>(item.payloadJson)
                    repository.setImages(item.noteId, body.images, body.clientUpdatedAt).staleCopy()
                }
                SyncQueueType.PINNED -> {
                    val body = Json.decodeFromString<SetPinnedRequest>(item.payloadJson)
                    repository.setPinned(item.noteId, body.pinned)
                    null
                }
                SyncQueueType.ARCHIVE -> {
                    val body = Json.decodeFromString<ArchiveNoteRequest>(item.payloadJson)
                    repository.setArchived(item.noteId, body.archived, body.clientUpdatedAt).staleCopy()
                }
                SyncQueueType.TRASH -> {
                    val body = Json.decodeFromString<TrashNoteRequest>(item.payloadJson)
                    repository.trashNote(item.noteId, body.clientUpdatedAt, body.mode).staleCopy()
                }
                SyncQueueType.RESTORE -> {
                    val body = Json.decodeFromString<ClientUpdatedAtRequest>(item.payloadJson)
                    repository.restoreNote(item.noteId, body.clientUpdatedAt).staleCopy()
                }
                SyncQueueType.PERMANENT_DELETE -> {
                    val body = Json.decodeFromString<ClientUpdatedAtRequest>(item.payloadJson)
                    repository.deleteNotePermanently(item.noteId, body.clientUpdatedAt).staleCopy()
                }
                SyncQueueType.REMINDER -> {
                    val body = Json.decodeFromString<SetReminderRequest>(item.payloadJson)
                    repository.setReminder(item.noteId, body.reminderAt, body.clientUpdatedAt).staleCopy()
                }
                SyncQueueType.ICON -> {
                    val body = Json.decodeFromString<SetNoteIconRequest>(item.payloadJson)
                    repository.setNoteIcon(item.noteId, body.icon)
                    null
                }
                SyncQueueType.REORDER -> {
                    // item.noteId is just the sentinel this type always
                    // enqueues under (see NotesRepository.reorderQueued):
                    // the payload alone is self-sufficient, unlike every
                    // other branch above.
                    val body = Json.decodeFromString<ReorderNotesRequest>(item.payloadJson)
                    repository.reorderNotes(body.pinnedIds, body.otherIds, body.clientReorderedAt)
                    null
                }
            }
        }

        private fun SaveNoteResult.staleCopy(): NoteDto? = (this as? SaveNoteResult.Stale)?.note

        private fun DeleteResult.staleCopy(): NoteDto? = (this as? DeleteResult.Stale)?.note

        /** The reason kept on a failed item, worded as syncEngine.js words
         *  its lastError values (its lines 267-309). */
        private fun failureText(context: Context, error: Throwable): String = when {
            error is ServerRefusal && error.status == 429 -> context.getString(R.string.native_sync_rate_limited, error.status)
            error is SocketTimeoutException -> context.getString(R.string.native_sync_request_timeout)
            error is IOException -> context.getString(R.string.native_sync_server_unreachable)
            error is ServerRefusal ->
                "${error.error?.takeIf { it.isNotBlank() } ?: context.getString(R.string.native_sync_unknown_error)} (HTTP ${error.status})"
            else -> error.message ?: context.getString(R.string.native_sync_unknown_error)
        }

        private val drainLock = Mutex()
        private val drainingState = MutableStateFlow(false)

        /** Whether a drain is sending items right now: the header's cloud
         *  reads "syncing" for as long, like the web's _processing. */
        val draining: StateFlow<Boolean> = drainingState.asStateFlow()

        private val drainScope = CoroutineScope(SupervisorJob() + Dispatchers.IO + backgroundErrorHandler)

        /** Runs [block] with no drain sending anything, or returns null at
         *  once when one is already running: a caller must never wait out a
         *  drain, which can last as long as the network's timeouts. */
        internal suspend fun <T> runWhileIdle(block: suspend () -> T): T? {
            if (!drainLock.tryLock()) return null
            try {
                return block()
            } finally {
                drainLock.unlock()
            }
        }

        /**
         * Replays the queue, oldest first, one drain at a time: the worker's
         * and the app's own ([triggerNow]) share the lock, so an item is
         * never sent twice. Returns whether anything is still outstanding.
         * Only the worker ([countFailures]) counts a failed try against an
         * item's [MAX_ATTEMPTS]: the app drains on every edit, which would
         * burn them all in a moment on a bad connection.
         */
        private suspend fun drainQueue(context: Context, countFailures: Boolean): Boolean = drainLock.withLock {
            val queueDao = SyncQueueDatabase.get(context).syncQueueDao()
            val pending = queueDao.getPending()
            if (BuildConfig.DEBUG) {
                Log.d(
                    "GKSync",
                    "drain pending=${pending.size} " +
                        pending.joinToString { "[id=${it.queueId} type=${it.type} note=${it.noteId} attempts=${it.attempts} status=${it.status}]" },
                )
            }
            // Nothing to send: the encrypted session store is not opened at
            // all, which the app start-up would otherwise pay for on every
            // drain.
            if (pending.isEmpty()) return@withLock false

            val tokenStore = TokenStore(context)
            val serverUrl = tokenStore.serverUrl
            val token = tokenStore.token
            if (serverUrl.isNullOrBlank() || token.isNullOrBlank()) {
                NativeDebug.d("SyncQueueWorker: no session, skipping")
                if (BuildConfig.DEBUG) Log.d("GKSync", "drain bailing: no session (serverUrl blank=${serverUrl.isNullOrBlank()}, token blank=${token.isNullOrBlank()})")
                return@withLock false
            }

            val httpCache = NotesHttpCache.get(context)
            val repository = NotesRepository(
                // No lock-state callback: this runs with no UI on screen, so a
                // 423 has nothing to redirect. The queue's own retry already
                // does the right thing (the items stay pending until the
                // instance is unlocked), and NativeNavHost reads the lock state
                // fresh whenever the app comes back to the foreground. A
                // refused session likewise waits for the app, whose first
                // request finds out.
                ApiClientFactory.create(serverUrl, tokenStore, httpCache, onInstanceLocked = {}, onSessionExpired = {}),
                AppDatabase.get(context).noteDao(),
                queueDao,
                httpCache,
            )

            var anyOutstanding = false
            val blockedNoteIds = mutableSetOf<String>()
            val abandonedNoteIds = mutableSetOf<String>()
            drainingState.value = true
            try {
                for ((index, item) in pending.withIndex()) {
                    if (item.noteId in abandonedNoteIds) continue
                    // Preserve per-note ordering. In particular, no PATCH may run
                    // after this note's CREATE failed earlier in the same drain.
                    if (item.noteId in blockedNoteIds) {
                        anyOutstanding = true
                        continue
                    }
                    try {
                        val staleCopy = applyItem(repository, item)
                        queueDao.delete(item.queueId)
                        repository.adoptServerCopy(staleCopy)
                        if (BuildConfig.DEBUG) Log.d("GKSync", "item ${item.queueId} (${item.type}) note=${item.noteId} OK, deleted from queue")
                    } catch (t: CancellationException) {
                        throw t
                    } catch (t: Throwable) {
                        NativeDebug.e("SyncQueueWorker: item ${item.queueId} (${item.type}) for note ${item.noteId} failed", t)
                        if (BuildConfig.DEBUG) {
                            Log.d("GKSync", "item ${item.queueId} (${item.type}) note=${item.noteId} FAILED: ${t.javaClass.simpleName}: ${t.message}")
                        }
                        val status = (t as? ServerRefusal)?.status
                        val isReorder = item.type == SyncQueueType.REORDER.name
                        when {
                            status == 401 -> break
                            status == 409 && item.type == SyncQueueType.CREATE.name -> queueDao.delete(item.queueId)
                            (status == 403 || status == 404) && isReorder -> queueDao.delete(item.queueId)
                            status == 403 || status == 404 -> {
                                queueDao.deleteForNote(item.noteId)
                                repository.forgetNote(item.noteId)
                                abandonedNoteIds += item.noteId
                            }
                            else -> {
                                anyOutstanding = true
                                blockedNoteIds += item.noteId
                                if (countFailures) {
                                    val attempts = item.attempts + 1
                                    val reason = failureText(context, t)
                                    if (attempts >= MAX_ATTEMPTS) {
                                        queueDao.markFailed(item.queueId, attempts, reason)
                                    } else {
                                        queueDao.recordFailure(item.queueId, attempts, reason)
                                    }
                                }
                            }
                        }
                    }
                    if (index < pending.lastIndex) delay(QUEUE_ITEM_DELAY_MS)
                }
            } finally {
                drainingState.value = false
            }
            anyOutstanding
        }

        /** Sends the queue and returns once that is done, for a caller that
         *  reads the server right after (App.jsx:3463-3470). */
        suspend fun drainNow(context: Context) {
            drainQueue(context.applicationContext, countFailures = false)
        }

        /** Call right after enqueueing an edit, so it reaches the server
         *  within seconds rather than waiting for the periodic safety net.
         *  ExistingWorkPolicy.KEEP (not REPLACE): if a drain is already
         *  pending/running, this call is a no-op rather than a second
         *  concurrent drain of the same table (the flagged risk in this
         *  milestone's own commit message, avoided here rather than
         *  reproduced from ReminderSyncWorker.syncNow()'s plain enqueue). */
        fun triggerNow(context: Context) {
            if (BuildConfig.DEBUG) {
                Log.d("GKSync", "triggerNow() called")
                // KEEP means this call is a silent no-op if WorkManager still
                // considers a previous request "enqueued" - including one
                // stuck BLOCKED forever on setRequiredNetworkType(CONNECTED)
                // never being satisfied (a VPN-only connection has tripped
                // exactly this on some OEM skins). Logging what's already
                // there, right before the KEEP-enqueue below, shows whether
                // that's what's silently swallowing every trigger.
                val existing = WorkManager.getInstance(context).getWorkInfosForUniqueWork(UNIQUE_ONE_TIME_WORK)
                existing.addListener(
                    {
                        val infos = runCatching { existing.get() }.getOrElse { emptyList() }
                        Log.d(
                            "GKSync",
                            "triggerNow(): existing WorkInfo for '$UNIQUE_ONE_TIME_WORK' = " +
                                infos.joinToString { "id=${it.id} state=${it.state} runAttemptCount=${it.runAttemptCount}" }
                                    .ifEmpty { "(none)" },
                        )
                    },
                    ContextCompat.getMainExecutor(context),
                )
            }
            val request = OneTimeWorkRequestBuilder<SyncQueueWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_ONE_TIME_WORK, ExistingWorkPolicy.KEEP, request)
            // WorkManager alone can take minutes to start on some phones
            // (battery savers): the app sends the queue itself, at once.
            val app = context.applicationContext
            drainScope.launch { drainQueue(app, countFailures = false) }
        }

        /** Safety net for items that missed every triggerNow() call (app
         *  killed mid-edit, a triggerNow() call that never happened
         *  because the app was already gone by then, ...). Idempotent:
         *  keeps the existing schedule if one is already enqueued, same
         *  as ReminderSyncWorker.schedulePeriodic(). */
        fun schedulePeriodic(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncQueueWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request,
            )
        }

        /** Prevent an old server's queued writes from racing a server switch. */
        fun cancelAll(context: Context) {
            WorkManager.getInstance(context).apply {
                cancelUniqueWork(UNIQUE_ONE_TIME_WORK)
                cancelUniqueWork(UNIQUE_PERIODIC_WORK)
            }
        }
    }
}
