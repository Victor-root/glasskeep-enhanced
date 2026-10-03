package com.glasskeep.app.nativeapp.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * The encrypted file behind [TokenStore], opened once per process. Opening
 * it reaches the Android Keystore and sets up the cipher, which is slow on a
 * cold start, so StartupWarmUp opens it in the background while the first
 * screen is still being built, and every [TokenStore] after it shares the
 * result. A failed open is not remembered: the next caller tries again.
 */
internal object SessionPrefs {
    private const val FILE = "glasskeep_native_session"

    @Volatile private var instance: SharedPreferences? = null

    fun get(context: Context): SharedPreferences =
        instance ?: synchronized(this) {
            instance ?: open(context.applicationContext).also { instance = it }
        }

    private fun open(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context,
            FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }
}
