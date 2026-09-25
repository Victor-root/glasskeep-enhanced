package com.glasskeep.app.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
    httpCode != null && httpCode >= 500 -> SyncErrorKind.SERVER_ERROR
    error is SerializationException -> SyncErrorKind.BACKEND_DOWN
    else -> SyncErrorKind.UNREACHABLE
}

/**
 * What the header's cloud icon and its panel read: whether the server
 * answered last time we asked, when a queued change was last pushed, and
 * whether a queue drain is running right now. The queue's own counts are
 * not held here, they are observed straight from the sync-queue table.
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

    /** A queue drain (or a manual "sync now") is in flight. */
    var syncing: Boolean by mutableStateOf(false)
        private set

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

    fun markSyncing(value: Boolean) {
        syncing = value
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
