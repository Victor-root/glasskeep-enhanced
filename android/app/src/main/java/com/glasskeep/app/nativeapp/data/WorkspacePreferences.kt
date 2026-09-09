package com.glasskeep.app.nativeapp.data

/**
 * The account-wide preferences every screen reads at startup, fetched in
 * one GET /api/user/settings (see NotesRepository.fetchWorkspacePreferences).
 *
 * All of them are server-synced on the web too, so a look and a language
 * chosen on a laptop are what this phone opens with, the same way the
 * workspace theme already worked before this type existed.
 */
data class WorkspacePreferences(
    val shellTheme: String?,
    val editorToolbarMode: String?,
    val typography: TypographyPresets,
    /** The account's interface language ("en", "fr"), or null to follow
     *  the device. Lives on the profile rather than the settings blob. */
    val language: String?,
)
