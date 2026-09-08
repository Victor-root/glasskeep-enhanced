package com.glasskeep.app.nativeapp

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
    // Deep-link target when launched from a reminder notification (see
    // ReminderNotifier.buildOpenNoteIntent), same role as WebViewActivity's
    // own pendingOpenNoteId. Compose State, not a plain var: singleTask
    // (see AndroidManifest.xml) means onNewIntent can update it while this
    // same Activity instance is already showing a screen, and NativeNavHost
    // needs to react to that.
    private var pendingOpenNoteId by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val serverUrl = intent.getStringExtra(EXTRA_SERVER_URL)
            ?: error("NativeAppActivity started without EXTRA_SERVER_URL")
        NativeDebug.d("NativeAppActivity.onCreate serverUrl=$serverUrl")
        pendingOpenNoteId = intent.getStringExtra(EXTRA_OPEN_NOTE_ID)

        val container = NativeAppContainer(applicationContext)

        setContent {
            val dark = isSystemInDarkTheme()
            val view = LocalView.current
            // Same status/nav bar treatment as MainActivity's onboarding
            // (same two colors as SetupScreen's own light/dark background),
            // so the system bars never clash with the native screens below.
            SideEffect {
                (view.context as ComponentActivity).applyThemedSystemBars(dark)
            }
            GlassKeepTheme {
                NativeNavHost(
                    container = container,
                    serverUrl = serverUrl,
                    pendingOpenNoteId = pendingOpenNoteId,
                    onPendingOpenNoteIdConsumed = { pendingOpenNoteId = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // singleTask: a reminder tap on the already-running app lands here
        // instead of a cold onCreate. Same adopt-and-deep-link shape as
        // WebViewActivity's own onNewIntent.
        setIntent(intent)
        intent.getStringExtra(EXTRA_OPEN_NOTE_ID)?.let { pendingOpenNoteId = it }
    }

    companion object {
        const val EXTRA_SERVER_URL = "server_url"
        const val EXTRA_OPEN_NOTE_ID = "openNoteId"
    }
}
