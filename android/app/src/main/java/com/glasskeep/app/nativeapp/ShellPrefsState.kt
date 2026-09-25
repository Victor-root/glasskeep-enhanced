package com.glasskeep.app.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.glasskeep.app.nativeapp.data.TokenStore

/**
 * App-shell preferences: the switches the web keeps in its own UI section
 * (SettingsPanel.jsx:511-652). Same two-tier design as [ThemeState] and
 * [EditorPrefsState]: each value starts from TokenStore's cached copy so
 * the shell is right from the first frame, then NativeNavHost reconciles
 * it against the server's settings blob once per session.
 */
class ShellPrefsState(private val tokenStore: TokenStore) {
    var edgeToEdgeLandscape: Boolean by mutableStateOf(tokenStore.edgeToEdgeLandscape)
        private set

    var floatingCards: Boolean by mutableStateOf(tokenStore.floatingCardsEnabled)
        private set

    /** The desktop tag sidebar's pinning and the screen width, in px, from
     *  which it applies. A phone never pins it, but its Settings edits the
     *  account's choice like the web's own panel does. */
    var alwaysShowSidebarOnWide: Boolean by mutableStateOf(tokenStore.alwaysShowSidebarOnWide)
        private set

    var sidebarBreakpoint: Int by mutableStateOf(tokenStore.sidebarBreakpoint)
        private set

    var listView: Boolean by mutableStateOf(tokenStore.listView)
        private set

    var qrQuickEnabled: Boolean by mutableStateOf(tokenStore.qrQuickEnabled)
        private set

    /** Whether this account's AI assistant is on AND the administrator
     *  has not switched AI off server-wide. Cached for the same
     *  first-frame reason as the rest: the search field's own placeholder
     *  changes with it. */
    var aiAssistantEnabled: Boolean by mutableStateOf(tokenStore.aiAssistantEnabled)
        private set

    fun applyAiAssistant(enabled: Boolean) {
        aiAssistantEnabled = enabled
        tokenStore.aiAssistantEnabled = enabled
    }

    /**
     * Whether this account administers the instance, which is what gates
     * the header menu's "lock the instance" entry (NotesHeader.jsx:100).
     * Deliberately NOT cached, unlike everything above: it is a server
     * fact rather than a look-and-feel preference, and a stale copy would
     * offer an action the server would only refuse.
     */
    var isAdmin: Boolean by mutableStateOf(false)
        private set

    fun applyIsAdmin(admin: Boolean) {
        isAdmin = admin
    }

    /**
     * Whether the server reports a newer GlassKeep release, read once per
     * session for administrators (useUpdateCheck.js): the header's kebab
     * and admin entry then carry a green dot. Null until that read has
     * answered; like [isAdmin], a server fact, never cached.
     */
    var serverUpdateAvailable: Boolean? by mutableStateOf(null)
        private set

    fun applyServerUpdateAvailable(available: Boolean) {
        serverUpdateAvailable = available
    }

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

    fun applyQrQuick(enabled: Boolean) {
        qrQuickEnabled = enabled
        tokenStore.qrQuickEnabled = enabled
    }

    fun applyEdgeToEdgeLandscape(enabled: Boolean) {
        edgeToEdgeLandscape = enabled
        tokenStore.edgeToEdgeLandscape = enabled
    }

    fun applyFloatingCards(enabled: Boolean) {
        floatingCards = enabled
        tokenStore.floatingCardsEnabled = enabled
    }

    fun applyAlwaysShowSidebarOnWide(enabled: Boolean) {
        alwaysShowSidebarOnWide = enabled
        tokenStore.alwaysShowSidebarOnWide = enabled
    }

    /** Anything outside the web's own 600..3000 range falls back to the
     *  default, as its setSidebarBreakpoint does (App.jsx:239-244). */
    fun applySidebarBreakpoint(widthPx: Int) {
        val resolved = if (widthPx in 600..3000) widthPx else TokenStore.DEFAULT_SIDEBAR_BREAKPOINT
        sidebarBreakpoint = resolved
        tokenStore.sidebarBreakpoint = resolved
    }
}
