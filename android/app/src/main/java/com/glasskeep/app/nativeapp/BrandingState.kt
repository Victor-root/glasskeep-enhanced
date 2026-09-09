package com.glasskeep.app.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.glasskeep.app.nativeapp.data.TokenStore
import com.glasskeep.app.nativeapp.data.network.BrandingDto

/**
 * The instance's own name, logo and sign-in theme, as an admin set them
 * (BrandingContext.jsx). Every value is optional: an instance that never
 * touched its branding renders exactly as the bundled defaults.
 *
 * Cached in TokenStore for the same reason the web caches its own copy in
 * localStorage: the sign-in screen must paint the right name and logo on
 * the very first frame rather than flashing the defaults until the read
 * comes back. The one field deliberately left uncached there, the login
 * background image, is not read here at all.
 */
class BrandingState(private val tokenStore: TokenStore) {
    /** Null (or blank) means the bundled wordmark. */
    var appName: String? by mutableStateOf(tokenStore.brandingAppName)
        private set

    /** A data URL, decoded the same way a note's icon is. */
    var logo: String? by mutableStateOf(tokenStore.brandingLogo)
        private set

    /** Which workspace theme the signed-out screens wear. */
    var loginThemeId: String? by mutableStateOf(tokenStore.brandingLoginTheme)
        private set

    fun apply(branding: BrandingDto) {
        appName = branding.appName.takeIf { it.isNotBlank() }
        logo = branding.logo?.takeIf { it.startsWith("data:") }
        loginThemeId = branding.loginTheme
        tokenStore.brandingAppName = appName
        tokenStore.brandingLogo = logo
        tokenStore.brandingLoginTheme = loginThemeId
    }
}
