package com.glasskeep.app.nativeapp.data

/**
 * The account-wide preferences every screen reads at startup, fetched in
 * one GET /api/user/settings (see NotesRepository.fetchWorkspacePreferences).
 *
 * All three are server-synced on the web too, so a look chosen on a laptop
 * is the look this phone opens with, the same way the workspace theme
 * already worked before this type existed.
 */
data class WorkspacePreferences(
    val shellTheme: String?,
    val editorToolbarMode: String?,
    val typography: TypographyPresets,
)
