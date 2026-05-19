package com.glasskeep.app.update

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Streams a remote APK into the app's private cache. Runs synchronously
 * — callers schedule us on a background thread. Successes return the
 * final File; failures clean up the half-written file and return null.
 *
 * The download lives under cacheDir/updates/, which is the path exposed
 * by res/xml/file_paths.xml. The system installer (started by
 * UpdateInstaller) reads it through the FileProvider declared in the
 * manifest, so we never need any external-storage permission.
 */
internal object UpdateDownloader {

    private const val TAG = "GK-Updater"
    private const val UPDATES_DIR = "updates"
    private const val PART_SUFFIX = ".part"

    /** Returns the downloaded File on success, null on any failure. */
    fun downloadTo(context: Context, url: String, fileName: String): File? {
        val dir = File(context.cacheDir, UPDATES_DIR).apply { mkdirs() }
        purgeOlder(dir, keep = fileName)

        val finalFile = File(dir, fileName)
        // Re-use a previous successful download for the same filename
        // (e.g. user dismissed the install dialog last time): re-fire
        // the install intent against the already-downloaded APK
        // instead of pulling it down again.
        if (finalFile.exists() && finalFile.length() > 0) return finalFile

        val partFile = File(dir, fileName + PART_SUFFIX)
        partFile.delete()

        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("User-Agent", "GlassKeep-Android-Updater")
                connectTimeout = 15_000
                // No read timeout: large APKs over a slow link otherwise
                // tear down mid-stream. We rely on the system's TCP
                // keepalive + the user being able to background the app
                // safely (cacheDir survives).
                readTimeout = 0
                instanceFollowRedirects = true
            }
            if (conn.responseCode !in 200..299) {
                Log.w(TAG, "Download HTTP ${conn.responseCode} for $url")
                return null
            }
            conn.inputStream.use { input ->
                FileOutputStream(partFile).use { output ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n <= 0) break
                        output.write(buf, 0, n)
                    }
                }
            }
            // Atomic-ish rename so a half-written .part can never be
            // mistaken for a complete APK by a future install attempt.
            if (!partFile.renameTo(finalFile)) {
                partFile.delete()
                return null
            }
            finalFile
        } catch (e: Exception) {
            Log.w(TAG, "Download failed: ${e.message}")
            partFile.delete()
            null
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Wipe everything under updates/ except `keep`. Stops the cache
     * directory from accumulating one APK per release the user ever
     * upgraded through.
     */
    private fun purgeOlder(dir: File, keep: String) {
        dir.listFiles()?.forEach { file ->
            if (file.name != keep) file.delete()
        }
    }
}
