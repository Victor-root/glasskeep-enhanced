package com.glasskeep.app.webview

import android.app.Activity
import android.app.DownloadManager
import android.net.Uri
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.WebView
import android.widget.Toast
import com.glasskeep.app.R
import com.glasskeep.app.net.TrustedCertificate
import java.io.File
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Files the page downloads. A server URL goes through the system
 * DownloadManager, or is fetched by the app itself from a server whose
 * certificate only the app trusts (see [TrustedCertificate]); a blob: URL
 * is read by the page itself and comes back through [saveBlobFile]
 * (window.AndroidTheme.saveBlobFile). Both are written to the Downloads
 * collection.
 */
class WebDownloads(private val activity: Activity) {

    private val worker = Executors.newSingleThreadExecutor()

    /** The WebView's DownloadListener. */
    fun onDownloadStart(
        webView: WebView,
        downloadUrl: String,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?,
    ) {
        if (downloadUrl.startsWith("blob:")) {
            // blob: URLs can't be downloaded by DownloadManager:
            // fetch in JS, convert to base64, pass to native bridge
            val filename = URLUtil.guessFileName(downloadUrl, contentDisposition, mimeType)
            webView.evaluateJavascript("""
                (async function(){
                  try {
                    var r = await fetch('$downloadUrl');
                    var b = await r.blob();
                    var reader = new FileReader();
                    reader.onloadend = function(){
                      var base64 = reader.result.split(',')[1] || '';
                      window.AndroidTheme.saveBlobFile(base64, '$filename', b.type || '$mimeType');
                    };
                    reader.readAsDataURL(b);
                  } catch(e){ console.error('blob download failed', e); }
                })()
            """.trimIndent(), null)
        } else {
            enqueue(downloadUrl, URLUtil.guessFileName(downloadUrl, contentDisposition, mimeType), mimeType, userAgent)
        }
    }

    /** A file whose name the page knows: guessFileName cannot read a
     *  Content-Disposition carrying a UTF-8 name, and answers "file.bin". */
    fun downloadNamed(url: String, name: String, mimeType: String) {
        enqueue(url, File(name).name.ifBlank { "file" }, mimeType, null)
    }

    private fun enqueue(url: String, filename: String, mimeType: String?, userAgent: String?) {
        // DownloadManager runs in another process, which knows nothing of
        // the certificate the user trusted.
        if (TrustedCertificate.pinFor(activity, Uri.parse(url).host) != null) {
            fetch(url, filename, mimeType, userAgent)
            return
        }
        try {
            val req = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mimeType)
                addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url))
                userAgent?.let { addRequestHeader("User-Agent", it) }
                setTitle(filename)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
            }
            activity.getSystemService(DownloadManager::class.java).enqueue(req)
            Toast.makeText(activity, activity.getString(R.string.download_started), Toast.LENGTH_SHORT).show()
        } catch (_: Exception) {
            Toast.makeText(activity, activity.getString(R.string.download_error), Toast.LENGTH_SHORT).show()
        }
    }

    private fun fetch(url: String, filename: String, mimeType: String?, userAgent: String?) {
        Toast.makeText(activity, activity.getString(R.string.download_started), Toast.LENGTH_SHORT).show()
        val cookie = CookieManager.getInstance().getCookie(url)
        worker.execute {
            val connection = URL(url).openConnection() as HttpURLConnection
            try {
                TrustedCertificate.applyTo(activity, connection)
                cookie?.let { connection.setRequestProperty("Cookie", it) }
                userAgent?.let { connection.setRequestProperty("User-Agent", it) }
                connection.connectTimeout = TIMEOUT_MS
                connection.readTimeout = TIMEOUT_MS
                if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                    failed()
                    return@execute
                }
                val type = mimeType?.takeIf { it.isNotBlank() } ?: connection.contentType ?: "application/octet-stream"
                writeToDownloads(filename, type) { out -> connection.inputStream.use { it.copyTo(out) } }
            } catch (_: Exception) {
                failed()
            } finally {
                connection.disconnect()
            }
        }
    }

    fun saveBlobFile(base64Data: String, filename: String, mimeType: String) {
        val bytes = try {
            android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
        } catch (_: Exception) {
            failed()
            return
        }
        writeToDownloads(filename, mimeType) { it.write(bytes) }
    }

    /** Writes a file into Downloads from any thread, and says how it went. */
    private fun writeToDownloads(filename: String, mimeType: String, write: (OutputStream) -> Unit) {
        try {
            val contentValues = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Downloads.DISPLAY_NAME, filename)
                put(android.provider.MediaStore.Downloads.MIME_TYPE, mimeType)
                put(android.provider.MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = activity.contentResolver.insert(
                android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues
            )
            if (uri == null) {
                failed()
                return
            }
            activity.contentResolver.openOutputStream(uri)?.use(write)
            val updateValues = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
            }
            activity.contentResolver.update(uri, updateValues, null, null)
            activity.runOnUiThread {
                Toast.makeText(activity, activity.getString(R.string.download_complete, filename), Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            android.util.Log.e("GlassKeep", "download not saved", e)
            failed()
        }
    }

    private fun failed() {
        activity.runOnUiThread {
            Toast.makeText(activity, activity.getString(R.string.download_error), Toast.LENGTH_SHORT).show()
        }
    }

    private companion object {
        const val TIMEOUT_MS = 30_000
    }
}
