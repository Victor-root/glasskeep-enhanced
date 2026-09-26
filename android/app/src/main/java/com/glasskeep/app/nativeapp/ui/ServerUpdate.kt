package com.glasskeep.app.nativeapp.ui

import android.content.Context
import android.os.SystemClock
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.bodyOrRefusal
import com.glasskeep.app.nativeapp.data.network.AcknowledgeSelfUpdateRequest
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import com.glasskeep.app.nativeapp.data.network.SelfUpdateStatusDto
import com.glasskeep.app.nativeapp.data.network.SelfUpdateSystemDto
import com.glasskeep.app.nativeapp.data.network.StartSelfUpdateRequest
import com.glasskeep.app.nativeapp.data.network.UpdateCheckDto
import com.glasskeep.app.nativeapp.data.network.UpdateNotificationShownRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** useSelfUpdate.js's phases: nothing running, the start request sent,
 *  a step running, the server away while it restarts, then the outcomes. */
internal enum class SelfUpdatePhase {
    IDLE, STARTING, RUNNING, WAITING_FOR_SERVER, SUCCESS, ERROR, ROLLED_BACK, CANCELLED;

    val active: Boolean get() = this == STARTING || this == RUNNING || this == WAITING_FOR_SERVER
}

/**
 * useUpdateCheck.js and useSelfUpdate.js for an administrator, kept for the
 * whole session as the web keeps them at its root: whether a newer release
 * is out, whether this install takes it in one click, and that update
 * itself, followed from the start request to its outcome whatever screen
 * is showing.
 */
@Stable
internal class ServerUpdateState(
    private val context: Context,
    private val api: GlassKeepApi,
    private val scope: CoroutineScope,
) {
    var info by mutableStateOf<UpdateCheckDto?>(null)
        private set
    var mode by mutableStateOf<String?>(null)
        private set
    var oneClickAvailable by mutableStateOf(false)
        private set
    var modeReason by mutableStateOf<String?>(null)
        private set
    var status by mutableStateOf<SelfUpdateStatusDto?>(null)
        private set
    var phase by mutableStateOf(SelfUpdatePhase.IDLE)
        private set
    var startError by mutableStateOf<String?>(null)
        private set

    /** Polls timing out while the server should be up: busy, not down. */
    var slowResponse by mutableStateOf(false)
        private set

    /** The version an "Update now" is waiting on the confirmation for. */
    var confirming by mutableStateOf<String?>(null)
        private set

    /** SelfUpdateProgress.jsx's own state, which outlives each run the way
     *  that always-mounted component's does. */
    var showDetails by mutableStateOf(false)
    var cancelling by mutableStateOf(false)
        private set

    private var polling: Job? = null
    private var stopped = false

    val updateAvailable: Boolean get() = info?.let { it.updateAvailable && it.latestVersion != null } == true

    /** GET /api/update-check, silent on failure like the web's. */
    suspend fun checkForUpdate(): UpdateCheckDto? = try {
        api.checkServerUpdate().bodyOrRefusal("GET /api/update-check").also { info = it }
    } catch (t: CancellationException) {
        throw t
    } catch (t: Throwable) {
        NativeDebug.e("Update check failed", t)
        null
    }

    /** Counts one more display of the "update available" notice. */
    fun markNotificationShown(version: String) {
        scope.launch {
            try {
                api.markUpdateNotificationShown(UpdateNotificationShownRequest(version))
                    .bodyOrRefusal("POST /api/update-check/mark-shown")
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                NativeDebug.e("Update notice count failed", t)
            }
        }
    }

    /**
     * The first read: this install's type, then the last update's record.
     * One still running is followed again; one that ended without being
     * seen shows its outcome, a success only if the server now runs the
     * version it went to (a newer one means the server was updated some
     * other way since).
     */
    suspend fun recover() {
        try {
            val read = api.selfUpdateMode().bodyOrRefusal("GET /api/admin/self-update/mode")
            mode = read.mode
            oneClickAvailable = read.oneClickAvailable
            modeReason = read.reason
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            NativeDebug.e("Self-update mode read failed", t)
        }
        val current = (readStatus() as? StatusRead.Answer)?.status
        if (current == null) {
            enter(SelfUpdatePhase.IDLE)
            return
        }
        status = current
        val running = current.runningVersion?.removePrefix("v")?.removePrefix("V")
        val target = current.toVersion?.removePrefix("v")?.removePrefix("V")
        enter(
            when {
                current.inProgress -> SelfUpdatePhase.RUNNING
                current.state in TerminalStates && current.acknowledgedAt != null -> SelfUpdatePhase.IDLE
                current.state == "success" ->
                    if (running == null || target == null || running == target) SelfUpdatePhase.SUCCESS else SelfUpdatePhase.IDLE
                else -> terminalPhaseOf(current.state) ?: SelfUpdatePhase.IDLE
            },
        )
    }

    fun askToUpdate(version: String) {
        confirming = version
    }

    fun dismissConfirmation() {
        confirming = null
    }

    /** The confirmation's OK: the start request goes out while the status
     *  is already being followed, from a queued first step. */
    fun startUpdate(version: String) {
        startError = null
        status = SelfUpdateStatusDto(state = "queued", totalSteps = 5, message = "", mode = mode, toVersion = version)
        enter(SelfUpdatePhase.STARTING)
        scope.launch {
            try {
                api.startSelfUpdate(StartSelfUpdateRequest(version)).bodyOrRefusal("POST /api/admin/self-update/start")
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                NativeDebug.e("Self-update start failed", t)
                startError = context.requestErrorText(t).ifEmpty { "failed to start update" }
                enter(SelfUpdatePhase.ERROR)
            }
        }
    }

    /** Kills the build and rolls the install back; the status poll then
     *  shows the outcome. The server restarting under the request is the
     *  expected path, so its failure says nothing. */
    fun cancel() {
        cancelling = true
        scope.launch {
            try {
                api.cancelSelfUpdate()
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                NativeDebug.e("Self-update cancel request failed", t)
            }
        }
    }

    /** Records on the server that this outcome was seen, so it does not
     *  come back on the next launch or on another device. Best-effort. */
    suspend fun acknowledge() {
        val endedAt = status?.endedAt ?: return
        try {
            api.acknowledgeSelfUpdate(AcknowledgeSelfUpdateRequest(endedAt))
                .bodyOrRefusal("POST /api/admin/self-update/acknowledge")
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            NativeDebug.e("Self-update acknowledge failed", t)
        }
    }

    /** Close: the outcome is acknowledged first, then the window goes. */
    fun dismiss() {
        scope.launch {
            acknowledge()
            stopped = true
            enter(SelfUpdatePhase.IDLE)
            startError = null
        }
    }

    /** The host's memory and CPU, null when the read fails or is too slow. */
    suspend fun readSystem(): SelfUpdateSystemDto? = try {
        api.selfUpdateSystem().bodyOrRefusal("GET /api/admin/self-update/system")
    } catch (t: CancellationException) {
        throw t
    } catch (t: Throwable) {
        null
    }

    /** The update's raw output, empty before it writes any, null when the
     *  read fails and the log shown should stay as it is. */
    suspend fun readLog(): String? = try {
        val response = api.selfUpdateLog()
        when {
            response.code() == 204 -> ""
            response.isSuccessful -> response.body()?.string()
            else -> null
        }
    } catch (t: CancellationException) {
        throw t
    } catch (t: Throwable) {
        null
    }

    /** Every phase change goes through here: entering an active one starts
     *  following the status, unless that is already happening. */
    private fun enter(next: SelfUpdatePhase) {
        phase = next
        if (next.active && polling?.isActive != true) poll()
    }

    /**
     * Follows the status file every 500ms until it reports an outcome, the
     * server refuses outright or ten minutes pass. Two failed reads in a
     * row mean the server is restarting when the last step known takes it
     * down, and only that it is busy otherwise.
     */
    private fun poll() {
        stopped = false
        slowResponse = false
        polling = scope.launch {
            var transientFailures = 0
            var lastKnownState: String? = null
            val startedAt = SystemClock.elapsedRealtime()
            while (!stopped && SystemClock.elapsedRealtime() - startedAt < PollLimitMs) {
                when (val read = readStatus()) {
                    is StatusRead.Answer -> {
                        transientFailures = 0
                        read.status?.let { current ->
                            lastKnownState = current.state
                            status = current
                            slowResponse = false
                            terminalPhaseOf(current.state)?.let {
                                enter(it)
                                return@launch
                            }
                            if (current.state in ActiveStates) enter(SelfUpdatePhase.RUNNING)
                        }
                    }
                    StatusRead.Unreachable -> {
                        transientFailures++
                        if (transientFailures >= 2) {
                            if (lastKnownState == null || lastKnownState in ServerDownStates) {
                                if (phase == SelfUpdatePhase.RUNNING || phase == SelfUpdatePhase.STARTING) {
                                    enter(SelfUpdatePhase.WAITING_FOR_SERVER)
                                }
                            } else {
                                slowResponse = true
                            }
                        }
                    }
                    StatusRead.Refused -> return@launch
                }
                delay(PollIntervalMs)
            }
        }
    }

    /** A status read: its answer (null when no update ever ran), the
     *  server out of reach (down, restarting, or a proxy saying so), or a
     *  refusal that ends the polling. */
    private sealed interface StatusRead {
        data class Answer(val status: SelfUpdateStatusDto?) : StatusRead
        data object Unreachable : StatusRead
        data object Refused : StatusRead
    }

    private suspend fun readStatus(): StatusRead = try {
        val response = api.selfUpdateStatus()
        when {
            response.code() == 204 -> StatusRead.Answer(null)
            response.isSuccessful -> StatusRead.Answer(response.body())
            response.code() in 502..504 -> StatusRead.Unreachable
            else -> StatusRead.Refused
        }
    } catch (t: CancellationException) {
        throw t
    } catch (t: Throwable) {
        StatusRead.Unreachable
    }
}

private fun terminalPhaseOf(state: String?): SelfUpdatePhase? = when (state) {
    "success" -> SelfUpdatePhase.SUCCESS
    "error" -> SelfUpdatePhase.ERROR
    "rolled_back" -> SelfUpdatePhase.ROLLED_BACK
    "cancelled" -> SelfUpdatePhase.CANCELLED
    else -> null
}

private val ActiveStates = setOf(
    "queued", "preparing", "stopping_service", "fetching", "renaming",
    "creating", "installing", "building", "starting_service", "rolling_back",
)

private val TerminalStates = setOf("success", "error", "rolled_back", "cancelled")

/** The steps during which the server itself is down. */
private val ServerDownStates = setOf("starting_service", "stopping_service", "renaming", "creating")

private const val PollIntervalMs = 500L
private const val PollLimitMs = 10 * 60 * 1000L
