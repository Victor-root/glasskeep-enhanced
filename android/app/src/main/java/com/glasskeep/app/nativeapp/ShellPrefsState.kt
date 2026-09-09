package com.glasskeep.app.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.glasskeep.app.nativeapp.data.TokenStore

/**
 * App-shell preferences: the two "Interface" switches the web keeps in
 * its own UI section (SettingsPanel.jsx:606-652). Same two-tier design as
 * [ThemeState] and [EditorPrefsState]: each value starts from TokenStore's
 * cached copy so the shell is right from the first frame, then
 * NativeNavHost reconciles it against the server's settings blob once per
 * session.
 */
class ShellPrefsState(private val tokenStore: TokenStore) {
    var edgeToEdgeLandscape: Boolean by mutableStateOf(tokenStore.edgeToEdgeLandscape)
        private set

    var floatingCards: Boolean by mutableStateOf(tokenStore.floatingCardsEnabled)
        private set

    var listView: Boolean by mutableStateOf(tokenStore.listView)
        private set

    /**
     * The light/dark choice made from the header menu, or null to follow
     * the system. Deliberately NOT cached: the web keeps this one in
     * sessionStorage (App.jsx:2240), so it lasts the session and the
     * device's own setting takes over again on the next launch.
     */
    var darkOverride: Boolean? by mutableStateOf(null)
        private set

    fun toggleDark(currentlyDark: Boolean) {
        darkOverride = !currentlyDark
    }

    fun applyListView(list: Boolean) {
        listView = list
        tokenStore.listView = list
    }

    fun applyEdgeToEdgeLandscape(enabled: Boolean) {
        edgeToEdgeLandscape = enabled
        tokenStore.edgeToEdgeLandscape = enabled
    }

    fun applyFloatingCards(enabled: Boolean) {
        floatingCards = enabled
        tokenStore.floatingCardsEnabled = enabled
    }
}
