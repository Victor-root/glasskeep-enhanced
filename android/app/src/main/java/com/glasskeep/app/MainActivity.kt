package com.glasskeep.app

import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowInsetsControllerCompat
import com.glasskeep.app.ui.SetupScreen
import com.glasskeep.app.ui.theme.GlassKeepTheme

class MainActivity : ComponentActivity() {

    private val prefs by lazy {
        getSharedPreferences("glasskeep", MODE_PRIVATE)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // If URL already configured, go straight to WebView
        val savedUrl = prefs.getString("server_url", null)
        if (savedUrl != null) {
            // App-shortcut entry point: long-press launcher → one of
            // five shortcuts ("Scan QR" / new text / checklist / draw
            // / audio). Each shortcut sends a distinct action; we map
            // it to a one-shot query parameter and append it to the
            // configured server URL. The SPA picks it up at boot, runs
            // the matching action (only if the user already has a
            // valid session), and strips the param from the URL so a
            // refresh doesn't loop the action indefinitely.
            val urlToLoad = SHORTCUT_QUERY_PARAMS[intent?.action]
                ?.let { (key, value) -> appendQueryParam(savedUrl, key, value) }
                ?: savedUrl
            launchWebView(urlToLoad)
            return
        }

        setContent {
            val dark = isSystemInDarkTheme()
            val view = LocalView.current
            SideEffect {
                val w = (view.context as Activity).window
                if (dark) {
                    val bgColor = Color.parseColor("#1a1a1a")
                    w.statusBarColor = bgColor
                    w.navigationBarColor = bgColor
                    WindowInsetsControllerCompat(w, view).apply {
                        isAppearanceLightStatusBars = false
                        isAppearanceLightNavigationBars = false
                    }
                } else {
                    val bgColor = Color.parseColor("#f0e8ff")
                    w.statusBarColor = bgColor
                    w.navigationBarColor = bgColor
                    WindowInsetsControllerCompat(w, view).apply {
                        isAppearanceLightStatusBars = true
                        isAppearanceLightNavigationBars = true
                    }
                }
            }
            GlassKeepTheme {
                SetupScreen(onConnect = { url ->
                    prefs.edit().putString("server_url", url).apply()
                    launchWebView(url)
                })
            }
        }
    }

    private fun launchWebView(url: String) {
        val intent = Intent(this, WebViewActivity::class.java)
        intent.putExtra("url", url)
        startActivity(intent)
        finish()
    }

    // Tack a query parameter onto a URL without dragging in a full URI
    // parser. Handles both "no existing query" and "already has ?foo"
    // cases. Values are URL-encoded so a future caller can pass
    // anything safely.
    private fun appendQueryParam(url: String, key: String, value: String): String {
        val sep = if (url.contains("?")) "&" else "?"
        val encodedKey = java.net.URLEncoder.encode(key, "UTF-8")
        val encodedValue = java.net.URLEncoder.encode(value, "UTF-8")
        return "$url$sep$encodedKey=$encodedValue"
    }

    companion object {
        // Action strings must match res/xml/shortcuts.xml. Each maps
        // to the (queryParamKey, queryParamValue) pair MainActivity
        // appends to the configured server URL — keep this table in
        // lockstep with the SPA's boot-time param dispatch in
        // src/App.jsx (search for `params.get("qr")` /
        // `params.get("new")`).
        private val SHORTCUT_QUERY_PARAMS = mapOf(
            "com.glasskeep.app.SHORTCUT_QR_SCAN"      to ("qr"  to "open"),
            "com.glasskeep.app.SHORTCUT_NEW_TEXT"     to ("new" to "text"),
            "com.glasskeep.app.SHORTCUT_NEW_CHECKLIST" to ("new" to "checklist"),
            "com.glasskeep.app.SHORTCUT_NEW_DRAW"     to ("new" to "draw"),
            "com.glasskeep.app.SHORTCUT_NEW_AUDIO"    to ("new" to "audio"),
        )
    }
}
