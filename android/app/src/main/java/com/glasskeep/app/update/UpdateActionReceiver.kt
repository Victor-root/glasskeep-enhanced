package com.glasskeep.app.update

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast
import com.glasskeep.app.R

/**
 * Wired to the "update available" notification's content intent. The
 * receiver kicks off the silent background download via UpdateManager
 * and surfaces only Toast feedback — the noisy "Update GlassKeep?"
 * dialog the user actually sees is fired by the system installer once
 * the download lands, not by us.
 *
 * Declared in the manifest as `<receiver android:name=".update.UpdateActionReceiver" />`.
 */
class UpdateActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_DOWNLOAD) return
        val versionName = intent.getStringExtra(EXTRA_VERSION) ?: return
        val assetName = intent.getStringExtra(EXTRA_ASSET) ?: return
        val downloadUrl = intent.getStringExtra(EXTRA_URL) ?: return
        val release = ReleaseInfo(versionName, assetName, downloadUrl, -1L)

        Toast.makeText(context, R.string.update_downloading, Toast.LENGTH_SHORT).show()

        UpdateManager.downloadAndInstall(context, release) { ok ->
            if (ok) return@downloadAndInstall
            // Failure path: distinguish "permission missing" (we've
            // already opened the settings page in UpdateManager — just
            // tell the user what to do) from "actual download error".
            val msg = if (!UpdateInstaller.canRequestInstalls(context)) {
                R.string.update_install_perm_needed
            } else {
                R.string.update_download_failed
            }
            Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
        }
    }

    companion object {
        const val ACTION_DOWNLOAD = "com.glasskeep.app.update.ACTION_DOWNLOAD"
        const val EXTRA_VERSION = "version"
        const val EXTRA_ASSET = "asset"
        const val EXTRA_URL = "url"
    }
}
