package com.glasskeep.app.nativeapp

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import com.glasskeep.app.nativeapp.ui.NativeNavHost
import com.glasskeep.app.ui.applyThemedSystemBars
import com.glasskeep.app.ui.theme.GlassKeepTheme

/**
 * Entry point for the native (0-webview) rewrite. Reached only from debug
 * builds for now (see MainActivity.launchApp): this is where every native
 * screen will live as they get built one feature at a time, while
 * WebViewActivity keeps serving the real app in release builds until the
 * native side reaches parity.
 */
class NativeAppActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val serverUrl = intent.getStringExtra(EXTRA_SERVER_URL)
            ?: error("NativeAppActivity started without EXTRA_SERVER_URL")
        NativeDebug.d("NativeAppActivity.onCreate serverUrl=$serverUrl")

        val container = NativeAppContainer(applicationContext)

        setContent {
            val dark = isSystemInDarkTheme()
            val view = LocalView.current
            // Same status/nav bar treatment as MainActivity's onboarding
            // (same two colors as SetupScreen's own light/dark background),
            // so the system bars never clash with the native screens below.
            SideEffect {
                (view.context as Activity).applyThemedSystemBars(view, dark)
            }
            GlassKeepTheme {
                NativeNavHost(container = container, serverUrl = serverUrl)
            }
        }
    }

    companion object {
        const val EXTRA_SERVER_URL = "server_url"
    }
}
