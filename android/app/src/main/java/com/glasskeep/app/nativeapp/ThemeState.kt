package com.glasskeep.app.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.glasskeep.app.nativeapp.data.TokenStore
import com.glasskeep.app.nativeapp.ui.WorkspaceTheme

/**
 * The current workspace theme, live for as long as this container's
 * Activity is running. Mirrors the web's own two-tier design
 * (src/theme/shellTheme.js): [themeId] starts from TokenStore's cached
 * copy (this app's equivalent of the web's localStorage["gk:shellTheme"])
 * so the right chrome is live from the very first frame; NativeNavHost
 * then fetches the server's own copy (the source of truth) and calls
 * [apply] if it differs, same as the web re-applying once the server
 * value lands on a fresh device where the cache was empty.
 */
class ThemeState(private val tokenStore: TokenStore) {
    var themeId: String by mutableStateOf(WorkspaceTheme.forId(tokenStore.themeId).id)
        private set

    /** Applies a theme picked in Settings, or one just confirmed from the
     *  server: updates every screen reading [themeId] immediately, and
     *  refreshes the cache for the next cold start. */
    fun apply(id: String) {
        val resolved = WorkspaceTheme.forId(id).id
        themeId = resolved
        tokenStore.themeId = resolved
    }
}
