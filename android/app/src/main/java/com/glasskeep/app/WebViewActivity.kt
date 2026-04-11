package com.glasskeep.app

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
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
import androidx.core.view.WindowCompat
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
                    readThemeColor(view)
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

        // Watch for theme-color changes (dark mode toggle)
        setupThemeColorObserver()
    }

    private fun readThemeColor(view: WebView) {
        view.evaluateJavascript(
            "(function(){var m=document.querySelector('meta[name=theme-color]');return m?m.content:''})()"
        ) { result ->
            val color = result.trim('"')
            if (color.startsWith("#")) {
                applySystemBarColor(color)
            }
        }
    }

    private fun setupThemeColorObserver() {
        // MutationObserver on <head> to catch theme-color meta being removed/re-added
        val js = """javascript:void((function(){
            if(window.__themeObs)return;
            window.__themeObs=new MutationObserver(function(){
                var m=document.querySelector('meta[name=theme-color]');
                if(m&&m.content){
                    document.title='__themecolor__'+m.content;
                    setTimeout(function(){
                        var t=document.title;
                        if(t.indexOf('__themecolor__')===0)document.title=t.substring(t.indexOf('__'+'tc__end__'));
                    },100);
                }
            });
            window.__themeObs.observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['content']});
        })())"""
        webView.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(view: WebView, title: String?) {
                super.onReceivedTitle(view, title)
                if (title != null && title.startsWith("__themecolor__")) {
                    val color = title.removePrefix("__themecolor__")
                    if (color.startsWith("#")) {
                        applySystemBarColor(color)
                    }
                }
            }

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

        // Inject the observer after a short delay to ensure page is ready
        webView.postDelayed({ webView.loadUrl(js) }, 1500)
    }

    private fun applySystemBarColor(hexColor: String) {
        try {
            val color = Color.parseColor(hexColor)
            window.statusBarColor = color
            window.navigationBarColor = color

            // Dark icons on light backgrounds, light icons on dark backgrounds
            val luminance = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255
            val isLight = luminance > 0.5

            val controller = WindowInsetsControllerCompat(window, window.decorView)
            controller.isAppearanceLightStatusBars = isLight
            controller.isAppearanceLightNavigationBars = isLight
        } catch (_: Exception) { }
    }

    @Deprecated("Use OnBackPressedCallback")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }
}
