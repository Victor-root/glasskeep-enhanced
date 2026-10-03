package com.glasskeep.app.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.glasskeep.app.nativeapp.data.ServerRefusal
import java.io.IOException
import java.net.SocketTimeoutException
import kotlinx.serialization.SerializationException

/** The six faces of syncEngine.js's own status object (its line 723). */
enum class SyncState { CHECKING, SYNCED, PENDING, SYNCING, OFFLINE, ERROR }

/** syncEngine.js's lastSyncError values, the ones its panel tells apart:
 *  a plain network failure gets no detail line there. */
enum class SyncErrorKind { UNREACHABLE, BACKEND_DOWN, SERVER_ERROR, TIMEOUT }

/** Buckets a failed read the way syncEngine.js's health check does: a
 *  timeout, a 5xx, an answer that is not GlassKeep's JSON (a proxy page),
 *  else the server is simply unreachable. */
fun syncErrorKindOf(error: Throwable?, httpCode: Int? = null): SyncErrorKind = when {
    error is SocketTimeoutException -> SyncErrorKind.TIMEOUT
    error is ServerRefusal && error.status >= 500 -> SyncErrorKind.SERVER_ERROR
    httpCode != null && httpCode >= 500 -> SyncErrorKind.SERVER_ERROR
    error is SerializationException -> SyncErrorKind.BACKEND_DOWN
    else -> SyncErrorKind.UNREACHABLE
}

/** What marks the server down when a read fails: a network failure, a
 *  timeout, an answer that is not GlassKeep's or a 5xx. Any other refusal
 *  (a locked instance, a refused session) means it did answer, which the
 *  web's health check also reads that way (syncEngine.js:518-541). */
fun Throwable.signalsServerDown(): Boolean =
    this is IOException || this is SerializationException || (this is ServerRefusal && status >= 500)

/**
 * What the header's cloud icon and its panel read: whether the server
 * answered last time we asked, when a queued change was last pushed, and
 * whether the queue is being sent or the view read right now. The queue's
 * own counts are not held here, they are observed straight from the
 * sync-queue table.
 *
 * Session state, never cached: a "server unreachable" remembered across
 * launches would be a lie on the very first frame.
 */
class SyncStatusState {
    /** null while we have not asked yet, which is the web's own
     *  "checking" rather than a hopeful green. */
    var serverReachable: Boolean? by mutableStateOf(null)
        private set

    var lastSyncAt: Long? by mutableStateOf(null)
        private set

    var lastSyncError: SyncErrorKind? by mutableStateOf(null)
        private set

    /** How many probes in a row have failed, the number the panel shows
     *  under "failed reconnection attempts". */
    var failedChecks: Int by mutableIntStateOf(0)
        private set

    /** The view is being read from the server. */
    private var pulling: Boolean by mutableStateOf(false)

    /** The queue is being sent. */
    private var draining: Boolean by mutableStateOf(false)

    /** syncEngine.js's `_processing || _pulling` (its line 730). */
    val syncing: Boolean get() = pulling || draining

    fun recordReachable() {
        serverReachable = true
        failedChecks = 0
        lastSyncError = null
    }

    /** syncEngine.js only stamps _lastSyncAt once processQueue has pushed a
     *  change, never on a mere health check. */
    fun recordPushed(at: Long) {
        lastSyncAt = at
    }

    fun recordUnreachable(error: SyncErrorKind) {
        serverReachable = false
        failedChecks += 1
        lastSyncError = error
    }

    fun markPulling(value: Boolean) {
        pulling = value
    }

    fun markDraining(value: Boolean) {
        draining = value
    }

    /**
     * syncEngine.js's own priority order, kept exactly: a server known to
     * be down wins over everything (a stale retry running underneath must
     * not read as progress), an unknown one is "checking" and never green,
     * and only a confirmed-reachable server can show the other four.
     * "Error" needs EVERY remaining item to have given up: an item still
     * being retried is normal, not a failure.
     */
    fun state(pending: Int, retrying: Int, failed: Int): SyncState = when {
        serverReachable == false -> SyncState.OFFLINE
        serverReachable == null -> SyncState.CHECKING
        syncing -> SyncState.SYNCING
        failed > 0 && pending == 0 && retrying == 0 -> SyncState.ERROR
        pending + retrying + failed > 0 -> SyncState.PENDING
        else -> SyncState.SYNCED
    }
}
