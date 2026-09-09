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
    }
}
