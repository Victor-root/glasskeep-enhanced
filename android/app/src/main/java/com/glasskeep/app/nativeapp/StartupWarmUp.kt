package com.glasskeep.app.nativeapp

import android.content.Context
import com.glasskeep.app.nativeapp.data.SessionPrefs
import com.glasskeep.app.nativeapp.data.local.AppDatabase
import com.glasskeep.app.nativeapp.data.local.SyncQueueDatabase
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Opens, in the background, what the first screen waits for on a cold
 * start: the encrypted session store and the two databases. Launched as
 * soon as the app's entry activity exists, so the work overlaps the
 * activity hand-over and the building of the container instead of
 * following it. Nothing here is needed to be correct: whoever needs one of
 * these first simply waits for the same single open.
 */
object StartupWarmUp {
    private val started = AtomicBoolean(false)

    fun begin(context: Context) {
        if (!started.compareAndSet(false, true)) return
        val appContext = context.applicationContext
        thread(name = "gk-warm-up") {
            open("session store") { SessionPrefs.get(appContext) }
            open("notes database") { AppDatabase.get(appContext).openHelper.writableDatabase }
            open("sync queue database") { SyncQueueDatabase.get(appContext).openHelper.writableDatabase }
        }
    }

    private fun open(what: String, action: () -> Unit) {
        try {
            action()
            NativeDebug.boot("warm-up: $what open")
        } catch (t: Throwable) {
            NativeDebug.e("warm-up: $what failed, the first real use will report it", t)
        }
    }
}
