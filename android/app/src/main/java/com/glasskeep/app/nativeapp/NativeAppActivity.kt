package com.glasskeep.app.nativeapp

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.graphics.ColorUtils
import com.glasskeep.app.nativeapp.ui.LocalGkDark
import com.glasskeep.app.nativeapp.ui.NativeNavHost
import com.glasskeep.app.nativeapp.ui.WorkspaceTheme
import com.glasskeep.app.ui.applyThemedSystemBars
import com.glasskeep.app.ui.theme.GlassKeepTheme

/**
 * Entry point for the native app: every screen in
 * com.glasskeep.app.nativeapp hangs off the nav graph this hosts.
 */
class NativeAppActivity : ComponentActivity() {
    // Deep-link target when launched from a reminder notification (see
    // ReminderNotifier.buildOpenNoteIntent). Compose State, not a plain var: singleTask
    // (see AndroidManifest.xml) means onNewIntent can update it while this
    // same Activity instance is already showing a screen, and NativeNavHost
    // needs to react to that.
    private var pendingOpenNoteId by mutableStateOf<String?>(null)

    // Same role, for the launcher's "Scan PC login" shortcut (see
    // MainActivity.launchNativeApp): unlike a note id there's no content
    // to identify, so this is just a one-shot flag.
    private var pendingOpenQrScanner by mutableStateOf(false)

    // And for the launcher's three "new note" shortcuts, which name the
    // type to create ("text", "checklist", "audio").
    private var pendingNewNoteType by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val serverUrl = intent.getStringExtra(EXTRA_SERVER_URL)
            ?: error("NativeAppActivity started without EXTRA_SERVER_URL")
        NativeDebug.d("NativeAppActivity.onCreate serverUrl=$serverUrl")
        pendingOpenNoteId = intent.getStringExtra(EXTRA_OPEN_NOTE_ID)
        pendingOpenQrScanner = intent.getBooleanExtra(EXTRA_OPEN_QR_SCANNER, false)
        pendingNewNoteType = intent.getStringExtra(EXTRA_NEW_NOTE_TYPE)

        val container = NativeAppContainer(applicationContext)

        setContent {
            // The device setting, unless the header menu's light/dark entry
            // overrode it for this session (the web's own toggleDark, which
            // likewise only lasts the session, App.jsx:2240).
            val dark = container.shellPrefs.darkOverride ?: isSystemInDarkTheme()
            val view = LocalView.current
            // Signed-in only: the login screen keeps the same fixed pair
            // onboarding uses (the web's own theme system explicitly never
            // recolors its login page either, see WorkspaceTheme.kt). Reads
            // themeState.themeId (real Compose state) so picking a new
            // theme in Settings retints the bar immediately; reads
            // tokenStore.token directly (not state) so a first-ever login
            // within this same Activity instance can lag one theme change
            // behind before catching up, a narrow, cosmetic-only gap.
            val themeId = container.themeState.themeId
            val signedIn = container.tokenStore.token != null

            // Handles dark/theme/signed-in changes: this SideEffect reruns
            // whenever this scope itself recomposes for one of those (as
            // before). It does NOT reliably react to container.scrimActive
            // changing on its own - that's written from a screen further
            // down the tree (the FAB's dimming overlay), which doesn't by
            // itself cause this scope to recompose. See the snapshotFlow
            // below for that case.
            SideEffect {
                val baseColor = if (signedIn) WorkspaceTheme.statusBarColor(themeId, dark).toArgb() else null
                (view.context as ComponentActivity).applyThemedSystemBars(dark, baseColor)
            }

            // Dedicated, guaranteed-reactive path for the scrim: a coroutine
            // subscribed directly to container.scrimActive's own writes via
            // snapshotFlow, independent of whether the composable scope
            // above happens to recompose for some other reason.
            val currentDark = rememberUpdatedState(dark)
            val currentThemeId = rememberUpdatedState(themeId)
            val currentSignedIn = rememberUpdatedState(signedIn)
            LaunchedEffect(view) {
                snapshotFlow { container.scrimActive.value }.collect { scrimActive ->
                    val baseColor = if (currentSignedIn.value) {
                        WorkspaceTheme.statusBarColor(currentThemeId.value, currentDark.value).toArgb()
                    } else {
                        null
                    }
                    val overrideColor = if (scrimActive) {
                        baseColor?.let { ColorUtils.blendARGB(it, android.graphics.Color.BLACK, 0.3f) }
                    } else {
                        baseColor
                    }
                    NativeDebug.d(
                        "NativeAppActivity system bars: dark=${currentDark.value} signedIn=${currentSignedIn.value} scrimActive=$scrimActive " +
                            "baseColor=${baseColor?.let { "#%08X".format(it) }} overrideColor=${overrideColor?.let { "#%08X".format(it) }}",
                    )
                    (view.context as ComponentActivity).applyThemedSystemBars(currentDark.value, overrideColor)
                }
            }
            GlassKeepTheme {
                CompositionLocalProvider(LocalGkDark provides dark) {
                    NativeNavHost(
                        container = container,
                        serverUrl = serverUrl,
                        pendingOpenNoteId = pendingOpenNoteId,
                        onPendingOpenNoteIdConsumed = { pendingOpenNoteId = null },
                        pendingOpenQrScanner = pendingOpenQrScanner,
                        onPendingOpenQrScannerConsumed = { pendingOpenQrScanner = false },
                        pendingNewNoteType = pendingNewNoteType,
                        onPendingNewNoteTypeConsumed = { pendingNewNoteType = null },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // singleTask: a reminder tap on the already-running app lands here
        // instead of a cold onCreate.
        setIntent(intent)
        intent.getStringExtra(EXTRA_OPEN_NOTE_ID)?.let { pendingOpenNoteId = it }
        if (intent.getBooleanExtra(EXTRA_OPEN_QR_SCANNER, false)) pendingOpenQrScanner = true
        intent.getStringExtra(EXTRA_NEW_NOTE_TYPE)?.let { pendingNewNoteType = it }
    }

    override fun onResume() {
        super.onResume()
        isForeground = true
    }

    override fun onPause() {
        super.onPause()
        isForeground = false
    }

    companion object {
        /** Read by ReminderAlarmReceiver, which may run on another thread. */
        @Volatile
        var isForeground: Boolean = false
            private set

        const val EXTRA_SERVER_URL = "server_url"
        const val EXTRA_OPEN_NOTE_ID = "openNoteId"
        const val EXTRA_OPEN_QR_SCANNER = "openQrScanner"
        const val EXTRA_NEW_NOTE_TYPE = "newNoteType"
    }
}
