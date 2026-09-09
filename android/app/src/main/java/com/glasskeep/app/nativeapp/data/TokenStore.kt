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

    /** Cached "play a sound on a new notification" preference. Off by
     *  default like the web's own, so a fresh install never surprises
     *  anyone with a ding (App.jsx:391-402). */
    var notificationsSound: Boolean
        get() = prefs.getBoolean(KEY_NOTIF_SOUND, false)
        set(value) {
            prefs.edit().putBoolean(KEY_NOTIF_SOUND, value).apply()
        }

    /** The two per-category maps, as the same JSON the server stores. */
    var notificationsSoundTypesJson: String?
        get() = prefs.getString(KEY_NOTIF_SOUND_TYPES, null)
        set(value) {
            prefs.edit().putString(KEY_NOTIF_SOUND_TYPES, value).apply()
        }

    var notificationsFilterTypesJson: String?
        get() = prefs.getString(KEY_NOTIF_FILTER_TYPES, null)
        set(value) {
            prefs.edit().putString(KEY_NOTIF_FILTER_TYPES, value).apply()
        }

    /** Cached checklist preferences: where a new item goes ("top"/"bottom",
     *  top by default) and what happens to a removed section's items
     *  ("cascade" drops them with it, "keep" moves them back to the top
     *  block; cascade by default, App.jsx:324-331). */
    var checklistInsertPosition: String?
        get() = prefs.getString(KEY_CHECKLIST_INSERT, null)
        set(value) {
            prefs.edit().putString(KEY_CHECKLIST_INSERT, value).apply()
        }

    var checklistRemoveSectionBehavior: String?
        get() = prefs.getString(KEY_CHECKLIST_REMOVE_SECTION, null)
        set(value) {
            prefs.edit().putString(KEY_CHECKLIST_REMOVE_SECTION, value).apply()
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

    /** Cached "one note per row" preference. Grid by default, same as the
     *  web's own localStorage["viewMode"] (App.jsx:1153-1155). */
    var listView: Boolean
        get() = prefs.getBoolean(KEY_LIST_VIEW, false)
        set(value) {
            prefs.edit().putBoolean(KEY_LIST_VIEW, value).apply()
        }

    /** Cached "the AI assistant is available to me" flag, off by default:
     *  most instances have no AI configured at all. */
    var aiAssistantEnabled: Boolean
        get() = prefs.getBoolean(KEY_AI_ASSISTANT, false)
        set(value) {
            prefs.edit().putBoolean(KEY_AI_ASSISTANT, value).apply()
        }

    /** The instance's own name, logo (a data URL) and sign-in theme, as an
     *  admin set them. Cached for the same first-frame reason as the rest:
     *  the sign-in screen must not flash the bundled defaults before the
     *  branding read comes back (see BrandingState). */
    var brandingAppName: String?
        get() = prefs.getString(KEY_BRANDING_APP_NAME, null)
        set(value) {
            prefs.edit().putString(KEY_BRANDING_APP_NAME, value).apply()
        }

    var brandingLogo: String?
        get() = prefs.getString(KEY_BRANDING_LOGO, null)
        set(value) {
            prefs.edit().putString(KEY_BRANDING_LOGO, value).apply()
        }

    var brandingLoginTheme: String?
        get() = prefs.getString(KEY_BRANDING_LOGIN_THEME, null)
        set(value) {
            prefs.edit().putString(KEY_BRANDING_LOGIN_THEME, value).apply()
        }

    /** Server switching must be durable before MainActivity is restarted. */
    fun clear(): Boolean {
        NativeDebug.d("TokenStore.clear")
        return prefs.edit().clear().commit()
    }

    /**
     * Signing out: drops the session and nothing else. The look of the app
     * (theme, editor and shell preferences) is a per-device cache the web
     * deliberately keeps too, "preserve UI prefs like dark mode"
     * (App.jsx:4607), and the server URL is what the login screen this
     * lands on talks to.
     */
    fun clearSession() {
        NativeDebug.d("TokenStore.clearSession")
        prefs.edit().remove(KEY_TOKEN).apply()
    }

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_TOKEN = "token"
        private const val KEY_THEME_ID = "theme_id"
        private const val KEY_TOOLBAR_MODE = "editor_toolbar_mode"
        private const val KEY_TYPOGRAPHY = "typography_presets"
        private const val KEY_TASK_STRIKE = "task_strike_checked"
        private const val KEY_READ_MODE = "read_mode_enabled"
        private const val KEY_LIST_VIEW = "list_view"
        private const val KEY_AI_ASSISTANT = "ai_assistant_enabled"
        private const val KEY_EDGE_TO_EDGE_LANDSCAPE = "edge_to_edge_landscape"
        private const val KEY_FLOATING_CARDS = "floating_cards_enabled"
        private const val KEY_CHECKLIST_INSERT = "checklist_insert_position"
        private const val KEY_CHECKLIST_REMOVE_SECTION = "checklist_remove_section"
        private const val KEY_NOTIF_SOUND = "notifications_sound"
        private const val KEY_NOTIF_SOUND_TYPES = "notifications_sound_types"
        private const val KEY_NOTIF_FILTER_TYPES = "notifications_filter_types"
        private const val KEY_TOAST_POSITION = "toast_position"
        private const val KEY_TOAST_DURATION = "toast_duration_ms"
        private const val KEY_BRANDING_APP_NAME = "branding_app_name"
        private const val KEY_BRANDING_LOGO = "branding_logo"
        private const val KEY_BRANDING_LOGIN_THEME = "branding_login_theme"

        /** notificationsDuration's own default (App.jsx:478-487). */
        const val DEFAULT_TOAST_DURATION_MS = 10_000L
    }
}
