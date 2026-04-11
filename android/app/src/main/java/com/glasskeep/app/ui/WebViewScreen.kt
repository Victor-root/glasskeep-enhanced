package com.glasskeep.app.ui

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.ServiceWorkerClient
import android.webkit.ServiceWorkerController
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat

@Composable
fun WebViewScreen(url: String, onReset: () -> Unit) {
    val context = LocalContext.current
    var webView: WebView? = remember { null }
    var fileUploadCallback: ValueCallback<Array<Uri>>? = remember { null }

    val fileChooserLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = if (result.resultCode == Activity.RESULT_OK) {
            result.data?.let { intent ->
                intent.data?.let { arrayOf(it) }
                    ?: WebChromeClient.FileChooserParams.parseResult(result.resultCode, intent)
            }
        } else null
        fileUploadCallback?.onReceiveValue(data)
        fileUploadCallback = null
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { /* permission result handled, file chooser already open */ }

    BackHandler(enabled = webView?.canGoBack() == true) {
        webView?.goBack()
    }

    Scaffold { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            AndroidView(
                factory = { ctx ->
                    // Enable Service Worker support
                    try {
                        val swController = ServiceWorkerController.getInstance()
                        swController.setServiceWorkerClient(object : ServiceWorkerClient() {
                            override fun shouldInterceptRequest(
                                request: WebResourceRequest
                            ): WebResourceResponse? = null
                        })
                    } catch (_: Exception) { }

                    WebView(ctx).apply {
                        settings.apply {
                            javaScriptEnabled = true
                            domStorageEnabled = true
                            databaseEnabled = true
                            cacheMode = WebSettings.LOAD_DEFAULT
                            allowFileAccess = true
                            allowContentAccess = true
                            mediaPlaybackRequiresUserGesture = false
                            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

                            // PWA support
                            javaScriptCanOpenWindowsAutomatically = true
                            setSupportMultipleWindows(false)
                        }

                        // Enable cookies for auth
                        val cookieManager = CookieManager.getInstance()
                        cookieManager.setAcceptCookie(true)
                        cookieManager.setAcceptThirdPartyCookies(this, true)

                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView,
                                request: WebResourceRequest
                            ): Boolean {
                                val requestUrl = request.url.toString()
                                // Keep navigation within the app's server
                                return if (requestUrl.startsWith(url)) {
                                    false
                                } else {
                                    // External links open in browser
                                    ctx.startActivity(
                                        Intent(Intent.ACTION_VIEW, request.url)
                                    )
                                    true
                                }
                            }
                        }

                        webChromeClient = object : WebChromeClient() {
                            override fun onShowFileChooser(
                                webView: WebView,
                                callback: ValueCallback<Array<Uri>>,
                                params: FileChooserParams
                            ): Boolean {
                                fileUploadCallback?.onReceiveValue(null)
                                fileUploadCallback = callback

                                // Request camera permission if needed
                                if (ContextCompat.checkSelfPermission(
                                        ctx, Manifest.permission.CAMERA
                                    ) != PackageManager.PERMISSION_GRANTED
                                ) {
                                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                                }

                                val intent = params.createIntent()
                                fileChooserLauncher.launch(intent)
                                return true
                            }
                        }

                        // Download support
                        setDownloadListener(DownloadListener { downloadUrl, userAgent, contentDisposition, mimeType, _ ->
                            try {
                                val request = DownloadManager.Request(Uri.parse(downloadUrl)).apply {
                                    setMimeType(mimeType)
                                    addRequestHeader("Cookie", CookieManager.getInstance().getCookie(downloadUrl))
                                    addRequestHeader("User-Agent", userAgent)
                                    setTitle(URLUtil.guessFileName(downloadUrl, contentDisposition, mimeType))
                                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                                    setDestinationInExternalPublicDir(
                                        Environment.DIRECTORY_DOWNLOADS,
                                        URLUtil.guessFileName(downloadUrl, contentDisposition, mimeType)
                                    )
                                }
                                val dm = ctx.getSystemService(DownloadManager::class.java)
                                dm.enqueue(request)
                                Toast.makeText(ctx, "Telechargement lance...", Toast.LENGTH_SHORT).show()
                            } catch (e: Exception) {
                                Toast.makeText(ctx, "Erreur de telechargement", Toast.LENGTH_SHORT).show()
                            }
                        })

                        webView = this
                        loadUrl(url)
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}
