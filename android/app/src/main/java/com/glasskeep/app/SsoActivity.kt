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
 * GlassKeep server's callback, this screen closes without loading that
 * address and hands it to the main WebView, which finishes the sign-in as
 * if it had followed the redirect itself. Nothing else leaves this screen:
 * a provider on the server's own host (another port, another path) stays
 * here like any other.
 */
class SsoActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_CALLBACK_URL = "callback_url"
        const val EXTRA_RETURN_URL = "return_url"
        const val CALLBACK_PATH = "/api/auth/oidc/callback"

        /** Same scheme, host and port. A provider may share the server's
         *  host on another port (a LAN install, typically): only the full
         *  origin tells them apart. */
        fun sameOrigin(a: Uri, b: Uri): Boolean =
            a.host != null &&
                a.scheme.equals(b.scheme, ignoreCase = true) &&
                a.host.equals(b.host, ignoreCase = true) &&
                effectivePort(a) == effectivePort(b)

        /** True when [target] is the server's OIDC callback on [app]'s origin. */
        fun isCallback(target: Uri, app: Uri): Boolean =
            sameOrigin(target, app) && target.path == CALLBACK_PATH

        private fun effectivePort(u: Uri): Int = when {
            u.port != -1 -> u.port
            u.scheme.equals("https", ignoreCase = true) -> 443
            u.scheme.equals("http", ignoreCase = true) -> 80
            else -> -1
        }
    }

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL)
        val callback = intent.getStringExtra(EXTRA_CALLBACK_URL)?.let { Uri.parse(it) }
        if (url == null || callback == null) {
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
                if (!request.isForMainFrame || !isCallback(request.url, callback)) return false
                returnToApp(request.url)
                return true
            }

            // A navigation back to the callback that slipped past the method
            // above (it is not consulted for every kind of navigation) is
            // still handed over before the server's answer can load here.
            override fun onPageStarted(view: WebView, pageUrl: String?, favicon: Bitmap?) {
                val target = pageUrl?.let { Uri.parse(it) } ?: return
                if (!isCallback(target, callback)) return
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
