package com.glasskeep.app

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

/**
 * The single sign-on provider's pages, in a WebView of their own.
 *
 * The provider is a third-party site picked by the owner of the account
 * being signed into. The main WebView exposes native bridges (passkeys,
 * file saving, reminders, …) to whatever page it shows, so the provider
 * must never load there. This WebView has no bridge at all.
 *
 * It shares the app's cookie store, which holds the cookie the server tied
 * the sign-in attempt to. When the provider sends the browser back to the
 * GlassKeep server, this screen closes without loading that address and
 * hands it to the main WebView, which finishes the sign-in as if it had
 * followed the redirect itself.
 */
class SsoActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_APP_HOST = "app_host"
        const val EXTRA_RETURN_URL = "return_url"
    }

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL)
        val appHost = intent.getStringExtra(EXTRA_APP_HOST)
        if (url == null || appHost == null) {
            finish()
            return
        }

        webView = WebView(this)
        setContentView(webView)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame || !isAppHost(request.url, appHost)) return false
                returnToApp(request.url)
                return true
            }

            // A navigation back to the server that slipped past the method
            // above (it is not consulted for every kind of navigation) is
            // still handed over before the app's own page can run here.
            override fun onPageStarted(view: WebView, pageUrl: String?, favicon: Bitmap?) {
                val target = pageUrl?.let { Uri.parse(it) } ?: return
                if (!isAppHost(target, appHost)) return
                view.stopLoading()
                returnToApp(target)
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null) webView.loadUrl(url) else webView.restoreState(savedInstanceState)
    }

    private fun isAppHost(target: Uri, appHost: String): Boolean =
        appHost.equals(target.host, ignoreCase = true)

    private fun returnToApp(target: Uri) {
        if (isFinishing) return
        setResult(RESULT_OK, Intent().putExtra(EXTRA_RETURN_URL, target.toString()))
        finish()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }
}
