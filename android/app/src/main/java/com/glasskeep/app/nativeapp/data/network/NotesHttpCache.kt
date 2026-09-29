package com.glasskeep.app.nativeapp.data.network

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cache
import java.io.File

/**
 * The disk cache behind [RevalidatingCallFactory]: every client of the
 * process shares this one, two caches on one directory would corrupt each
 * other. It holds notes, so whatever wipes the notes off the phone wipes
 * it too ([clear]).
 */
object NotesHttpCache {
    private const val DIRECTORY = "notes-http"
    private const val MAX_BYTES = 128L * 1024 * 1024

    @Volatile private var cache: Cache? = null

    fun get(context: Context): Cache =
        cache ?: synchronized(this) {
            cache ?: Cache(File(context.applicationContext.cacheDir, DIRECTORY), MAX_BYTES).also { cache = it }
        }

    /** Forgets every answer kept in [cache]. */
    suspend fun clear(cache: Cache) = withContext(Dispatchers.IO) { cache.evictAll() }
}
