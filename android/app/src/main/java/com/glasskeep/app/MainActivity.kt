package com.glasskeep.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import com.glasskeep.app.nativeapp.NativeAppActivity
import com.glasskeep.app.net.CleartextPolicy
import com.glasskeep.app.ui.OnboardingPager
import com.glasskeep.app.ui.applyThemedSystemBars
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

        // Fast path: onboarding done AND URL configured, straight into
        // the app. A launcher shortcut (long-press the icon: "Scan QR",
        // or a new text / checklist / audio note) rides along as an
        // Intent extra, see launchApp.
        if (welcomeDone && savedUrl != null) {
            launchApp(savedUrl)
            return
        }

        setContent {
            val dark = isSystemInDarkTheme()
            val view = LocalView.current
            SideEffect {
                (view.context as ComponentActivity).applyThemedSystemBars(dark)
            }
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
                        launchApp(url)
                    },
                )
            }
        }
    }

    // Every build boots the native app now (com.glasskeep.app.nativeapp);
    // WebViewActivity is no longer an entry point at all.
    //
    // A launcher shortcut travels as its own Intent extra rather than as
    // the boot-URL query parameter the WebView era used, since nothing
    // boots a URL any more. Same mechanism EXTRA_OPEN_NOTE_ID already
    // uses for a reminder notification tap.
    private fun launchApp(url: String) {
        val target = Intent(this, NativeAppActivity::class.java)
        target.putExtra(NativeAppActivity.EXTRA_SERVER_URL, url)
        val action = intent?.action
        if (action == SHORTCUT_ACTION_QR_SCAN) {
            target.putExtra(NativeAppActivity.EXTRA_OPEN_QR_SCANNER, true)
        } else {
            SHORTCUT_NOTE_TYPES[action]?.let {
                target.putExtra(NativeAppActivity.EXTRA_NEW_NOTE_TYPE, it)
            }
        }
        startActivity(target)
        finish()
    }

    companion object {
        // SharedPreferences key marking the one-time permissions
        // onboarding as completed.
        private const val KEY_WELCOME_DONE = "welcome_done"

        // Set when the setup screen accepted an address after examining
        // where it actually points. The app's own "change server" clears
        // it along with the address itself (see AuthShell and the
        // Settings screen; WebViewActivity still does the same for the
        // one path that can still reach it).
        const val KEY_URL_VETTED = "server_url_vetted"

        // Action strings must match res/xml/shortcuts.xml. Each of the
        // three "new note" shortcuts names the type the notes screen
        // creates on arrival (see NativeNotesListScreen's own
        // pendingNewNoteType); the fourth, below, opens the QR scanner
        // instead and so has no type to carry.
        private val SHORTCUT_NOTE_TYPES = mapOf(
            "com.glasskeep.app.SHORTCUT_NEW_TEXT" to "text",
            "com.glasskeep.app.SHORTCUT_NEW_CHECKLIST" to "checklist",
            "com.glasskeep.app.SHORTCUT_NEW_AUDIO" to "audio",
        )

        private const val SHORTCUT_ACTION_QR_SCAN = "com.glasskeep.app.SHORTCUT_QR_SCAN"
    }
}
