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

/**
 * Files the page downloads. A server URL goes through the system
 * DownloadManager; a blob: URL is read by the page itself and comes back
 * through [saveBlobFile] (window.AndroidTheme.saveBlobFile), written to
 * the Downloads collection.
 */
class WebDownloads(private val activity: Activity) {

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
            try {
                val req = DownloadManager.Request(Uri.parse(downloadUrl)).apply {
                    setMimeType(mimeType)
                    addRequestHeader("Cookie", CookieManager.getInstance().getCookie(downloadUrl))
                    addRequestHeader("User-Agent", userAgent)
                    val filename = URLUtil.guessFileName(downloadUrl, contentDisposition, mimeType)
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
    }

    fun saveBlobFile(base64Data: String, filename: String, mimeType: String) {
        try {
            val bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
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
                activity.runOnUiThread {
                    Toast.makeText(activity, activity.getString(R.string.download_error), Toast.LENGTH_SHORT).show()
                }
                return
            }
            activity.contentResolver.openOutputStream(uri)?.use { out -> out.write(bytes) }
            val updateValues = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
            }
            activity.contentResolver.update(uri, updateValues, null, null)
            activity.runOnUiThread {
                Toast.makeText(activity, activity.getString(R.string.download_complete, filename), Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            android.util.Log.e("GlassKeep", "saveBlobFile failed", e)
            activity.runOnUiThread {
                Toast.makeText(activity, activity.getString(R.string.download_error), Toast.LENGTH_SHORT).show()
            }
        }
    }
}
