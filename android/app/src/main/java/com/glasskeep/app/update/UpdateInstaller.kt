package com.glasskeep.app.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

/**
 * Hands a freshly-downloaded APK to Android's system installer. We never
 * install silently — that's a privileged action reserved for the Play
 * Store / OEM updater — but the user only sees the standard "Update
 * GlassKeep?" dialog with [Cancel] / [Install], same as a sideloaded
 * install would show.
 *
 * On Android 8+ the system handles the "Install unknown apps" toggle
 * inline when ACTION_VIEW is fired: if the user hasn't granted the
 * special-access permission yet, the toggle page is shown first, and
 * the moment they enable it the install dialog pops automatically.
 * That means we just fire the intent and let the OS do the dance —
 * no pre-flight permission check needed.
 */
internal object UpdateInstaller {

    /**
     * Fire ACTION_VIEW with the APK MIME so the system installer takes
     * over. Returns false if the intent can't be launched (no installer
     * activity, missing FileProvider authority, etc.).
     */
    fun install(context: Context, apk: File): Boolean {
        if (!apk.exists() || apk.length() == 0L) return false
        val authority = "${context.packageName}.fileprovider"
        val uri: Uri = try {
            FileProvider.getUriForFile(context, authority, apk)
        } catch (e: IllegalArgumentException) {
            return false
        }
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }
}
