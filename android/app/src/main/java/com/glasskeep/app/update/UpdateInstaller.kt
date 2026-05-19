package com.glasskeep.app.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

/**
 * Hands a freshly-downloaded APK to Android's system installer. We never
 * install silently — that's a privileged action reserved for the Play
 * Store / OEM updater — but the user only sees the standard "Update
 * GlassKeep?" dialog with [Cancel] / [Install], same as a sideloaded
 * install would show.
 *
 * Prerequisite: the user has flipped "Install unknown apps" for
 * GlassKeep in Settings → Apps → Special access. We can't grant that
 * ourselves; canRequestInstalls() reports the status and
 * openInstallPermissionSettings() jumps them straight to the toggle.
 */
internal object UpdateInstaller {

    /** True when the OS will let us fire the install intent. */
    fun canRequestInstalls(context: Context): Boolean {
        // Below Android 8 the per-app "install unknown apps" toggle
        // didn't exist — the legacy system-wide setting governed it
        // and any app could request install if the user had it on.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        return context.packageManager.canRequestPackageInstalls()
    }

    /**
     * Open the per-app "install unknown apps" settings screen pre-
     * scoped to our package, so the user lands directly on the
     * GlassKeep toggle instead of having to dig through the app list.
     */
    fun openInstallPermissionSettings(context: Context) {
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            // Fallback to the global settings page on devices that
            // don't expose the per-app variant.
            context.startActivity(
                Intent(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }

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
