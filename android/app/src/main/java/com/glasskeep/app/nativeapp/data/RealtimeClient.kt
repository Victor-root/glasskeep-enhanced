package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.network.ApiClientFactory
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources

/**
 * Long-lived connection to GET /api/events (server/index.js), so a note
 * changed on another device, or by a collaborator, shows up here without
 * waiting on a manual pull-to-refresh. Foreground-only by design: started
 * on ON_START, stopped on ON_STOP (see NativeNavHost.kt's own
 * LocalLifecycleOwner wiring), rather than spanning the whole signed-in
 * session the way the web's own browser-tab EventSource does - an
 * Android process has no equivalent "stays alive regardless of
 * visibility" guarantee without a foreground service, which would fight
 * Doze/App Standby for a nice-to-have and doesn't match this app's own
 * existing "no background polling" precedent (NotificationsScreen.kt
 * fetches on open only; SyncQueueWorker/ReminderSyncWorker are
 * WorkManager jobs, not a standing connection).
 *
 * The server keeps no backlog of missed events (no replay on reconnect -
 * a dropped connection is just gone, see its own connection registry),
 * so [onRefreshNeeded] also fires once, immediately, on every RECONNECT
 * (not the first connect) to catch up on anything missed while
 * disconnected - matching the web's own reload-on-reconnect behavior.
 * Without this, a note changed elsewhere during a disconnected interval
 * (network blip, a few minutes backgrounded) would otherwise sit
 * unreflected until the user happens to pull to refresh.
 *
 * okhttp-sse's EventSource does not reconnect on its own once the stream
 * closes or fails - every retry here is hand-rolled: exponential
 * backoff starting at 1s, capped at 30s, mirroring the web's own
 * reconnect strategy (src/App.jsx's connectSSE/onerror), and (like the
 * web) never gives up on its own - only stop() ends the retry loop.
 */
class RealtimeClient(
    private val serverUrl: String,
    private val tokenStore: TokenStore,
    private val onRefreshNeeded: suspend () -> Unit,
    private val onInstanceLocked: () -> Unit,
    private val onInstanceUnlocked: () -> Unit,
) {
    private val json = Json { ignoreUnknownKeys = true }

    // start()/stop() run on the main thread (Compose's lifecycle
    // observer); EventSourceListener's own callbacks below run on
    // OkHttp's dispatcher thread. @Volatile so a stop() on one thread is
    // never invisible to an in-flight reconnect/event callback on the
    // other - these are simple flags read-then-acted-on, not
    // multi-field invariants, so a plain visibility guarantee is enough
    // without a heavier lock.
    @Volatile private var scope: CoroutineScope? = null
    @Volatile private var eventSource: EventSource? = null
    @Volatile private var reconnectAttempt = 0
    @Volatile private var hasConnectedOnce = false

    fun start() {
        if (scope != null) return
        NativeDebug.d("RealtimeClient.start")
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        connect()
    }

    fun stop() {
        if (scope == null) return
        NativeDebug.d("RealtimeClient.stop")
        scope?.cancel()
        scope = null
        eventSource?.cancel()
        eventSource = null
        reconnectAttempt = 0
        hasConnectedOnce = false
    }

    private fun triggerRefresh() {
        scope?.launch { onRefreshNeeded() }
    }

    private fun connect() {
        // ApiClientFactory's own client keeps OkHttp's normal (short)
        // read timeout, right for a request/response call but fatal
        // here: the server only writes a keepalive ping every 25s (see
        // server/index.js's own GET /api/events handler), so a
        // request-call timeout would tear this down within seconds of
        // every single connect. newBuilder() copies the same
        // interceptors (auth, logging) and only overrides this one
        // setting - generous enough to tolerate a missed ping or two,
        // not so long that a truly dead connection goes undetected.
        val client = ApiClientFactory.okHttpClient(tokenStore, onInstanceLocked).newBuilder()
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
        val normalizedBaseUrl = if (serverUrl.endsWith("/")) serverUrl else "$serverUrl/"
        val request = Request.Builder().url("${normalizedBaseUrl}api/events").build()
        eventSource = EventSources.createFactory(client).newEventSource(request, Listener())
    }

    private fun scheduleReconnect() {
        val activeScope = scope ?: return
        val delayMs = (RECONNECT_BASE_DELAY_MS * (1L shl reconnectAttempt.coerceAtMost(MAX_BACKOFF_SHIFT)))
            .coerceAtMost(RECONNECT_MAX_DELAY_MS)
        reconnectAttempt++
        NativeDebug.d("RealtimeClient scheduling reconnect in ${delayMs}ms (attempt $reconnectAttempt)")
        activeScope.launch {
            delay(delayMs)
            if (isActive) connect()
        }
    }

    private inner class Listener : EventSourceListener() {
        override fun onOpen(eventSource: EventSource, response: Response) {
            NativeDebug.d("RealtimeClient connected")
            reconnectAttempt = 0
            if (hasConnectedOnce) {
                NativeDebug.d("RealtimeClient reconnected, refreshing to catch up on anything missed")
                triggerRefresh()
            }
            hasConnectedOnce = true
        }

        // Every real application event is an unnamed ("message") SSE
        // frame - server/index.js's sendEventToUser writes a plain
        // `data: {...}\n\n` with no `event:` line, so the dispatch key
        // is the `type` field INSIDE the JSON payload, not the [type]
        // param here (which is only ever set for the server's own
        // named "hello"/"ping" keepalive frames - neither carries a
        // payload `type` field, so they fall through the parse below as
        // null and are correctly ignored without special-casing them).
        override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
            val payloadType = runCatching {
                val root = json.parseToJsonElement(data) as? JsonObject
                (root?.get("type") as? JsonPrimitive)?.contentOrNull
            }.getOrNull()
            if (payloadType != null && payloadType in REFRESH_TRIGGER_TYPES) {
                NativeDebug.d("RealtimeClient event type=$payloadType, refreshing")
                triggerRefresh()
            }
            // At-rest encryption's two lock-state frames, the one pair the
            // server sends to EVERY connected client rather than to one
            // user (server/routes/unlockRoutes.js's broadcastToAll). They
            // carry no note data: their whole job is to move the app to or
            // from the unlock screen at once, instead of up to 30 seconds
            // later on the next status read (App.jsx:3769).
            when (payloadType) {
                "instance_locked" -> {
                    NativeDebug.d("RealtimeClient event type=instance_locked")
                    onInstanceLocked()
                }
                "instance_unlocked" -> {
                    NativeDebug.d("RealtimeClient event type=instance_unlocked")
                    onInstanceUnlocked()
                }
            }
        }

        override fun onClosed(eventSource: EventSource) {
            NativeDebug.d("RealtimeClient connection closed")
            scheduleReconnect()
        }

        override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
            NativeDebug.e("RealtimeClient connection failed, will retry", t)
            scheduleReconnect()
        }
    }

    companion object {
        // Every one of these means "the active-notes list, or one
        // note's access, may have changed" - NotesRepository.refresh()
        // is the correct, inherently archived/trashed-safe reaction for
        // all of them (a plain full re-fetch, the same one the web
        // itself falls back to for notes_reordered/notes_imported
        // rather than a surgical patch). note_shared and
        // note_access_revoked_notification (and its collaborator_*/
        // shared_note_deleted* variants) are deliberately NOT here:
        // they're paired, persisted notifications NotificationsScreen.kt
        // already fetches fresh on every open, and the note-content side
        // of each is already covered by the note_updated/
        // note_access_revoked event the server fires alongside it (see
        // server/index.js's own call sites for createShareNotification/
        // createAccessRevokedNotification, always paired with
        // broadcastNoteUpdated or the access-revoked event). Every other
        // type this server emits (admin panel, federation, reminders,
        // profile/settings sync) has no corresponding native screen or
        // mechanism to react through today, so an unrecognized type is
        // silently ignored rather than guessed at.
        private val REFRESH_TRIGGER_TYPES = setOf(
            "note_updated",
            "note_deleted",
            "notes_reordered",
            "notes_imported",
            "note_access_changed",
            "note_access_revoked",
        )
        private const val RECONNECT_BASE_DELAY_MS = 1000L
        private const val RECONNECT_MAX_DELAY_MS = 30000L
        private const val MAX_BACKOFF_SHIFT = 5
    }
}
