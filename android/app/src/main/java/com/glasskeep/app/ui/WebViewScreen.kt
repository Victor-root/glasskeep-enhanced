package com.glasskeep.app.ui

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Environment
import android.util.Base64
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat

private fun buildCssFixesJs(): String {
    // CSS fixes for WebView compatibility issues
    val css = """
        *,*::before,*::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
        .glass-card{background:rgba(255,255,255,0.92)!important}
        html.dark .glass-card{background:rgba(40,40,40,0.92)!important}
        .modal-scrim{background:rgba(0,0,0,0.5)!important}
        .modal-header-blur{background:rgba(255,255,255,0.95)!important}
        html.dark .modal-header-blur{background:rgba(40,40,40,0.95)!important}
        .login-deco-card{background:rgba(255,255,255,0.55)!important}
        html.dark .login-deco-card{background:rgba(30,30,40,0.65)!important}
        .fmt-pop{background:rgba(255,255,255,0.97)!important}
        html.dark .fmt-pop{background:rgba(40,40,40,0.97)!important}
        .note-card{content-visibility:visible!important;contain:none!important}
        .note-modal-anim{height:100vh!important;max-height:100vh!important}
    """.trimIndent()

    // Base64-encode CSS to avoid all JS string escaping issues
    val encoded = Base64.encodeToString(css.toByteArray(), Base64.NO_WRAP)

    return "javascript:void((function(){" +
        "if(document.getElementById('wv-fix'))return;" +
        "var s=document.createElement('style');" +
        "s.id='wv-fix';" +
        "s.textContent=atob('$encoded');" +
        "document.head.appendChild(s);" +
        "})())"
}

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

    val cssFixesJs = remember { buildCssFixesJs() }

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
                setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)

                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    cacheMode = WebSettings.LOAD_DEFAULT
                    allowFileAccess = true
                    allowContentAccess = true
                    mediaPlaybackRequiresUserGesture = false
                    mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                    useWideViewPort = true
                    loadWithOverviewMode = false
                    textZoom = 100
                    builtInZoomControls = false
                    displayZoomControls = false

                    // Use Chrome user agent instead of WebView UA
                    val chromeUa = userAgentString
                        .replace("; wv", "")
                        .replace("Version/\\d+\\.\\d+\\s*".toRegex(), "")
                    userAgentString = chromeUa

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
                        return if (requestUrl.startsWith(url)) {
                            false
                        } else {
                            ctx.startActivity(
                                Intent(Intent.ACTION_VIEW, request.url)
                            )
                            true
                        }
                    }

                    override fun onPageFinished(view: WebView, pageUrl: String?) {
                        super.onPageFinished(view, pageUrl)
                        // Inject CSS fixes via Base64 (avoids JS escaping issues)
                        view.loadUrl(cssFixesJs)
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
