package com.glasskeep.app.nativeapp

import android.content.Context
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.TokenStore
import com.glasskeep.app.nativeapp.data.local.AppDatabase
import com.glasskeep.app.nativeapp.data.network.ApiClientFactory
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi

/**
 * Hand-rolled dependency container, no DI framework: the native rewrite is
 * still small enough (two screens) that Hilt would be pure ceremony right
 * now. Revisit once there are enough repositories to make manual wiring
 * painful.
 */
class NativeAppContainer(context: Context) {
    val tokenStore = TokenStore(context)
    private val db = AppDatabase.get(context)

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
        val fresh = ApiClientFactory.create(serverUrl, tokenStore)
        cachedApi = fresh
        cachedApiServerUrl = serverUrl
        return fresh
    }

    fun notesRepository(serverUrl: String) = NotesRepository(api(serverUrl), db.noteDao())
}
