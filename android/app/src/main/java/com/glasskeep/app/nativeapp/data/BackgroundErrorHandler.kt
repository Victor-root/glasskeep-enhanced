package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.NativeDebug
import kotlinx.coroutines.CoroutineExceptionHandler

/**
 * For the scopes the app runs on its own (the realtime stream, the queue
 * drain): nobody awaits what they launch, and an exception left uncaught in
 * such a coroutine ends the whole process. A refresh that fails on a lost
 * connection, a refused session or a locked instance is an ordinary outcome
 * there, so it is only logged, as the web's own silent catch does.
 */
internal val backgroundErrorHandler = CoroutineExceptionHandler { _, error ->
    NativeDebug.e("Background task failed", error)
}
