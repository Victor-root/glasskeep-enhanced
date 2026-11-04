package com.glasskeep.app.webview

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.widget.Toast
import androidx.core.content.FileProvider
import com.glasskeep.app.R
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Opens an attached file in whatever app the phone has for it: a WebView has
 * no PDF viewer or the like of its own. The file comes down into the app's
 * cache, shared through the FileProvider (see res/xml/file_paths.xml), which
 * needs no storage permission. Only the last file opened is kept there.
 */
class AttachmentOpener(private val activity: Activity) {

    private val worker = Executors.newSingleThreadExecutor()

    fun open(url: String, name: String, mimeType: String) {
        toast(R.string.attachment_opening)
        worker.execute {
            try {
                val file = download(url, name)
                activity.runOnUiThread { view(file, mimeType) }
            } catch (_: Exception) {
                activity.runOnUiThread { toast(R.string.attachment_open_failed) }
            }
        }
    }

    private fun download(url: String, name: String): File {
        val folder = File(activity.cacheDir, FOLDER).apply {
            deleteRecursively()
            mkdirs()
        }
        // The name comes from the page: only ever its last path segment.
        val file = File(folder, File(name).name.ifBlank { "file" })
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            check(connection.responseCode == HttpURLConnection.HTTP_OK)
            connection.inputStream.use { input -> file.outputStream().use { input.copyTo(it) } }
        } finally {
            connection.disconnect()
        }
        return file
    }

    private fun view(file: File, mimeType: String) {
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, mimeType.ifBlank { "application/octet-stream" })
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try {
            activity.startActivity(Intent.createChooser(intent, file.name))
        } catch (_: ActivityNotFoundException) {
            toast(R.string.attachment_no_app)
        }
    }

    private fun toast(message: Int) {
        Toast.makeText(activity, activity.getString(message), Toast.LENGTH_SHORT).show()
    }

    private companion object {
        const val FOLDER = "attachments"
        const val TIMEOUT_MS = 30_000
    }
}
