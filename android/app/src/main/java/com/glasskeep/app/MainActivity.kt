package com.glasskeep.app

import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.glasskeep.app.net.CleartextPolicy
import com.glasskeep.app.ui.OnboardingPager
import com.glasskeep.app.ui.theme.GlassKeepTheme

class MainActivity : ComponentActivity() {

    private val prefs by lazy {
        getSharedPreferences("glasskeep", MODE_PRIVATE)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val storedUrl = prefs.getString("server_url", null)
        // Treat already-configured installs as having completed the
        // permissions onboarding — existing users updating from 1.2.x
        // shouldn't suddenly see the welcome flow.
        val welcomeDone = prefs.getBoolean(KEY_WELCOME_DONE, storedUrl != null)

        // A stored address that sends everything in the clear across the
        // internet does not get used again, whatever it was allowed to do
        // in an earlier version. Dropping the user back on the setup
        // screen is the whole remedy: the address is re-examined there,
        // properly, with a lookup this startup path cannot afford.
        val savedUrl = storedUrl?.takeIf {
            CleartextPolicy.isUsableAtStartup(it, prefs.getBoolean(KEY_URL_VETTED, false))
        }

        // Fast path: onboarding done AND URL configured → straight to
        // the WebView, same as the previous behaviour.
        if (welcomeDone && savedUrl != null) {
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

        // The window draws behind transparent system bars, which show the
        // screen's background colour; the content keeps clear of them, of
        // the display cutout and of the keyboard (adjustResize).
        drawBehindSystemBars(
            (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
                Configuration.UI_MODE_NIGHT_YES
        )
        setContent {
            val dark = isSystemInDarkTheme()
            // The theme can change without the activity restarting (uiMode
            // is in its configChanges): the bar icons follow it.
            SideEffect { drawBehindSystemBars(dark) }
            Box(
                Modifier
                    .fillMaxSize()
                    .background(if (dark) Color(0xFF1A1A1A) else Color(0xFFF0E8FF))
                    .windowInsetsPadding(WindowInsets.safeDrawing)
            ) {
                GlassKeepTheme {
                    // Both screens live inside one HorizontalPager so the
                    // transition between them is a smooth swipe instead
                    // of a hard cut. Users who already saw the welcome
                    // (existing 1.2.x installs) land on page 2 directly.
                    OnboardingPager(
                        startAtSetup = welcomeDone,
                        initialUrl = storedUrl.orEmpty(),
                        onWelcomeCompleted = {
                            prefs.edit().putBoolean(KEY_WELCOME_DONE, true).apply()
                        },
                        onConnect = { url ->
                            // The setup screen only hands back an address it
                            // has examined, lookup included. Recording that
                            // is what keeps the startup gate from sending a
                            // legitimate local name back here every time.
                            prefs.edit()
                                .putString("server_url", url)
                                .putBoolean(KEY_URL_VETTED, true)
                                .apply()
                            launchWebView(url)
                        },
                    )
                }
            }
        }
    }

    /** Transparent system bars over the window, light or dark icons. */
    private fun drawBehindSystemBars(dark: Boolean) {
        val style = if (dark) {
            SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
        } else {
            SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
        }
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
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
        // SharedPreferences key marking the one-time permissions
        // onboarding as completed.
        private const val KEY_WELCOME_DONE = "welcome_done"

        // Set when the setup screen accepted an address after examining
        // where it actually points. WebViewActivity clears it along with
        // the address itself when the user switches server.
        const val KEY_URL_VETTED = "server_url_vetted"

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
            "com.glasskeep.app.SHORTCUT_NEW_AUDIO"    to ("new" to "audio"),
        )
    }
}
