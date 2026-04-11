package com.glasskeep.app

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
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
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsControllerCompat

class WebViewActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
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

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* handled */ }

    /** Called from JavaScript when <meta name="theme-color"> changes */
    inner class ThemeBridge {
        @JavascriptInterface
        fun onThemeColor(hexColor: String) {
            runOnUiThread { applySystemBarColor(hexColor) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_webview)

        val url = intent.getStringExtra("url")
            ?: getSharedPreferences("glasskeep", MODE_PRIVATE).getString("server_url", null)
            ?: run { finish(); return }

        webView = findViewById(R.id.webview)

        // Service Worker support
        try {
            val swController = ServiceWorkerController.getInstance()
            swController.setServiceWorkerClient(object : ServiceWorkerClient() {
                override fun shouldInterceptRequest(
                    request: WebResourceRequest
                ): WebResourceResponse? = null
            })
        } catch (_: Exception) { }

        webView.apply {
            addJavascriptInterface(ThemeBridge(), "AndroidTheme")

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

                javaScriptCanOpenWindowsAutomatically = true
                setSupportMultipleWindows(false)
            }

            // Cookies
            CookieManager.getInstance().apply {
                setAcceptCookie(true)
                setAcceptThirdPartyCookies(webView, true)
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    val requestUrl = request.url.toString()
                    return if (requestUrl.startsWith(url)) {
                        false
                    } else {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                        true
                    }
                }

                override fun onPageFinished(view: WebView, pageUrl: String?) {
                    super.onPageFinished(view, pageUrl)
                    injectThemeColorObserver(view)
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
                            this@WebViewActivity, Manifest.permission.CAMERA
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }

                    fileChooserLauncher.launch(params.createIntent())
                    return true
                }
            }

            // Downloads
            setDownloadListener { downloadUrl, userAgent, contentDisposition, mimeType, _ ->
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
                    getSystemService(DownloadManager::class.java).enqueue(req)
                    Toast.makeText(this@WebViewActivity, "Telechargement lance...", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {
                    Toast.makeText(this@WebViewActivity, "Erreur de telechargement", Toast.LENGTH_SHORT).show()
                }
            }

            loadUrl(url)
        }
    }

    private fun injectThemeColorObserver(view: WebView) {
        // Read current color + set up observer for changes (dark mode toggle)
        val js = "(function(){" +
            "function send(){var m=document.querySelector('meta[name=\"theme-color\"]');if(m&&m.content)AndroidTheme.onThemeColor(m.content);}" +
            "send();" +
            "if(!window.__tcObs){" +
            "window.__tcObs=new MutationObserver(function(muts){" +
            "for(var i=0;i<muts.length;i++){" +
            "var added=muts[i].addedNodes;" +
            "for(var j=0;j<added.length;j++){" +
            "if(added[j].nodeName==='META'&&added[j].name==='theme-color'){send();return;}" +
            "}" +
            "}" +
            "});" +
            "window.__tcObs.observe(document.head,{childList:true});" +
            "}" +
            "})()"
        view.evaluateJavascript(js, null)
    }

    private fun applySystemBarColor(hexColor: String) {
        try {
            val color = Color.parseColor(hexColor)
            window.statusBarColor = color
            window.navigationBarColor = color

            val luminance = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255
            val isLight = luminance > 0.5

            val controller = WindowInsetsControllerCompat(window, window.decorView)
            controller.isAppearanceLightStatusBars = isLight
            controller.isAppearanceLightNavigationBars = isLight
        } catch (_: Exception) { }
    }

    private var backPressCount = 0
    private val backResetHandler = Handler(Looper.getMainLooper())

    @Deprecated("Use OnBackPressedCallback")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
            return
        }

        backPressCount++
        if (backPressCount == 1) {
            Toast.makeText(this, "Appuyez encore pour changer de serveur", Toast.LENGTH_SHORT).show()
            backResetHandler.postDelayed({ backPressCount = 0 }, 2000)
        } else {
            backResetHandler.removeCallbacksAndMessages(null)
            backPressCount = 0
            showChangeServerDialog()
        }
    }

    private fun showChangeServerDialog() {
        AlertDialog.Builder(this)
            .setTitle("Changer de serveur")
            .setMessage("Revenir a l'ecran de configuration ?")
            .setPositiveButton("Oui") { _, _ ->
                getSharedPreferences("glasskeep", MODE_PRIVATE)
                    .edit().remove("server_url").apply()
                val intent = Intent(this, MainActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()
            }
            .setNegativeButton("Non", null)
            .show()
    }
}
