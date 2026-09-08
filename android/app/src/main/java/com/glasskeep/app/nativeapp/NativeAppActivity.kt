package com.glasskeep.app.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.glasskeep.app.nativeapp.ui.NativeNavHost
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
            GlassKeepTheme {
                NativeNavHost(container = container, serverUrl = serverUrl)
            }
        }
    }

    companion object {
        const val EXTRA_SERVER_URL = "server_url"
    }
}
