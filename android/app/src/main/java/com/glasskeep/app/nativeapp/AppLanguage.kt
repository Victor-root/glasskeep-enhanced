package com.glasskeep.app.nativeapp

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

/**
 * The account's chosen interface language, applied to this app's own UI.
 *
 * The web reads the same `language` field off the profile and switches its
 * i18n bundle; here the equivalent is Android's per-app locale, so the
 * whole resource system (strings, date formats, layout direction) follows
 * along instead of only the strings this app happens to look up itself.
 *
 * [apply] is the only entry point: it is a no-op when nothing changes, so
 * it is safe to call on every profile fetch. Changing the locale restarts
 * the Activity, which is exactly what has to happen for a screen already
 * on display to be re-read in the new language.
 */
object AppLanguage {
    /** The languages the server offers (see SettingsScreen's own picker):
     *  anything else, including null, means "follow the system". */
    private val Supported = setOf("en", "fr")

    fun apply(language: String?) {
        val tag = language?.takeIf { it in Supported }
        val current = AppCompatDelegate.getApplicationLocales()
        val currentTag = current.toLanguageTags().substringBefore('-').takeIf { it.isNotEmpty() }
        if (tag == currentTag) return
        NativeDebug.d("AppLanguage.apply ${currentTag ?: "system"} -> ${tag ?: "system"}")
        AppCompatDelegate.setApplicationLocales(
            if (tag == null) LocaleListCompat.getEmptyLocaleList() else LocaleListCompat.forLanguageTags(tag),
        )
    }
}
