package com.glasskeep.app.nativeapp.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.glasskeep.app.nativeapp.NativeDebug

/**
 * Session storage for the native rewrite: server URL + JWT, encrypted at
 * rest via the Android Keystore. Deliberately separate from the WebView-era
 * "glasskeep" SharedPreferences (server_url, auth_token). The two apps
 * coexist during the migration and must not silently share or corrupt
 * each other's session.
 */
class TokenStore(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "glasskeep_native_session",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var serverUrl: String?
        get() = prefs.getString(KEY_SERVER_URL, null)
        set(value) {
            NativeDebug.d("TokenStore.serverUrl = ${value ?: "null"}")
            prefs.edit().putString(KEY_SERVER_URL, value).apply()
        }

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) {
            NativeDebug.d("TokenStore.token set, present=${value != null}")
            prefs.edit().putString(KEY_TOKEN, value).apply()
        }

    /** Cached workspace theme id (see WorkspaceTheme.kt), this app's
     *  equivalent of the web's own localStorage["gk:shellTheme"] cache
     *  (src/theme/shellTheme.js): read once at startup so the right
     *  chrome is live from the first frame, before the server's own
     *  copy (the source of truth) lands and, if different, wins. */
    var themeId: String?
        get() = prefs.getString(KEY_THEME_ID, null)
        set(value) {
            prefs.edit().putString(KEY_THEME_ID, value).apply()
        }

    /** Cached "simple"/"advanced" formatting-bar choice, same first-frame
     *  reason as [themeId]: the bar must not visibly change shape a second
     *  after the note opens. */
    var editorToolbarMode: String?
        get() = prefs.getString(KEY_TOOLBAR_MODE, null)
        set(value) {
            prefs.edit().putString(KEY_TOOLBAR_MODE, value).apply()
        }

    /** Cached typography presets, as the same JSON the server stores. */
    var typographyPresetsJson: String?
        get() = prefs.getString(KEY_TYPOGRAPHY, null)
        set(value) {
            prefs.edit().putString(KEY_TYPOGRAPHY, value).apply()
        }

    /** "Strike through checked items" in rich-text task lists. A per-device
     *  reading preference on the web too (localStorage["gk:taskStrikeChecked"],
     *  see theme/taskListStrike.js), never synced to the account. */
    var taskStrikeChecked: Boolean
        get() = prefs.getBoolean(KEY_TASK_STRIKE, false)
        set(value) {
            prefs.edit().putBoolean(KEY_TASK_STRIKE, value).apply()
        }

    /** Cached notification-pill placement ("top"/"bottom") and how long it
     *  stays, in milliseconds, or -1 for "until dismissed". Same
     *  first-frame reason as the two above: a message can be raised
     *  before the settings read comes back. */
    var toastPosition: String?
        get() = prefs.getString(KEY_TOAST_POSITION, null)
        set(value) {
            prefs.edit().putString(KEY_TOAST_POSITION, value).apply()
        }

    var toastDurationMs: Long
        get() = prefs.getLong(KEY_TOAST_DURATION, DEFAULT_TOAST_DURATION_MS)
        set(value) {
            prefs.edit().putLong(KEY_TOAST_DURATION, value).apply()
        }

    /** Cached "notes open in read mode" preference, on by default like
     *  the web's own. */
    var readModeEnabled: Boolean
        get() = prefs.getBoolean(KEY_READ_MODE, true)
        set(value) {
            prefs.edit().putBoolean(KEY_READ_MODE, value).apply()
        }

    /** Cached "let the content run under the left cutout in landscape"
     *  preference, on by default like the web's own (App.jsx:333-341). */
    var edgeToEdgeLandscape: Boolean
        get() = prefs.getBoolean(KEY_EDGE_TO_EDGE_LANDSCAPE, true)
        set(value) {
            prefs.edit().putBoolean(KEY_EDGE_TO_EDGE_LANDSCAPE, value).apply()
        }

    /** Cached "animated cards on the sign-in screen" preference. Off by
     *  default: the web's own default is `(pointer: fine)`, which is
     *  false on every phone (App.jsx:277-285). */
    var floatingCardsEnabled: Boolean
        get() = prefs.getBoolean(KEY_FLOATING_CARDS, false)
        set(value) {
            prefs.edit().putBoolean(KEY_FLOATING_CARDS, value).apply()
        }

    fun clear() {
        NativeDebug.d("TokenStore.clear")
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_TOKEN = "token"
        private const val KEY_THEME_ID = "theme_id"
        private const val KEY_TOOLBAR_MODE = "editor_toolbar_mode"
        private const val KEY_TYPOGRAPHY = "typography_presets"
        private const val KEY_TASK_STRIKE = "task_strike_checked"
        private const val KEY_READ_MODE = "read_mode_enabled"
        private const val KEY_EDGE_TO_EDGE_LANDSCAPE = "edge_to_edge_landscape"
        private const val KEY_FLOATING_CARDS = "floating_cards_enabled"
        private const val KEY_TOAST_POSITION = "toast_position"
        private const val KEY_TOAST_DURATION = "toast_duration_ms"

        /** notificationsDuration's own default (App.jsx:478-487). */
        const val DEFAULT_TOAST_DURATION_MS = 10_000L
    }
}
