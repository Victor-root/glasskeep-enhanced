package com.glasskeep.app.webview

import android.Manifest
import android.app.DownloadManager
import android.content.ContentValues
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import com.glasskeep.app.R
import com.glasskeep.app.net.TrustedCertificate
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Files the page downloads. A server URL goes through the system
 * DownloadManager, or is fetched by the app itself from a server whose
 * certificate only the app trusts (see [TrustedCertificate]); a blob: URL
 * is read by the page itself and comes back through [saveBlobFile]
 * (window.AndroidTheme.saveBlobFile). Both are written to Downloads.
 * Its permission launcher is registered when it is constructed, so it is
 * created while the activity is.
 */
class WebDownloads(private val activity: ComponentActivity) {

    private val worker = Executors.newSingleThreadExecutor()

    /** Downloads waiting for the storage permission, Android 9 and below. */
    private val waitingForStorage = mutableListOf<() -> Unit>()

    private val storagePermission = activity.registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val waiting = waitingForStorage.toList()
        waitingForStorage.clear()
        if (granted) waiting.forEach { it() } else failed()
    }

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

    private fun enqueue(url: String, filename: String, mimeType: String?, userAgent: String?) =
        withStorage { download(url, filename, mimeType, userAgent) }

    private fun download(url: String, filename: String, mimeType: String?, userAgent: String?) {
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
        activity.runOnUiThread {
            withStorage { worker.execute { writeToDownloads(filename, mimeType) { it.write(bytes) } } }
        }
    }

    /** Runs [action] once the app may write to Downloads: always from
     *  Android 10, after the user's yes to the storage permission before.
     *  Main thread. */
    private fun withStorage(action: () -> Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(activity, Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            action()
            return
        }
        waitingForStorage += action
        if (waitingForStorage.size == 1) storagePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
    }

    /** Writes a file into Downloads from any thread, and says how it went. */
    private fun writeToDownloads(filename: String, mimeType: String, write: (OutputStream) -> Unit) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                writeToCollection(filename, mimeType, write)
            } else {
                writeToFolder(filename, mimeType, write)
            }
            activity.runOnUiThread {
                Toast.makeText(activity, activity.getString(R.string.download_complete, filename), Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            android.util.Log.e("GlassKeep", "download not saved", e)
            failed()
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun writeToCollection(filename: String, mimeType: String, write: (OutputStream) -> Unit) {
        val resolver = activity.contentResolver
        val uri = resolver.insert(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, filename)
                put(MediaStore.Downloads.MIME_TYPE, mimeType)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            },
        ) ?: throw IOException("no Downloads entry")
        resolver.openOutputStream(uri)?.use(write) ?: throw IOException("Downloads entry not writable")
        resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
    }

    /** The Downloads folder itself, before Android 10 and its collection.
     *  A name already taken gets a number, as the collection does. */
    @Suppress("DEPRECATION")
    private fun writeToFolder(filename: String, mimeType: String, write: (OutputStream) -> Unit) {
        val folder = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (!folder.isDirectory && !folder.mkdirs()) throw IOException("no Downloads folder")
        val stem = filename.substringBeforeLast('.')
        val extension = filename.substringAfterLast('.', "").let { if (it.isEmpty()) "" else ".$it" }
        val file = generateSequence(1) { it + 1 }
            .map { n -> File(folder, if (n == 1) filename else "$stem ($n)$extension") }
            .first { !it.exists() }
        FileOutputStream(file).use(write)
        MediaScannerConnection.scanFile(activity, arrayOf(file.path), arrayOf(mimeType), null)
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
