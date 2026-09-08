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

    fun clear() {
        NativeDebug.d("TokenStore.clear")
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_TOKEN = "token"
    }
}
