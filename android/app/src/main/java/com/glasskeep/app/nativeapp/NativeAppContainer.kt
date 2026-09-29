package com.glasskeep.app.nativeapp

import android.content.Context
import androidx.compose.runtime.mutableStateOf
import com.glasskeep.app.MainActivity
import com.glasskeep.app.nativeapp.data.NoteAiStore
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.data.TokenStore
import com.glasskeep.app.nativeapp.data.sessionTokenUserId
import com.glasskeep.app.nativeapp.data.local.AppDatabase
import com.glasskeep.app.nativeapp.data.local.SyncQueueDatabase
import com.glasskeep.app.nativeapp.data.network.ApiClientFactory
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import com.glasskeep.app.nativeapp.data.network.NotesHttpCache
import com.glasskeep.app.reminders.ReminderScheduler
import com.glasskeep.app.reminders.ReminderSyncWorker

/**
 * Hand-rolled dependency container, no DI framework: the native rewrite is
 * still small enough that Hilt would be pure ceremony right now. Revisit
 * once there are enough repositories to make manual wiring painful.
 */
class NativeAppContainer(context: Context) {
    private val appContext = context.applicationContext
    val tokenStore = TokenStore(appContext)
    val themeState = ThemeState(tokenStore)
    val editorPrefs = EditorPrefsState(tokenStore)
    val shellPrefs = ShellPrefsState(tokenStore)
    val lockState = InstanceLockState()
    val syncStatus = SyncStatusState()
    val branding = BrandingState(tokenStore)
    val noteAiStore = NoteAiStore(appContext)

    // Claimed by NoteDetailScreen while a note is open, so the status/nav
    // bars match that note's own background instead of staying on the
    // workspace theme color underneath it.
    val statusBarOverride = StatusBarOverride()

    /** The server refused the session in use ([expireSession]): true until
     *  NativeNavHost has taken the app back to the sign-in screen. */
    val sessionExpired = mutableStateOf(false)
    private val db = AppDatabase.get(appContext)
    private val syncQueueDb = SyncQueueDatabase.get(appContext)
    private val httpCache = NotesHttpCache.get(appContext)

    private var cachedApi: GlassKeepApi? = null
    private var cachedApiServerUrl: String? = null

    /**
     * Rebuilds the Retrofit client only when the server URL actually
     * changes, so one container instance can follow the user switching
     * servers.
     */
    fun api(serverUrl: String): GlassKeepApi {
        val existing = cachedApi
        if (existing != null && cachedApiServerUrl == serverUrl) return existing
        NativeDebug.d("NativeAppContainer.api: (re)building client for $serverUrl")
        val fresh = ApiClientFactory.create(serverUrl, tokenStore, httpCache, lockState::markLocked, ::expireSession)
        cachedApi = fresh
        cachedApiServerUrl = serverUrl
        return fresh
    }

    fun notesRepository(serverUrl: String) = NotesRepository(api(serverUrl), db.noteDao(), syncQueueDb.syncQueueDao(), httpCache)

    @Volatile private var sessionSwapping = false

    /** api.js's teardown on a 401 to a request that presented the session:
     *  the stored session goes at once, the screens follow. */
    fun expireSession(presented: String) {
        if (!sessionSwapping && tokenStore.expireSession(presented)) sessionExpired.value = true
    }

    /** Stores the token [swap] trades the session for (a password change).
     *  The server refuses the old one as soon as it takes the change, before
     *  its answer hands the new one over: a 401 in between (the realtime
     *  stream it cuts reconnecting) says nothing of the session. */
    suspend fun swapSession(swap: suspend () -> String) {
        sessionSwapping = true
        try {
            tokenStore.token = swap()
        } finally {
            sessionSwapping = false
        }
    }

    /** The notes and the queue this phone holds, answers kept from the
     *  server included, for an account or a server no longer in use. */
    private suspend fun wipeLocalNotes() {
        syncQueueDb.syncQueueDao().deleteAll()
        db.noteDao().deleteAll()
        NotesHttpCache.clear(httpCache)
    }

    /**
     * Installs the session a sign-in handed over. The offline edits a
     * refused session left in the queue are replayed for that same
     * account, and dropped with the cached notes for any other.
     */
    suspend fun startSession(serverUrl: String, token: String) {
        val owner = tokenStore.queueOwner
        if (owner != null && owner != sessionTokenUserId(token)) {
            NativeDebug.d("startSession: another account signed in, the expired session's queue is dropped")
            wipeLocalNotes()
        }
        tokenStore.queueOwner = null
        tokenStore.serverUrl = serverUrl
        tokenStore.token = token
    }

    /**
     * Removes every piece of state tied to the current server before the
     * setup screen is allowed to select another one. In particular, an old
     * JWT or queued offline edit must never be replayed against the new URL.
     */
    suspend fun clearForServerChange() {
        NativeDebug.d("NativeAppContainer.clearForServerChange")

        // Stop both native queue drains first; a new login schedules them again.
        SyncQueueWorker.cancelAll(appContext)

        wipeLocalNotes()
        check(noteAiStore.clearAll()) { "Could not clear saved note AI conversations" }
        ReminderScheduler.syncAll(appContext, emptyList())

        // These commits are synchronous because MainActivity is restarted as
        // soon as this function returns.
        check(tokenStore.clear()) { "Could not clear native session" }
        val legacyCleared = appContext.getSharedPreferences("glasskeep", Context.MODE_PRIVATE)
            .edit()
            .remove("server_url")
            .remove(MainActivity.KEY_URL_VETTED)
            .remove(ReminderSyncWorker.KEY_TOKEN)
            .commit()
        check(legacyCleared) { "Could not clear legacy Android session" }

        cachedApi = null
        cachedApiServerUrl = null
    }
}
