package com.glasskeep.app.nativeapp

import android.content.Context
import com.glasskeep.app.MainActivity
import com.glasskeep.app.nativeapp.data.NoteAiStore
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.data.TokenStore
import com.glasskeep.app.nativeapp.data.local.AppDatabase
import com.glasskeep.app.nativeapp.data.local.SyncQueueDatabase
import com.glasskeep.app.nativeapp.data.network.ApiClientFactory
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
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
    private val db = AppDatabase.get(appContext)
    private val syncQueueDb = SyncQueueDatabase.get(appContext)

    private var cachedApi: GlassKeepApi? = null
    private var cachedApiServerUrl: String? = null

    /**
     * Rebuilds the Retrofit client only when the server URL actually
     * changes, so one container instance can follow the user switching
     * servers (see WebViewActivity's "change server" dialog for the
     * existing precedent).
     */
    fun api(serverUrl: String): GlassKeepApi {
        val existing = cachedApi
        if (existing != null && cachedApiServerUrl == serverUrl) return existing
        NativeDebug.d("NativeAppContainer.api: (re)building client for $serverUrl")
        val fresh = ApiClientFactory.create(serverUrl, tokenStore, lockState::markLocked)
        cachedApi = fresh
        cachedApiServerUrl = serverUrl
        return fresh
    }

    fun notesRepository(serverUrl: String) = NotesRepository(api(serverUrl), db.noteDao(), syncQueueDb.syncQueueDao())

    /**
     * Removes every piece of state tied to the current server before the
     * setup screen is allowed to select another one. In particular, an old
     * JWT or queued offline edit must never be replayed against the new URL.
     */
    suspend fun clearForServerChange() {
        NativeDebug.d("NativeAppContainer.clearForServerChange")

        // Stop both native queue drains first; a new login schedules them again.
        SyncQueueWorker.cancelAll(appContext)

        syncQueueDb.syncQueueDao().deleteAll()
        db.noteDao().deleteAll()
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
